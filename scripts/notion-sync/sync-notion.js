import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PROJECT_ROOT, resolveNotionConfig } from "./env.js";
import { CONTENT_TYPES, isPublishedStatus, normalizeContentType } from "./content-model.js";
import { buildArticleDetailRecord, buildContentIndexRecord } from "./notion-transform.js";
import { fetchPageBlocksRecursively, extractTextLinesFromNormalizedBlocks, normalizeBlocks } from "./fetch-page-blocks.js";
import { normalizeDatabasePage } from "./fetch-database.js";
import { NotionClient, queryDatabasePages } from "./notion-client.js";

const GENERATED_DIR = path.join(PROJECT_ROOT, "content", "generated");
const ARTICLE_DETAILS_DIR = path.join(GENERATED_DIR, "articles");
const MEDIA_DIR = path.join(GENERATED_DIR, "media", "notion");

function log(message) {
  console.log(`[notion-sync] ${message}`);
}

function toDateOnly(value) {
  return String(value || "").slice(0, 10);
}

function safeSlug(value, fallback) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return normalized || fallback;
}

function sanitizeSegment(value, fallback = "asset") {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return normalized || fallback;
}

function isCacheableNotionAsset(url) {
  const value = String(url || "").trim();
  if (!value) {
    return false;
  }

  return /prod-files-secure\.s3\.[^/]+\.amazonaws\.com/i.test(value) || /secure\.notion-static\.com/i.test(value);
}

function getFileExtension(url, contentType = "") {
  try {
    const pathname = new URL(url).pathname;
    const ext = path.extname(pathname);
    if (ext) {
      return ext.toLowerCase();
    }
  } catch {
    // ignore
  }

  if (/image\/png/i.test(contentType)) return ".png";
  if (/image\/jpe?g/i.test(contentType)) return ".jpg";
  if (/image\/webp/i.test(contentType)) return ".webp";
  if (/image\/gif/i.test(contentType)) return ".gif";
  if (/video\/mp4/i.test(contentType)) return ".mp4";
  if (/application\/pdf/i.test(contentType)) return ".pdf";
  return ".bin";
}

function cloneBlocksWithLocalizedUrls(blocks = [], assetMap = new Map()) {
  return blocks.map((block) => {
    const next = {
      ...block,
      children: cloneBlocksWithLocalizedUrls(block.children || [], assetMap),
    };

    if (typeof next.url === "string" && assetMap.has(next.url)) {
      next.url = assetMap.get(next.url);
    }

    return next;
  });
}

function cloneRecordWithLocalizedUrls(record, assetMap = new Map()) {
  return {
    ...record,
    cover: assetMap.get(record.cover) || record.cover,
    images: Array.isArray(record.images) ? record.images.map((url) => assetMap.get(url) || url) : [],
    media: Array.isArray(record.media)
      ? record.media.map((item) => ({
          ...item,
          url: assetMap.get(item.url) || item.url,
        }))
      : [],
  };
}

async function cachePageAssets(client, record, blocks = []) {
  const urls = new Set();
  const assetMap = new Map();
  const pageSlug = sanitizeSegment(record.slug || record.id || record.notion_page_id || "page", "page");

  const collect = (url) => {
    if (isCacheableNotionAsset(url)) {
      urls.add(url);
    }
  };

  collect(record.cover);
  (record.images || []).forEach(collect);
  (record.media || []).forEach((item) => collect(item?.url));

  const walk = (items) => {
    items.forEach((block) => {
      collect(block?.url);
      if (Array.isArray(block?.children) && block.children.length) {
        walk(block.children);
      }
    });
  };
  walk(blocks);

  let assetIndex = 0;
  for (const url of urls) {
    assetIndex += 1;
    try {
      const downloaded = await client.downloadFile(url);
      const extension = getFileExtension(url, downloaded.contentType);
      const fileName = `${String(assetIndex).padStart(2, "0")}${extension}`;
      const pageDir = path.join(MEDIA_DIR, pageSlug);
      const filePath = path.join(pageDir, fileName);
      const publicPath = `content/generated/media/notion/${pageSlug}/${fileName}`;

      await mkdir(pageDir, { recursive: true });
      await writeFile(filePath, downloaded.buffer);
      assetMap.set(url, publicPath);
    } catch (error) {
      log(`跳过资源缓存：${record.title || record.id} -> ${url} (${error.message})`);
    }
  }

  return assetMap;
}

function buildCompatNoteEntry(record, normalizedBlocks, mood = "") {
  const lines = extractTextLinesFromNormalizedBlocks(normalizedBlocks).filter(Boolean);
  const date = toDateOnly(record.published_at);
  const compatId = `${date || "undated"}-${safeSlug(record.slug, record.id || "note")}`;

  return {
    id: compatId,
    date,
    mood: mood || "",
    title: record.title,
    tags: Array.isArray(record.tags) ? record.tags : [],
    images: Array.isArray(record.images) ? record.images : [],
    content: lines.length ? lines : record.summary ? [record.summary] : [record.title],
  };
}

function buildNoteOutput(record, normalizedBlocks, mood = "") {
  return {
    ...record,
    mood: mood || "",
    date: toDateOnly(record.published_at),
    content_lines: extractTextLinesFromNormalizedBlocks(normalizedBlocks),
    blocks: normalizedBlocks,
  };
}

