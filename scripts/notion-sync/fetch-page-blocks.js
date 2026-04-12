import { listAllBlockChildren } from "./notion-client.js";

const TEXT_BLOCK_TYPES = new Set([
  "paragraph",
  "heading_1",
  "heading_2",
  "heading_3",
  "quote",
  "callout",
  "bulleted_list_item",
  "numbered_list_item",
  "to_do",
  "toggle",
  "code",
]);

function richTextToPlainText(items = []) {
  return (items || []).map((item) => item?.plain_text || "").join("").trim();
}

function fileObjectToUrl(fileLike) {
  if (!fileLike) {
    return "";
  }
  if (fileLike.type === "external") {
    return fileLike.external?.url || "";
  }
  if (fileLike.type === "file") {
    return fileLike.file?.url || "";
  }
  return "";
}

function normalizeCaption(payload) {
  return Array.isArray(payload?.caption) ? richTextToPlainText(payload.caption) : "";
}

export async function fetchPageBlocksRecursively(client, pageId) {
  async function walk(blockId) {
    const blocks = await listAllBlockChildren(client, blockId);
    const withChildren = [];

    for (const block of blocks) {
      if (block.has_children) {
        block.children = await walk(block.id);
      }
      withChildren.push(block);
    }

    return withChildren;
  }

  return walk(pageId);
}

export function normalizeBlock(block) {
  const payload = block?.type ? block[block.type] || {} : {};
  const base = {
    id: block.id,
    type: block.type,
    has_children: Boolean(block.has_children),
    children: Array.isArray(block.children) ? block.children.map(normalizeBlock) : [],
  };

  if (TEXT_BLOCK_TYPES.has(block.type)) {
    return {
      ...base,
      text: richTextToPlainText(payload.rich_text),
      rich_text: (payload.rich_text || []).map((item) => ({
        plain_text: item.plain_text || "",
        href: item.href || null,
        annotations: item.annotations || {},
      })),
      language: payload.language || "",
      checked: payload.checked ?? null,
      caption: normalizeCaption(payload),
    };
  }

  if (["image", "video", "file", "pdf"].includes(block.type)) {
    return {
      ...base,
      url: fileObjectToUrl(payload),
      source_type: payload.type || "",
      expires_at: payload.file?.expiry_time || "",
      caption: normalizeCaption(payload),
    };
  }

  if (["bookmark", "embed", "link_preview"].includes(block.type)) {
    return {
      ...base,
      url: payload.url || "",
      caption: normalizeCaption(payload),
    };
  }

  if (block.type === "divider" || block.type === "table_of_contents") {
    return base;
  }

  return {
    ...base,
    text: "",
  };
}

export function normalizeBlocks(blocks = []) {
  return blocks.map(normalizeBlock);
}

export function extractTextLinesFromNormalizedBlocks(blocks = []) {
  const lines = [];

  function walk(items) {
    for (const block of items) {
      if (typeof block.text === "string" && block.text.trim()) {
        lines.push(block.text.trim());
      } else if ((block.type === "bookmark" || block.type === "embed") && block.url) {
        lines.push(block.url);
      }

      if (Array.isArray(block.children) && block.children.length) {
        walk(block.children);
      }
    }
  }

  walk(blocks);
  return lines;
}
