import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { PROJECT_ROOT, resolveNotionConfig } from "./env.js";
import { CONTENT_TYPES, isPublishedStatus, normalizeContentType } from "./content-model.js";
import { buildArticleDetailRecord, buildContentIndexRecord } from "./notion-transform.js";
import { fetchPageBlocksRecursively, extractTextLinesFromNormalizedBlocks, normalizeBlocks } from "./fetch-page-blocks.js";
import { normalizeDatabasePage } from "./fetch-database.js";
import { NotionClient, queryDatabasePages, retrieveDatabase } from "./notion-client.js";

const GENERATED_DIR = path.join(PROJECT_ROOT, "content", "generated");
const ARTICLE_DETAILS_DIR = path.join(GENERATED_DIR, "articles");
const MEDIA_DIR = path.join(GENERATED_DIR, "media", "notion");
const PROFILE_MEDIA_DIR = path.join(MEDIA_DIR, "profile");
const SITE_CONFIG_PATH = path.join(PROJECT_ROOT, "content", "site.json");
const SITE_ORIGIN = String(process.env.SITE_ORIGIN || "https://horafeng.top").replace(/\/+$/, "");
const BOOKMARK_FETCH_TIMEOUT_MS = 8000;
const LEGACY_AI_SIGNATURE = "这里是我的轻日记与生活记事。";

function log(message) {
  console.log(`[notion-sync] ${message}`);
}

function toDateOnly(value) {
  return String(value || "").slice(0, 10);
}

function richTextToPlainText(items = []) {
  return (Array.isArray(items) ? items : [])
    .map((item) => String(item?.plain_text || ""))
    .join("")
    .trim();
}

function toIsoDate(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }
  const timestamp = Date.parse(text);
  if (Number.isNaN(timestamp)) {
    return "";
  }
  return new Date(timestamp).toISOString();
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

function toAbsoluteSiteUrl(input) {
  const value = String(input || "").trim();
  if (!value) {
    return "";
  }

  if (/^https?:\/\//i.test(value) || /^data:/i.test(value)) {
    return value;
  }

  return `${SITE_ORIGIN}/${value.replace(/^\/+/, "")}`;
}

function makeEmojiDataUrl(emoji) {
  const value = String(emoji || "").trim();
  if (!value) {
    return "";
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><rect width="100%" height="100%" rx="80" fill="#f4f6fa"/><text x="50%" y="54%" font-size="92" text-anchor="middle" dominant-baseline="middle">${value}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function extractIconUrl(icon) {
  if (!icon) {
    return "";
  }
  if (icon.type === "external") {
    return icon.external?.url || "";
  }
  if (icon.type === "file") {
    return icon.file?.url || "";
  }
  if (icon.type === "emoji") {
    return makeEmojiDataUrl(icon.emoji);
  }
  return "";
}

function resolveProfileFromDatabaseMeta(databaseMeta = {}) {
  return {
    avatar: extractIconUrl(databaseMeta.icon),
    signature: richTextToPlainText(databaseMeta.description || []),
  };
}

async function persistProfileAvatar(client, avatarUrl) {
  const source = String(avatarUrl || "").trim();
  if (!source) {
    return "";
  }

  if (/^data:image\/svg\+xml/i.test(source)) {
    const payload = source.split(",", 2)[1] || "";
    const svg = decodeURIComponent(payload);
    const fileName = "avatar.svg";
    const filePath = path.join(PROFILE_MEDIA_DIR, fileName);
    await mkdir(PROFILE_MEDIA_DIR, { recursive: true });
    await writeFile(filePath, svg, "utf8");
    return `content/generated/media/notion/profile/${fileName}`;
  }

  if (!/^https?:\/\//i.test(source)) {
    return source;
  }

  try {
    const downloaded = await client.downloadFile(source);
    const extension = getFileExtension(source, downloaded.contentType);
    const fileName = `avatar${extension}`;
    const filePath = path.join(PROFILE_MEDIA_DIR, fileName);
    await mkdir(PROFILE_MEDIA_DIR, { recursive: true });
    await writeFile(filePath, downloaded.buffer);
    return `content/generated/media/notion/profile/${fileName}`;
  } catch (error) {
    log(`skip profile avatar cache: ${error.message}`);
    return source;
  }
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
  if (/image\/svg\+xml/i.test(contentType)) return ".svg";
  if (/video\/mp4/i.test(contentType)) return ".mp4";
  if (/application\/pdf/i.test(contentType)) return ".pdf";
  return ".bin";
}

function collectCacheableUrls(value, urls = new Set()) {
  if (typeof value === "string") {
    if (isCacheableNotionAsset(value)) {
      urls.add(value);
    }
    return urls;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectCacheableUrls(item, urls));
    return urls;
  }

  if (value && typeof value === "object") {
    Object.values(value).forEach((item) => collectCacheableUrls(item, urls));
  }

  return urls;
}

function localizeValue(value, assetMap = new Map()) {
  if (typeof value === "string") {
    return assetMap.get(value) || value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => localizeValue(item, assetMap));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, localizeValue(item, assetMap)]));
  }

  return value;
}