async function writeJson(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function partitionByType(items = []) {
  return {
    notes: items.filter((item) => normalizeContentType(item.type) === CONTENT_TYPES.NOTE),
    articles: items.filter((item) => normalizeContentType(item.type) === CONTENT_TYPES.ARTICLE),
    notices: items.filter((item) => normalizeContentType(item.type) === CONTENT_TYPES.NOTICE),
  };
}

async function main() {
  const notion = resolveNotionConfig();
  const client = new NotionClient({ token: notion.token });

  log(`开始同步数据库 ${notion.databaseId}`);

  const pages = await queryDatabasePages(client, notion.databaseId, {
    filter: {
      property: "status",
      select: {
        equals: "published",
      },
    },
    sorts: [
      {
        property: "published_at",
        direction: "descending",
      },
    ],
  });

  log(`读取到 ${pages.length} 条数据库记录，开始转换`);

  const indexItems = [];
  const noteItems = [];
  const articleItems = [];
  const noticeItems = [];
  const compatNotes = [];

  for (const [index, page] of pages.entries()) {
    const pageData = normalizeDatabasePage(page);
    if (!isPublishedStatus(pageData.properties.status)) {
      continue;
    }

    log(`处理第 ${index + 1}/${pages.length} 条：${pageData.properties.title || pageData.pageId}`);

    const rawBlocks = await fetchPageBlocksRecursively(client, page.id);
    const normalizedBlocks = normalizeBlocks(rawBlocks);
    const builtRecord = buildContentIndexRecord({
      pageId: pageData.pageId,
      properties: pageData.properties,
      blocks: rawBlocks,
      lastEditedTime: pageData.lastEditedTime,
    });
    const assetMap = await cachePageAssets(client, builtRecord, normalizedBlocks);
    const indexRecord = cloneRecordWithLocalizedUrls(builtRecord, assetMap);
    const localizedBlocks = cloneBlocksWithLocalizedUrls(normalizedBlocks, assetMap);

    indexItems.push(indexRecord);

    if (normalizeContentType(indexRecord.type) === CONTENT_TYPES.NOTE) {
      const noteRecord = buildNoteOutput(indexRecord, localizedBlocks, pageData.properties.mood);
      noteItems.push(noteRecord);
      compatNotes.push(buildCompatNoteEntry(indexRecord, localizedBlocks, pageData.properties.mood));
      continue;
    }

    if (normalizeContentType(indexRecord.type) === CONTENT_TYPES.ARTICLE) {
      const detail = buildArticleDetailRecord({
        indexRecord,
        blocks: localizedBlocks,
      });
      const detailFileName = `${safeSlug(indexRecord.slug, indexRecord.id)}.json`;
      const detailPath = path.join(ARTICLE_DETAILS_DIR, detailFileName);
      const publicDetailPath = `content/generated/articles/${detailFileName}`;

      articleItems.push({
        ...indexRecord,
        detail_path: publicDetailPath,
      });

      await writeJson(detailPath, {
        generated_at: new Date().toISOString(),
        item: detail,
      });
      continue;
    }

    noticeItems.push({
      ...indexRecord,
      blocks: localizedBlocks,
    });
  }

  const generatedAt = new Date().toISOString();
  const partitionedIndex = partitionByType(indexItems);
  const finalNoteItems = noteItems.filter((item) => normalizeContentType(item.type) === CONTENT_TYPES.NOTE);
  const finalArticleItems = articleItems.filter((item) => normalizeContentType(item.type) === CONTENT_TYPES.ARTICLE);
  const finalNoticeItems = noticeItems.filter((item) => normalizeContentType(item.type) === CONTENT_TYPES.NOTICE);
  const finalCompatNotes = compatNotes.filter((item) => item && item.id);

  if (partitionedIndex.notes.length !== finalNoteItems.length) {
    throw new Error(
      `note 分类结果不一致：索引中 ${partitionedIndex.notes.length} 条，但 note 输出数组中 ${finalNoteItems.length} 条。已中止写入，请检查 type 解析与分类逻辑。`
    );
  }

  const counts = {
    total: indexItems.length,
    notes: finalNoteItems.length,
    articles: finalArticleItems.length,
    notices: finalNoticeItems.length,
  };

  await writeJson(path.join(GENERATED_DIR, "notion-index.json"), {
    generated_at: generatedAt,
    source: {
      database_id: notion.databaseId,
      database_url: notion.databaseUrl || "",
    },
    counts,
    items: indexItems,
  });

  await writeJson(path.join(GENERATED_DIR, "notion-notes.json"), {
    generated_at: generatedAt,
    source: {
      database_id: notion.databaseId,
    },
    total: finalNoteItems.length,
    items: finalNoteItems,
  });

  await writeJson(path.join(GENERATED_DIR, "notion-articles.json"), {
    generated_at: generatedAt,
    source: {
      database_id: notion.databaseId,
    },
    total: finalArticleItems.length,
    items: finalArticleItems,
  });

  await writeJson(path.join(GENERATED_DIR, "notion-notices.json"), {
    generated_at: generatedAt,
    source: {
      database_id: notion.databaseId,
    },
    total: finalNoticeItems.length,
    items: finalNoticeItems,
  });

  await writeJson(path.join(GENERATED_DIR, "notion-diaries-compat.json"), {
    generated_at: generatedAt,
    source: {
      database_id: notion.databaseId,
      compatibility_for: "content/diaries.json",
    },
    entries: finalCompatNotes,
  });

  log(`同步完成：${counts.notes} 条 note，${counts.articles} 条 article，${counts.notices} 条 notice`);
  log(`输出目录：${path.relative(PROJECT_ROOT, GENERATED_DIR)}`);
}

main().catch((error) => {
  console.error(`[notion-sync] 同步失败：${error.message}`);
  process.exitCode = 1;
});
