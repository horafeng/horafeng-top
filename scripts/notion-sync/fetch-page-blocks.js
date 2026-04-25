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

function normalizeRichText(items = []) {
  return (items || []).map((item) => ({
    type: item?.type || "text",
    plain_text: item?.plain_text || "",
    href: item?.href || null,
    annotations: item?.annotations || {},
    text: item?.text
      ? {
          content: item.text.content || "",
          link: item.text.link?.url || "",
        }
      : null,
    mention:
      item?.type === "mention"
        ? {
            type: item.mention?.type || "",
            plain_text: item.plain_text || "",
          }
        : null,
    equation:
      item?.type === "equation"
        ? {
            expression: item.equation?.expression || "",
          }
        : null,
  }));
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

function normalizeIcon(icon) {
  if (!icon) {
    return null;
  }

  if (icon.type === "emoji") {
    return {
      type: "emoji",
      emoji: icon.emoji || "",
      url: "",
    };
  }

  return {
    type: icon.type || "",
    emoji: "",
    url: fileObjectToUrl(icon),
  };
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

  if (block.type === "callout") {
    return {
      ...base,
      text: richTextToPlainText(payload.rich_text),
      rich_text: normalizeRichText(payload.rich_text),
      caption: normalizeCaption(payload),
      color: payload.color || "default",
      icon: normalizeIcon(payload.icon),
    };
  }

  if (TEXT_BLOCK_TYPES.has(block.type)) {
    return {
      ...base,
      text: richTextToPlainText(payload.rich_text),
      rich_text: normalizeRichText(payload.rich_text),
      is_toggleable: Boolean(payload.is_toggleable),
      language: payload.language || "",
      checked: payload.checked ?? null,
      caption: normalizeCaption(payload),
      color: payload.color || "default",
    };
  }

  if (["image", "video", "file", "pdf"].includes(block.type)) {
    return {
      ...base,
      url: fileObjectToUrl(payload),
      source_type: payload.type || "",
      expires_at: payload.file?.expiry_time || "",
      caption: normalizeCaption(payload),
      name: payload.name || "",
    };
  }

  if (["bookmark", "embed", "link_preview"].includes(block.type)) {
    return {
      ...base,
      url: payload.url || "",
      caption: normalizeCaption(payload),
      metadata: null,
      provider: "",
      embed_url: "",
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
