import { json, sanitizeSingleLine } from "../_lib/comments-utils.js";

const NOTION_API_BASE = "https://api.notion.com/v1";
const NOTION_API_VERSION = "2022-06-28";

function parseDatabaseId(value) {
  const input = sanitizeSingleLine(value || "", 400);
  if (!input) {
    return "";
  }

  const hyphenated = input.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
  if (hyphenated) {
    return hyphenated[0].toLowerCase();
  }

  const compact = input.match(/[0-9a-fA-F]{32}/);
  if (!compact) {
    return "";
  }

  const raw = compact[0].toLowerCase();
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`;
}

function getNotionConfig(env) {
  return {
    token: sanitizeSingleLine(env.NOTION_TOKEN || "", 500),
    databaseId: parseDatabaseId(env.NOTION_DATABASE_ID || "") || parseDatabaseId(env.NOTION_DATABASE_URL || ""),
  };
}

async function requestNotion(config, pathname, { method = "GET", body } = {}) {
  if (!config.token) {
    throw new Error("NOTION_TOKEN is not configured.");
  }

  const response = await fetch(`${NOTION_API_BASE}${pathname}`, {
    method,
    headers: {
      authorization: `Bearer ${config.token}`,
      "Notion-Version": NOTION_API_VERSION,
      "content-type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.message || `Notion API request failed with HTTP ${response.status}.`);
  }

  return payload;
}

function richTextToPlainText(items = []) {
  return (Array.isArray(items) ? items : [])
    .map((item) => String(item?.plain_text || ""))
    .join("")
    .trim();
}

function getTitle(properties = {}) {
  for (const value of Object.values(properties)) {
    if (value?.type === "title") {
      return richTextToPlainText(value.title || []);
    }
  }
  return "";
}

function getRichText(properties = {}, names = []) {
  for (const name of names) {
    const value = properties?.[name];
    if (value?.type === "rich_text") {
      const text = richTextToPlainText(value.rich_text || []);
      if (text) {
        return text;
      }
    }
  }
  return "";
}

function normalizeExternalUrl(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }

  if (/^(https?:)?\/\//i.test(text) || /^data:/i.test(text)) {
    return text.startsWith("//") ? `https:${text}` : text;
  }

  if (/^[\w.-]+\.[a-z]{2,}(?:[/?#].*)?$/i.test(text)) {
    return `https://${text}`;
  }

  return text;
}

function inferSiteNameFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

