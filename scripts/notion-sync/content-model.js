export const CONTENT_TYPES = Object.freeze({
  NOTE: "note",
  ARTICLE: "article",
  NOTICE: "notice",
});

export const CONTENT_STATUS = Object.freeze({
  DRAFT: "draft",
  REVIEW: "review",
  PUBLISHED: "published",
  ARCHIVED: "archived",
});

export const NOTION_DATABASE_FIELDS = Object.freeze({
  title: { notionType: "title", required: true },
  slug: { notionType: "rich_text", required: true },
  type: { notionType: "select", required: true },
  status: { notionType: "select", required: true },
  summary: { notionType: "rich_text", required: false },
  tags: { notionType: "multi_select", required: false },
  category: { notionType: "select", required: false },
  cover: { notionType: "files", required: false },
  published_at: { notionType: "date", required: true },
  featured: { notionType: "checkbox", required: false },
  pin: { notionType: "checkbox", required: false },
  signature: { notionType: "rich_text", required: false },
});

export const NOTE_IMAGE_BLOCK_TYPES = Object.freeze(["image"]);
export const NOTE_MEDIA_BLOCK_TYPES = Object.freeze(["image", "video", "file", "pdf", "embed", "bookmark"]);

export function normalizeContentType(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

export function isContentType(value) {
  return Object.values(CONTENT_TYPES).includes(normalizeContentType(value));
}

export function isPublishedStatus(value) {
  return value === CONTENT_STATUS.PUBLISHED;
}

export function createEmptyContentRecord() {
  return {
    id: "",
    notion_page_id: "",
    slug: "",
    title: "",
    type: CONTENT_TYPES.NOTE,
    status: CONTENT_STATUS.DRAFT,
    summary: "",
    tags: [],
    category: "",
    cover: "",
    published_at: "",
    featured: false,
    pin: false,
    signature: "",
    page_icon: "",
    has_media: false,
    images: [],
    media: [],
  };
}

export function deriveNoteDisplay(record = {}) {
  const images = Array.isArray(record.images) ? record.images : [];
  const hasImage = images.length > 0;

  return {
    has_image: hasImage,
    note_style: hasImage ? "note_with_media" : "note_plain",
    has_media: Boolean(record.has_media || hasImage),
    cover: record.cover || images[0] || "",
  };
}