function decodeHtmlEntities(text) {
  return String(text || "")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&nbsp;/gi, " ");
}

function stripTags(text) {
  return decodeHtmlEntities(String(text || "").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function resolveUrl(candidate, baseUrl) {
  const value = String(candidate || "").trim();
  if (!value) {
    return "";
  }

  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return "";
  }
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function readMetaContent(html, selectors = []) {
  for (const selector of selectors) {
    const pattern = new RegExp(`<meta[^>]+(?:property|name)=["']${escapeRegExp(selector)}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i");
    const reversePattern = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escapeRegExp(selector)}["'][^>]*>`, "i");
    const matched = html.match(pattern) || html.match(reversePattern);
    if (matched?.[1]) {
      return stripTags(matched[1]);
    }
  }

  return "";
}

function readLinkHref(html, relValue) {
  const pattern = new RegExp(`<link[^>]+rel=["'][^"']*${escapeRegExp(relValue)}[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>`, "i");
  const reversePattern = new RegExp(`<link[^>]+href=["']([^"']+)["'][^>]+rel=["'][^"']*${escapeRegExp(relValue)}[^"']*["'][^>]*>`, "i");
  const matched = html.match(pattern) || html.match(reversePattern);
  return matched?.[1] ? matched[1].trim() : "";
}

function readTitle(html) {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "";
  return stripTags(title);
}

function withTimeout(promise, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timeout);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeout);
        reject(error);
      });
  });
}

function inferSiteNameFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

async function fetchBookmarkMetadata(url) {
  const href = String(url || "").trim();
  if (!href) {
    return null;
  }

  try {
    const response = await withTimeout(
      fetch(href, {
        headers: {
          "user-agent": "HoraFeng-NotionSync/1.0 (+https://horafeng.top)",
          accept: "text/html,application/xhtml+xml",
        },
        redirect: "follow",
      }),
      BOOKMARK_FETCH_TIMEOUT_MS,
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const contentType = response.headers.get("content-type") || "";
    if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) {
      return {
        url: response.url || href,
        title: "",
        description: "",
        site_name: inferSiteNameFromUrl(response.url || href),
        image: "",
        icon: "",
      };
    }

    const html = await response.text();
    const finalUrl = response.url || href;
    const title = readMetaContent(html, ["og:title", "twitter:title"]) || readTitle(html);
    const description = readMetaContent(html, ["og:description", "twitter:description", "description"]);
    const siteName = readMetaContent(html, ["og:site_name", "application-name"]) || inferSiteNameFromUrl(finalUrl);
    const image = resolveUrl(readMetaContent(html, ["og:image", "twitter:image", "twitter:image:src"]), finalUrl);
    const icon =
      resolveUrl(readLinkHref(html, "icon"), finalUrl) ||
      resolveUrl(readLinkHref(html, "shortcut icon"), finalUrl) ||
      resolveUrl("/favicon.ico", finalUrl);

    return {
      url: finalUrl,
      title,
      description,
      site_name: siteName,
      image,
      icon,
    };
  } catch (error) {
    log(`skip bookmark metadata: ${href} (${error.message})`);
    return null;
  }
}

