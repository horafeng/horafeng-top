export async function loadEntries() {
  const response = await fetch("content/diaries.json");
  if (!response.ok) {
    throw new Error("Failed to load local diary content.");
  }
  const data = await response.json();
  return data.entries
    .slice()
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function linkify(text) {
  const safe = escapeHtml(text);
  const urlPattern = /(https?:\/\/[^\s]+)/g;
  return safe.replace(urlPattern, (url) => {
    const trimmed = url.replace(/[),.;!?]+$/g, "");
    const tail = url.slice(trimmed.length);
    return `<a href="${trimmed}" target="_blank" rel="noopener noreferrer">${trimmed}</a>${tail}`;
  });
}

export function getStats(entries) {
  const tags = new Map();
  const archives = new Map();

  entries.forEach((entry) => {
    entry.tags.forEach((tag) => {
      tags.set(tag, (tags.get(tag) || 0) + 1);
    });

    const month = entry.date.slice(0, 7);
    archives.set(month, (archives.get(month) || 0) + 1);
  });

  return { tags, archives };
}
