import { CONTENT_TYPES, NOTE_IMAGE_BLOCK_TYPES, NOTE_MEDIA_BLOCK_TYPES, createEmptyContentRecord, deriveNoteDisplay, isContentType, normalizeContentType } from "./content-model.js";

function blockPayload(block) {
  if (!block || !block.type) {
    return {};
  }
  return block[block.type] || {};
}

function extractFileUrl(fileLike) {
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

function extractCaption(block) {
  const payload = blockPayload(block);
  if (!Array.isArray(payload.caption)) {
    return "";
  }
  return payload.caption.map((item) => item?.plain_text || "").join("").trim();
}

export function walkNotionBlocks(blocks = [], visitor, parentPath = []) {
  blocks.forEach((block, index) => {
    const path = [...parentPath, index];
    visitor(block, path);
    if (Array.isArray(block.children) && block.children.length) {
      walkNotionBlocks(block.children, visitor, path);
    }
  });
}

export function collectMediaFromBlocks(blocks = []) {
  const media = [];

  walkNotionBlocks(blocks, (block) => {
    if (!block?.type || !NOTE_MEDIA_BLOCK_TYPES.includes(block.type)) {
      return;
    }

    const payload = blockPayload(block);
    const url =
      block.type === "bookmark" || block.type === "embed" ? payload.url || "" : extractFileUrl(payload);

    if (!url) {
      return;
    }

    const kind = NOTE_IMAGE_BLOCK_TYPES.includes(block.type) ? "image" : block.type;
    media.push({
      kind,
      block_type: block.type,
      url,
      caption: extractCaption(block),
      source: "body",
      order: media.length,
    });
  });

  return media;
}

export function deriveNoteMediaFields(blocks = [], propertyCover = "") {
  const media = collectMediaFromBlocks(blocks);
  const images = media.filter((item) => item.kind === "image").map((item) => item.url);

  return {
    has_media: media.length > 0,
    media,
    images,
    cover: propertyCover || images[0] || "",
  };
}

export function buildContentIndexRecord({ pageId = "", properties = {}, blocks = [], lastEditedTime = "" } = {}) {
  const record = createEmptyContentRecord();
  const normalizedType = normalizeContentType(properties.type);
  const type = isContentType(normalizedType) ? normalizedType : CONTENT_TYPES.NOTE;

  const noteMedia =
    type === CONTENT_TYPES.NOTE
      ? deriveNoteMediaFields(blocks, properties.cover || "")
      : { has_media: false, media: [], images: [], cover: properties.cover || properties.page_cover || "" };

  Object.assign(record, {
    id: pageId,
    notion_page_id: pageId,
    slug: properties.slug || "",
    title: properties.title || "",
    type,
    status: properties.status || record.status,
    summary: properties.summary || "",
    tags: Array.isArray(properties.tags) ? properties.tags : [],
    category: properties.category || "",
    cover: noteMedia.cover || properties.cover || properties.page_cover || "",
    published_at: properties.published_at || "",
    featured: Boolean(properties.featured),
    pin: Boolean(properties.pin),
    signature: properties.signature || "",
    page_icon: properties.page_icon || "",
    has_media: noteMedia.has_media,
    images: noteMedia.images,
    media: noteMedia.media,
    source_updated_at: lastEditedTime,
  });

  if (type === CONTENT_TYPES.NOTE) {
    Object.assign(record, deriveNoteDisplay(record));
  }

  return record;
}

export function buildArticleDetailRecord({ indexRecord = null, blocks = [] } = {}) {
  if (!indexRecord) {
    return null;
  }

  return {
    ...indexRecord,
    blocks,
    renderer_version: 2,
  };
}