function getEmbedMetadata(url) {
  const href = String(url || "").trim();
  if (!href) {
    return {
      provider: "",
      embed_url: "",
    };
  }

  try {
    const parsed = new URL(href);
    const hostname = parsed.hostname.replace(/^www\./i, "").toLowerCase();

    if (hostname.includes("youtube.com")) {
      if (parsed.pathname.startsWith("/embed/")) {
        return {
          provider: "youtube",
          embed_url: `https://www.youtube.com${parsed.pathname}${parsed.search ? `${parsed.search}&autoplay=0&rel=0` : "?autoplay=0&rel=0"}`,
        };
      }

      const id = parsed.searchParams.get("v");
      if (id) {
        return {
          provider: "youtube",
          embed_url: `https://www.youtube.com/embed/${encodeURIComponent(id)}?autoplay=0&rel=0`,
        };
      }
    }

    if (hostname === "youtu.be") {
      const id = parsed.pathname.replace(/^\/+/, "");
      if (id) {
        return {
          provider: "youtube",
          embed_url: `https://www.youtube.com/embed/${encodeURIComponent(id)}?autoplay=0&rel=0`,
        };
      }
    }

    if (hostname.includes("vimeo.com")) {
      const id = parsed.pathname.split("/").filter(Boolean).pop();
      if (id) {
        return {
          provider: "vimeo",
          embed_url: `https://player.vimeo.com/video/${encodeURIComponent(id)}?autoplay=0`,
        };
      }
    }

    if (hostname.includes("bilibili.com")) {
      if (hostname.includes("player.bilibili.com")) {
        parsed.protocol = "https:";
        parsed.searchParams.set("autoplay", "0");
        return {
          provider: "bilibili",
          embed_url: parsed.toString(),
        };
      }

      const bvid = parsed.searchParams.get("bvid") || parsed.pathname.split("/").find((segment) => /^BV/i.test(segment));
      if (bvid) {
        return {
          provider: "bilibili",
          embed_url: `https://player.bilibili.com/player.html?isOutside=true&bvid=${encodeURIComponent(bvid)}&p=1&autoplay=0`,
        };
      }
    }

    if (hostname.includes("douyin.com")) {
      const segments = parsed.pathname.split("/").filter(Boolean);
      const videoIndex = segments.findIndex((segment) => segment === "video");
      const itemId = videoIndex >= 0 ? segments[videoIndex + 1] || "" : "";
      if (itemId) {
        return {
          provider: "douyin",
          embed_url: `https://www.douyin.com/video/${encodeURIComponent(itemId)}`,
        };
      }
    }
  } catch {
    return {
      provider: "",
      embed_url: "",
    };
  }

  return {
    provider: "",
    embed_url: "",
  };
}

async function enrichBlocks(blocks = [], bookmarkCache = new Map()) {
  const output = [];

  for (const block of blocks) {
    const next = {
      ...block,
      children: Array.isArray(block?.children) && block.children.length ? await enrichBlocks(block.children, bookmarkCache) : [],
    };

    if (next.type === "bookmark" || next.type === "link_preview") {
      if (!bookmarkCache.has(next.url)) {
        bookmarkCache.set(next.url, fetchBookmarkMetadata(next.url));
      }
      next.metadata = await bookmarkCache.get(next.url);
    }

    if (next.type === "embed") {
      const embedMeta = getEmbedMetadata(next.url);
      next.provider = embedMeta.provider;
      next.embed_url = embedMeta.embed_url;
    }

    output.push(next);
  }

  return output;
}

