import { CONTENT_TYPES, normalizeContentType } from "./content-model.js";

function richTextToPlainText(items = []) {
  return (items || []).map((item) => item?.plain_text || "").join("").trim();
}

function firstPropertyByType(properties, type) {
  for (const value of Object.values(properties || {})) {
    if (value?.type === type) {
      return value;
    }
  }
  return null;
}

function propertyByName(properties, name) {
  return properties?.[name] || null;
}

function getTitle(properties) {
  const property = propertyByName(properties, "title") || firstPropertyByType(properties, "title");
  return property?.type === "title" ? richTextToPlainText(property.title) : "";
}

function getRichText(properties, name) {
  const property = propertyByName(properties, name);
  return property?.type === "rich_text" ? richTextToPlainText(property.rich_text) : "";
}

function getSelectName(properties, name) {
  const property = propertyByName(properties, name);
  if (property?.type === "select") {
    return property.select?.name || "";
  }
  if (property?.type === "status") {
    return property.status?.name || "";
  }
  return "";
}

function getCheckbox(properties, name) {
  const property = propertyByName(properties, name);
  return property?.type === "checkbox" ? Boolean(property.checkbox) : false;
}

function getDate(properties, name) {
  const property = propertyByName(properties, name);
  return property?.type === "date" ? property.date?.start || "" : "";
}

function getMultiSelect(properties, name) {
  const property = propertyByName(properties, name);
  return property?.type === "multi_select" ? (property.multi_select || []).map((item) => item.name).filter(Boolean) : [];
}

function getFilesUrl(properties, name) {
  const property = propertyByName(properties, name);
  if (property?.type !== "files") {
    return "";
  }

  const first = property.files?.[0];
  if (!first) {
    return "";
  }

  if (first.type === "external") {
    return first.external?.url || "";
  }

  if (first.type === "file") {
    return first.file?.url || "";
  }

  return "";
}

export function normalizeDatabasePage(page) {
  const properties = page.properties || {};
  const type = normalizeContentType(getSelectName(properties, "type")) || CONTENT_TYPES.NOTE;

  return {
    pageId: page.id,
    lastEditedTime: page.last_edited_time || "",
    url: page.url || "",
    properties: {
      title: getTitle(properties),
      slug: getRichText(properties, "slug"),
      type,
      status: getSelectName(properties, "status"),
      summary: getRichText(properties, "summary"),
      tags: getMultiSelect(properties, "tags"),
      category: getSelectName(properties, "category"),
      cover: getFilesUrl(properties, "cover"),
      published_at: getDate(properties, "published_at") || page.created_time || "",
      featured: getCheckbox(properties, "featured"),
      pin: getCheckbox(properties, "pin"),
      mood: getRichText(properties, "mood") || getSelectName(properties, "mood"),
    },
  };
}
