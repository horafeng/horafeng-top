export async function loadEntries() {
  const response = await fetch("content/diaries.json");
  if (!response.ok) {
    throw new Error("Failed to load local diary content.");
  }

  const data = await response.json();
  return data.entries
    .slice()
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .map((entry) => ({ ...entry, images: Array.isArray(entry.images) ? entry.images : [] }));
}

export async function loadSiteConfig() {
  const response = await fetch("content/site.json");
  if (!response.ok) {
    throw new Error("Failed to load site config.");
  }

  return response.json();
}

export function escapeHtml(text) {
  return String(text)
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
    entry.tags.forEach((tag) => tags.set(tag, (tags.get(tag) || 0) + 1));
    const month = entry.date.slice(0, 7);
    archives.set(month, (archives.get(month) || 0) + 1);
  });

  return { tags, archives };
}

export function formatLastSeen(isoString) {
  if (!isoString) {
    return "博主最近来过";
  }

  const now = Date.now();
  const date = new Date(isoString).getTime();
  if (Number.isNaN(date)) {
    return "博主最近来过";
  }

  const diffHours = Math.max(1, Math.floor((now - date) / (1000 * 60 * 60)));
  return `博主在 ${diffHours} 小时前来过`;
}

export function normalizeText(entry) {
  return `${entry.title} ${entry.tags.join(" ")} ${entry.content.join(" ")}`.toLowerCase();
}

export function searchEntries(entries, query) {
  const q = query.trim().toLowerCase();
  if (!q) {
    return entries;
  }

  return entries.filter((entry) => normalizeText(entry).includes(q));
}

export function setupSplash() {
  const splash = document.getElementById("splash-screen");
  if (!splash) {
    return;
  }

  const key = "horafeng-splash-played";
  const navigation = performance.getEntriesByType("navigation")[0];
  const navType = navigation?.type || "navigate";

  if (navType === "reload") {
    sessionStorage.removeItem(key);
  }

  if (sessionStorage.getItem(key)) {
    splash.remove();
    return;
  }

  document.body.classList.add("no-scroll");
  splash.classList.add("visible");
  sessionStorage.setItem(key, "1");

  window.setTimeout(() => {
    document.body.classList.remove("no-scroll");
    splash.remove();
  }, 1220);
}

export function renderMockComments(listEl, comments, limit = 10) {
  if (!listEl) {
    return;
  }

  const rows = (comments || []).slice(0, limit);
  if (!rows.length) {
    listEl.innerHTML = '<li class="subtle">评论区暂未开放。</li>';
    return;
  }

  listEl.innerHTML = rows
    .map((item) => `<li><p class="comment-author">${escapeHtml(item.nick || "访客")}</p><p class="comment-text">${escapeHtml(item.content || "")}</p></li>`)
    .join("");
}