async function cachePageAssets(client, record, blocks = []) {
  const urls = collectCacheableUrls([record, blocks]);
  const assetMap = new Map();
  const pageSlug = sanitizeSegment(record.slug || record.id || record.notion_page_id || "page", "page");
  const pageDir = path.join(MEDIA_DIR, pageSlug);

  let assetIndex = 0;
  for (const url of urls) {
    assetIndex += 1;
    try {
      const downloaded = await client.downloadFile(url);
      const extension = getFileExtension(url, downloaded.contentType);
      const fileName = `${String(assetIndex).padStart(2, "0")}${extension}`;
      const filePath = path.join(pageDir, fileName);
      const publicPath = `content/generated/media/notion/${pageSlug}/${fileName}`;

      await mkdir(pageDir, { recursive: true });
      await writeFile(filePath, downloaded.buffer);
      assetMap.set(url, publicPath);
    } catch (error) {
      log(`skip asset cache: ${record.title || record.id} -> ${url} (${error.message})`);
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

async function readJson(filePath, fallback = {}) {
  try {
    const text = await readFile(filePath, "utf8");
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function buildSeoMeta({ title = "", description = "", image = "", url = "", type = "website" } = {}) {
  return {
    og_title: title,
    og_description: description,
    og_image: image,
    og_url: url,
    og_type: type,
    twitter_card: image ? "summary_large_image" : "summary",
    twitter_title: title,
    twitter_description: description,
    twitter_image: image,
  };
}

function isLikelyAiArticle(record = {}) {
  const title = String(record.title || "").toLowerCase();
  const summary = String(record.summary || "").toLowerCase();
  const tags = Array.isArray(record.tags) ? record.tags.map((tag) => String(tag || "").toLowerCase()) : [];
  const slug = String(record.slug || "").toLowerCase();
  const keywordPattern = /\b(ai|aigc|chatgpt|gpt|claude|gemini)\b|notionnext|auto[-\s]?generated|generated by ai/i;
  const keywordHit =
    keywordPattern.test(title) ||
    keywordPattern.test(summary) ||
    keywordPattern.test(slug) ||
    tags.some((tag) => keywordPattern.test(tag));

  return Boolean(record.ai_generated || keywordHit);
}

function partitionByType(items = []) {
  return {
    notes: items.filter((item) => normalizeContentType(item.type) === CONTENT_TYPES.NOTE),
    articles: items.filter((item) => normalizeContentType(item.type) === CONTENT_TYPES.ARTICLE),
    notices: items.filter((item) => normalizeContentType(item.type) === CONTENT_TYPES.NOTICE),
  };
}

export async function syncNotionContent() {
  const notion = resolveNotionConfig();
  const client = new NotionClient({ token: notion.token });

  log(`sync start for database ${notion.databaseId}`);

  const [databaseMeta, pages] = await Promise.all([
    retrieveDatabase(client, notion.databaseId).catch(() => ({})),
    queryDatabasePages(client, notion.databaseId, {
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
    }),
  ]);

  const databaseProfile = resolveProfileFromDatabaseMeta(databaseMeta);

  log(`loaded ${pages.length} database rows`);

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

    log(`processing ${index + 1}/${pages.length}: ${pageData.properties.title || pageData.pageId}`);

    const rawBlocks = await fetchPageBlocksRecursively(client, page.id);
    const normalizedBlocks = normalizeBlocks(rawBlocks);
    const enrichedBlocks = await enrichBlocks(normalizedBlocks);
    const builtRecord = buildContentIndexRecord({
      pageId: pageData.pageId,
      properties: pageData.properties,
      blocks: rawBlocks,
      lastEditedTime: pageData.lastEditedTime,
    });

    if (normalizeContentType(builtRecord.type) === CONTENT_TYPES.ARTICLE && isLikelyAiArticle({ ...builtRecord, ai_generated: pageData.properties.ai_generated })) {
      log(`skip ai article: ${builtRecord.title || builtRecord.slug || builtRecord.id}`);
      continue;
    }

    const assetMap = await cachePageAssets(client, builtRecord, enrichedBlocks);
    const indexRecord = localizeValue(builtRecord, assetMap);
    const localizedBlocks = localizeValue(enrichedBlocks, assetMap);

    indexItems.push(indexRecord);

    if (normalizeContentType(indexRecord.type) === CONTENT_TYPES.NOTE) {
      const noteRecord = buildNoteOutput(indexRecord, localizedBlocks, pageData.properties.mood);
      noteItems.push(noteRecord);
      compatNotes.push(buildCompatNoteEntry(indexRecord, localizedBlocks, pageData.properties.mood));
      continue;
    }

    if (normalizeContentType(indexRecord.type) === CONTENT_TYPES.ARTICLE) {
      const articleUrl = `${SITE_ORIGIN}/article.html?slug=${encodeURIComponent(indexRecord.slug)}`;
      const articleImage = toAbsoluteSiteUrl(indexRecord.cover || indexRecord.images?.[0] || indexRecord.page_icon || databaseProfile.avatar);
      const articleSeo = buildSeoMeta({
        title: indexRecord.title || "文章",
        description: indexRecord.summary || indexRecord.title || "",
        image: articleImage,
        url: articleUrl,
        type: "article",
      });
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
        seo: articleSeo,
      });

      await writeJson(detailPath, {
        generated_at: new Date().toISOString(),
        item: {
          ...detail,
          seo: articleSeo,
        },
      });
      continue;
    }

    noticeItems.push({
      ...indexRecord,
      content_lines: extractTextLinesFromNormalizedBlocks(localizedBlocks),
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
    throw new Error(`note partition mismatch: index=${partitionedIndex.notes.length}, output=${finalNoteItems.length}`);
  }

  const counts = {
    total: indexItems.length,
    notes: finalNoteItems.length,
    articles: finalArticleItems.length,
    notices: finalNoticeItems.length,
  };

  const currentSiteConfig = await readJson(SITE_CONFIG_PATH, {});
  const nextProfile = {
    ...(currentSiteConfig.profile || {}),
  };
  const cachedProfileAvatar = await persistProfileAvatar(client, databaseProfile.avatar);
  const syncedProfileAvatar = cachedProfileAvatar || databaseProfile.avatar || "";
  const syncedProfileSignature = String(databaseProfile.signature || "").trim();
  if (syncedProfileAvatar) {
    nextProfile.avatar = syncedProfileAvatar;
  }
  nextProfile.signature = syncedProfileSignature;
  if (String(nextProfile.bio || "").trim() === LEGACY_AI_SIGNATURE) {
    nextProfile.bio = "";
  }
  const nextSiteConfig = {
    ...currentSiteConfig,
    profile: nextProfile,
  };
  await writeJson(SITE_CONFIG_PATH, nextSiteConfig);

  const homeCover = toAbsoluteSiteUrl(syncedProfileAvatar || nextProfile.cover || indexItems[0]?.cover);
  const homeSeo = buildSeoMeta({
    title: `${nextProfile.name || "HoraFeng"} 的博客`,
    description: nextProfile.signature || nextProfile.bio || "欢迎来到我的博客。",
    image: homeCover,
    url: `${SITE_ORIGIN}/`,
    type: "website",
  });
  const seoItems = finalArticleItems.map((article) => ({
    slug: article.slug,
    updated_at: toIsoDate(article.source_updated_at || article.published_at),
    ...buildSeoMeta({
      title: article.title || "文章",
      description: article.summary || article.title || "",
      image: toAbsoluteSiteUrl(article.cover || article.images?.[0] || article.page_icon || syncedProfileAvatar),
      url: `${SITE_ORIGIN}/article.html?slug=${encodeURIComponent(article.slug)}`,
      type: "article",
    }),
  }));

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

  await writeJson(path.join(GENERATED_DIR, "notion-seo.json"), {
    generated_at: generatedAt,
    source: {
      database_id: notion.databaseId,
      site_origin: SITE_ORIGIN,
    },
    home: homeSeo,
    articles: seoItems,
  });

  log(`sync done: ${counts.notes} note, ${counts.articles} article, ${counts.notices} notice`);
  log(`output dir: ${path.relative(PROJECT_ROOT, GENERATED_DIR)}`);

  const keepDetails = new Set(finalArticleItems.map((item) => path.basename(String(item.detail_path || ""))).filter(Boolean));
  try {
    const currentFiles = await readdir(ARTICLE_DETAILS_DIR, { withFileTypes: true });
    await Promise.all(
      currentFiles
        .filter((entry) => entry.isFile() && entry.name.endsWith(".json") && !keepDetails.has(entry.name))
        .map((entry) => rm(path.join(ARTICLE_DETAILS_DIR, entry.name), { force: true })),
    );
  } catch {
    // ignore cleanup errors
  }

  return {
    generatedAt,
    counts,
    outputDir: GENERATED_DIR,
  };
}

syncNotionContent().catch((error) => {
  console.error(`[notion-sync] sync failed: ${error.message}`);
  process.exitCode = 1;
});