function normalizeFriendFieldLabel(label) {
  return String(label || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function mapFriendField(label) {
  const normalized = normalizeFriendFieldLabel(label);
  if (!normalized) {
    return "";
  }

  if (
    [
      "\u535a\u5ba2\u540d\u79f0",
      "\u7f51\u7ad9\u540d\u79f0",
      "\u7f51\u9875\u540d\u79f0",
      "\u540d\u79f0",
      "name",
      "title",
      "sitename",
    ].includes(normalized)
  ) {
    return "name";
  }

  if (
    [
      "\u535a\u5ba2url",
      "\u7f51\u7ad9url",
      "\u7f51\u9875url",
      "\u94fe\u63a5",
      "\u7f51\u5740",
      "url",
      "link",
    ].includes(normalized)
  ) {
    return "url";
  }

  if (
    [
      "\u535a\u5ba2logo",
      "\u7f51\u7ad9logo",
      "\u7f51\u9875logo",
      "\u5934\u50cf",
      "\u56fe\u6807",
      "logo",
      "avatar",
      "icon",
    ].includes(normalized)
  ) {
    return "avatar";
  }

  if (
    [
      "\u535a\u5ba2\u7b80\u4ecb",
      "\u7f51\u7ad9\u7b80\u4ecb",
      "\u7f51\u9875\u7b80\u4ecb",
      "\u7b80\u4ecb",
      "\u63cf\u8ff0",
      "\u7b7e\u540d",
      "summary",
      "description",
      "intro",
      "signature",
      "descr",
    ].includes(normalized)
  ) {
    return "signature";
  }

  return "";
}

function hasFriendDraftContent(draft = {}) {
  return ["name", "url", "avatar", "signature"].some((key) => String(draft?.[key] || "").trim());
}

function unwrapMarkdownLink(value) {
  const text = String(value || "").trim();
  const matched = text.match(/^\[(.+)\]\((https?:\/\/[^)]+)\)$/i);
  if (!matched) {
    return text;
  }
  return matched[2].trim() || matched[1].trim();
}

function finalizeFriendDraft(draft = {}) {
  const url = normalizeExternalUrl(draft.url);
  if (!url) {
    return null;
  }

  const name = String(draft.name || "").trim() || inferSiteNameFromUrl(url) || url;
  const avatar = normalizeExternalUrl(draft.avatar);
  const signature = String(draft.signature || "").trim();

  return {
    name,
    siteName: name,
    url,
    avatar,
    signature,
    description: signature,
  };
}

function extractBlockText(block = {}) {
  const payload = block?.type ? block[block.type] || {} : {};

  if (Array.isArray(payload.rich_text)) {
    return richTextToPlainText(payload.rich_text);
  }

  if (typeof payload.url === "string" && payload.url.trim()) {
    return payload.url.trim();
  }

  return "";
}

async function listBlockChildren(config, blockId) {
  const items = [];
  let cursor = "";

  do {
    const suffix = cursor ? `?start_cursor=${encodeURIComponent(cursor)}` : "";
    const payload = await requestNotion(config, `/blocks/${encodeURIComponent(blockId)}/children${suffix}`);
    items.push(...(Array.isArray(payload?.results) ? payload.results : []));
    cursor = payload?.has_more ? String(payload?.next_cursor || "") : "";
  } while (cursor);

  return items;
}

async function fetchPageBlocksRecursively(config, blockId) {
  const blocks = await listBlockChildren(config, blockId);
  const withChildren = [];

  for (const block of blocks) {
    const next = { ...block };
    if (block?.has_children) {
      next.children = await fetchPageBlocksRecursively(config, block.id);
    }
    withChildren.push(next);
  }

  return withChildren;
}

function extractTextLinesFromBlocks(blocks = []) {
  const lines = [];

  function walk(items) {
    for (const block of items) {
      const text = extractBlockText(block);
      if (text) {
        lines.push(...text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
      }
      if (Array.isArray(block?.children) && block.children.length) {
        walk(block.children);
      }
    }
  }

  walk(blocks);
  return lines;
}

function parseFriendsFromLines(lines = [], { title = "", intro = "" } = {}) {
  const items = [];
  let draft = {};

  for (const line of lines) {
    const matched = String(line || "").match(/^([^:\uFF1A]+)[:\uFF1A]\s*(.*)$/);
    if (!matched) {
      continue;
    }

    const field = mapFriendField(matched[1]);
    if (!field) {
      continue;
    }

    if (field === "name" && hasFriendDraftContent(draft)) {
      const item = finalizeFriendDraft(draft);
      if (item) {
        items.push(item);
      }
      draft = {};
    }

    draft[field] = unwrapMarkdownLink(matched[2].trim());
  }

  if (hasFriendDraftContent(draft)) {
    const item = finalizeFriendDraft(draft);
    if (item) {
      items.push(item);
    }
  }

  return {
    title: String(title || "").trim() || "\u53cb\u94fe",
    intro: String(intro || "").trim() || "\u628a\u559c\u6b22\u7684\u535a\u5ba2\u4e0e\u957f\u671f\u60f3\u56de\u8bbf\u7684\u7f51\u7ad9\u6574\u7406\u5728\u8fd9\u91cc\u3002",
    items,
  };
}

async function getPublishedFriendsPage(config) {
  if (!config.databaseId) {
    throw new Error("NOTION_DATABASE_ID or NOTION_DATABASE_URL is not configured.");
  }

  const payload = await requestNotion(config, `/databases/${encodeURIComponent(config.databaseId)}/query`, {
    method: "POST",
    body: {
      page_size: 10,
      filter: {
        and: [
          {
            property: "status",
            select: {
              equals: "published",
            },
          },
          {
            property: "type",
            select: {
              equals: "friends",
            },
          },
        ],
      },
      sorts: [
        {
          timestamp: "last_edited_time",
          direction: "descending",
        },
      ],
    },
  });

  const page = Array.isArray(payload?.results) ? payload.results[0] : null;
  if (!page?.id) {
    return null;
  }

  return page;
}

export async function onRequestGet(context) {
  try {
    const config = getNotionConfig(context.env);
    const page = await getPublishedFriendsPage(config);

    if (!page) {
      return json({
        ok: true,
        title: "\u53cb\u94fe",
        intro: "\u628a\u559c\u6b22\u7684\u535a\u5ba2\u4e0e\u957f\u671f\u60f3\u56de\u8bbf\u7684\u7f51\u7ad9\u6574\u7406\u5728\u8fd9\u91cc\u3002",
        total: 0,
        items: [],
      });
    }

    const properties = page.properties || {};
    const blocks = await fetchPageBlocksRecursively(config, page.id);
    const data = parseFriendsFromLines(extractTextLinesFromBlocks(blocks), {
      title: getTitle(properties),
      intro: getRichText(properties, ["summary", "Summary", "signature", "Signature"]),
    });

    return json(
      {
        ok: true,
        source: {
          type: "notion-api",
          page_id: page.id,
          last_edited_time: page.last_edited_time || "",
        },
        title: data.title,
        intro: data.intro,
        total: data.items.length,
        items: data.items,
      },
      200,
      {
        "cache-control": "public, max-age=120, s-maxage=120",
      },
    );
  } catch (error) {
    return json(
      {
        ok: false,
        message: error.message || "Failed to load friends from Notion.",
      },
      500,
    );
  }
}
