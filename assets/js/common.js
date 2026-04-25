function normalizeEntry(entry, source = "local") {
  const content = Array.isArray(entry?.content)
    ? entry.content
        .map((line) => String(line ?? "").trim())
        .filter(Boolean)
    : [];

  return {
    id: String(entry?.id ?? "").trim(),
    date: String(entry?.date ?? "").trim(),
    mood: String(entry?.mood ?? "").trim(),
    title: String(entry?.title ?? "").trim() || "\u672a\u547d\u540d\u968f\u7b14",
    tags: Array.isArray(entry?.tags)
      ? entry.tags
          .map((tag) => String(tag ?? "").trim())
          .filter(Boolean)
      : [],
    images: Array.isArray(entry?.images)
      ? entry.images
          .map((image) => String(image ?? "").trim())
          .filter(Boolean)
      : [],
    content,
    author: entry?.author ? String(entry.author).trim() : "",
    likes: Number.isFinite(entry?.likes) ? entry.likes : undefined,
    contentType: "note",
    source,
  };
}

function sitePath(path) {
  const normalized = String(path || "").trim();
  if (!normalized) {
    return "/";
  }

  return normalized.startsWith("/") ? normalized : `/${normalized.replace(/^\/+/, "")}`;
}

const SITE_START_AT = "2025-01-14T00:00:00+09:24";
const COPYRIGHT_START_YEAR = 2026;
const DEFAULT_SITE_BACKGROUND = "/assets/images/back.png";
let footerTimerId = null;
let footerStatsPromise = null;

function padDuration(value) {
  return String(Math.max(0, value)).padStart(2, "0");
}

function formatSiteUptime(startAt = SITE_START_AT) {
  const start = new Date(startAt).getTime();
  const now = Date.now();
  const diffSeconds = Math.max(0, Math.floor((now - start) / 1000));
  const days = Math.floor(diffSeconds / 86400);
  const hours = Math.floor((diffSeconds % 86400) / 3600);
  const minutes = Math.floor((diffSeconds % 3600) / 60);
  const seconds = diffSeconds % 60;
  return `${days}\u5929 ${padDuration(hours)}:${padDuration(minutes)}:${padDuration(seconds)}`;
}

function formatCopyrightYears() {
  const currentYear = new Date().getFullYear();
  if (currentYear <= COPYRIGHT_START_YEAR) {
    return String(COPYRIGHT_START_YEAR);
  }
  return `${COPYRIGHT_START_YEAR}-${currentYear}`;
}

function formatMetricNumber(value) {
  return new Intl.NumberFormat("zh-CN").format(Math.max(0, Number(value || 0)));
}

function readLocalVisitFallback() {
  try {
    const key = "hf-site-visit-fallback-v1";
    const nextValue = Number.parseInt(window.localStorage.getItem(key) || "0", 10) + 1;
    window.localStorage.setItem(key, String(nextValue));
    return nextValue;
  } catch {
    return 0;
  }
}

async function loadFooterStats() {
  if (!footerStatsPromise) {
    footerStatsPromise = (async () => {
      const [articles, stats] = await Promise.all([
        loadArticleIndex().catch(() => []),
        fetch("/api/site-stats?increment=1", { credentials: "same-origin" })
          .then((response) => (response.ok ? response.json() : null))
          .catch(() => null),
      ]);

      return {
        articleCount: Array.isArray(articles) ? articles.length : 0,
        pageviews: Number(stats?.pageviews || 0) || readLocalVisitFallback(),
      };
    })();
  }

  return footerStatsPromise;
}

function ensureGlobalFooter() {
  let footer = document.querySelector("[data-global-footer]");
  if (footer) {
    return footer;
  }

  footer = document.createElement("footer");
  footer.className = "site-footer";
  footer.setAttribute("data-global-footer", "1");
  footer.innerHTML = `
    <div class="site-footer-inner">
      <div class="site-footer-top">
        <a class="site-footer-icp" href="https://icp.gov.moe/?keyword=20250315" target="_blank" rel="noopener noreferrer">\u840cICP\u590720250315\u53f7</a>
        <span class="site-footer-copyright">&copy; <span data-site-copyright-years>${formatCopyrightYears()}</span> HoraFeng All Rights Reserved.</span>
      </div>
      <div class="site-footer-metrics">
        <span class="site-footer-metric">\u6587\u7ae0\u603b\u6570 <strong data-site-article-count>--</strong></span>
        <span class="site-footer-metric">\u8bbf\u95ee\u91cf <strong data-site-pageviews>--</strong></span>
        <span class="site-footer-metric">\u5c0f\u7ad9\u5df2\u8fd0\u884c <strong data-site-uptime>--</strong></span>
      </div>
    </div>
  `;

  const shell = document.querySelector(".app-shell");
  if (shell?.parentElement) {
    shell.insertAdjacentElement("afterend", footer);
  } else {
    document.body.appendChild(footer);
  }

  return footer;
}

function setupGlobalFooter() {
  const footer = ensureGlobalFooter();
  const uptime = footer.querySelector("[data-site-uptime]");
  const articleCount = footer.querySelector("[data-site-article-count]");
  const pageviews = footer.querySelector("[data-site-pageviews]");
  const copyrightYears = footer.querySelector("[data-site-copyright-years]");
  if (!(uptime instanceof HTMLElement)) {
    return;
  }

  const render = () => {
    uptime.textContent = formatSiteUptime();
    if (copyrightYears instanceof HTMLElement) {
      copyrightYears.textContent = formatCopyrightYears();
    }
  };

  render();
  if (footerTimerId) {
    window.clearInterval(footerTimerId);
  }
  footerTimerId = window.setInterval(render, 1000);

  void loadFooterStats().then((stats) => {
    if (articleCount instanceof HTMLElement) {
      articleCount.textContent = formatMetricNumber(stats.articleCount);
    }
    if (pageviews instanceof HTMLElement) {
      pageviews.textContent = formatMetricNumber(stats.pageviews);
    }
  });
}

function normalizeArticleEntry(entry, source = "notion-article") {
  const summary = String(entry?.summary ?? "").trim();
  const cover = String(entry?.cover ?? entry?.page_cover ?? entry?.seo?.og_image ?? "").trim();
  const publishedAt = String(entry?.published_at ?? entry?.date ?? "").trim();
  const title = String(entry?.title ?? "").trim() || "\u672a\u547d\u540d\u6587\u7ae0";

  return {
    id: String(entry?.id ?? entry?.slug ?? "").trim(),
    slug: String(entry?.slug ?? "").trim(),
    date: publishedAt,
    mood: "\ud83d\udcd8",
    title,
    tags: Array.isArray(entry?.tags)
      ? entry.tags
          .map((tag) => String(tag ?? "").trim())
          .filter(Boolean)
      : [],
    images: cover ? [cover] : [],
    content: summary ? [summary] : [],
    summary,
    category: String(entry?.category ?? "").trim(),
    detailPath: String(entry?.detail_path ?? "").trim(),
    cover,
    contentType: "article",
    source,
    hasCover: Boolean(cover),
  };
}

function normalizeNoticeEntry(entry, source = "notion-notice") {
  const publishedAt = String(entry?.published_at ?? entry?.date ?? entry?.created_time ?? "").trim();
  const updatedAt = String(entry?.source_updated_at ?? entry?.updated_at ?? entry?.last_edited_time ?? publishedAt).trim();
  const title = String(entry?.title ?? "").trim() || "\u516c\u544a";
  const summary = String(entry?.summary ?? "").trim();
  const directLines = Array.isArray(entry?.content)
    ? entry.content.map((line) => String(line ?? "").trim()).filter(Boolean)
    : [];
  const contentLines = Array.isArray(entry?.content_lines)
    ? entry.content_lines.map((line) => String(line ?? "").trim()).filter(Boolean)
    : [];
  const blockLines = Array.isArray(entry?.blocks)
    ? entry.blocks
        .map((block) => {
          if (typeof block?.text === "string" && block.text.trim()) {
            return block.text.trim();
          }
          if (Array.isArray(block?.rich_text)) {
            return block.rich_text.map((segment) => String(segment?.plain_text || "")).join("").trim();
          }
          return "";
        })
        .filter(Boolean)
    : [];
  const details = directLines.length ? directLines : contentLines.length ? contentLines : blockLines.length ? blockLines : summary ? [summary] : [];

  return {
    id: String(entry?.id ?? entry?.slug ?? title).trim(),
    slug: String(entry?.slug ?? "").trim(),
    title,
    date: publishedAt,
    updatedAt,
    content: details,
    source,
    status: String(entry?.status ?? "").trim().toLowerCase(),
    pin: Boolean(entry?.pin),
  };
}

function isAiLikeArticleEntry(entry = {}) {
  const title = String(entry?.title ?? "").toLowerCase();
  const summary = String(entry?.summary ?? "").toLowerCase();
  const tags = Array.isArray(entry?.tags)
    ? entry.tags.map((tag) => String(tag ?? "").toLowerCase())
    : [];
  const slug = String(entry?.slug ?? "").toLowerCase();

  const keywordPattern = /\[ai\]|\(ai\)|ai生成|aigc|自动生成|generated by ai|auto[-\s]?generated/i;
  const tagPattern = /^(ai|aigc|ai生成|自动生成)$/i;
  return (
    Boolean(entry?.ai_generated) ||
    keywordPattern.test(title) ||
    keywordPattern.test(summary) ||
    /(^|[-_])(ai|aigc|auto-generated)([-_]|$)/i.test(slug) ||
    tags.some((tag) => tagPattern.test(tag))
  );
}

function getEntryDedupKey(entry) {
  if (entry.contentType === "article" && entry.slug) {
    return `article:${entry.slug}`;
  }

  if (entry.id) {
    return `id:${entry.id}`;
  }

  return `fallback:${entry.date}|${entry.title}|${entry.content[0] || ""}`;
}

function mergeEntries(localEntries, notionEntries) {
  const merged = [];
  const seen = new Set();

  [...localEntries, ...notionEntries].forEach((entry) => {
    const contentType = String(entry?.contentType || entry?.type || "")
      .trim()
      .toLowerCase();
    let normalized = null;

    if (contentType === "article") {
      normalized = normalizeArticleEntry(entry, entry?.source || "notion-article");
    } else if (contentType === "notice") {
      const notice = normalizeNoticeEntry(entry, entry?.source || "notion-notice");
      normalized = {
        id: notice.id,
        slug: notice.slug,
        date: notice.date,
        mood: "📢",
        title: notice.title,
        tags: Array.isArray(entry?.tags) ? entry.tags.map((tag) => String(tag || "").trim()).filter(Boolean) : [],
        images: [],
        content: notice.content,
        summary: notice.content[0] || "",
        category: String(entry?.category || "公告").trim(),
        contentType: "notice",
        source: notice.source,
        pin: notice.pin,
      };
    } else {
      normalized = normalizeEntry(entry, entry?.source || "local");
    }

    const dedupKey = getEntryDedupKey(normalized);
    if (seen.has(dedupKey)) {
      return;
    }

    seen.add(dedupKey);
    merged.push(normalized);
  });

  return merged.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

async function fetchJson(url, errorMessage) {
  const response = await fetch(sitePath(url));
  if (!response.ok) {
    throw new Error(errorMessage);
  }

  return response.json();
}

async function fetchOptionalEntries(url) {
  try {
    const response = await fetch(sitePath(url));
    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    return Array.isArray(data?.entries) ? data.entries : [];
  } catch (_error) {
    return [];
  }
}

async function fetchOptionalItems(url) {
  try {
    const response = await fetch(sitePath(url));
    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    return Array.isArray(data?.items) ? data.items : [];
  } catch (_error) {
    return [];
  }
}

export async function loadRecentComments(limit = 10) {
  try {
    const response = await fetch(`/api/comments?recent=1&limit=${encodeURIComponent(limit)}`);
    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    return Array.isArray(data?.items) ? data.items : [];
  } catch (_error) {
    return [];
  }
}

export async function loadEntries() {
  const [localData, notionEntries] = await Promise.all([
    fetchJson("content/diaries.json", "Failed to load local diary content."),
    fetchOptionalEntries("content/generated/notion-diaries-compat.json"),
  ]);

  const localEntries = Array.isArray(localData?.entries) ? localData.entries : [];
  const notionCompatEntries = notionEntries.map((entry) => ({ ...entry, source: "notion" }));
  if (notionCompatEntries.length) {
    return mergeEntries([], notionCompatEntries);
  }

  return mergeEntries(localEntries, []);
}

export async function loadHomeFeed() {
  const [entries, notionArticles, notionIndex, notionNotices] = await Promise.all([
    loadEntries(),
    fetchOptionalItems("content/generated/notion-articles.json"),
    fetchOptionalItems("content/generated/notion-index.json"),
    fetchOptionalItems("content/generated/notion-notices.json"),
  ]);

  const indexArticles = notionIndex.filter((item) => String(item?.type ?? "").trim().toLowerCase() === "article");
  const articleEntries = [...notionArticles, ...indexArticles]
    .filter((item) => String(item?.status ?? "").trim().toLowerCase() === "published")
    .filter((item) => !isAiLikeArticleEntry(item))
    .map((item) => normalizeArticleEntry(item));

  const noticeEntries = notionNotices
    .filter((item) => String(item?.status ?? "").trim().toLowerCase() === "published")
    .map((item) => {
      const notice = normalizeNoticeEntry(item);
      return {
        id: notice.id,
        slug: notice.slug,
        date: notice.date,
        updatedAt: notice.updatedAt,
        mood: "📢",
        title: notice.title,
        tags: Array.isArray(item?.tags) ? item.tags.map((tag) => String(tag || "").trim()).filter(Boolean) : [],
        images: [],
        content: notice.content,
        summary: notice.content[0] || "",
        category: String(item?.category || "公告").trim(),
        contentType: "notice",
        source: notice.source,
        pin: notice.pin,
      };
    });

  return mergeEntries(
    entries.map((entry) => ({ ...entry, contentType: entry.contentType || "note" })),
    [...articleEntries, ...noticeEntries],
  );
}

export async function loadArticleIndex() {
  const [items, notionIndex] = await Promise.all([
    fetchOptionalItems("content/generated/notion-articles.json"),
    fetchOptionalItems("content/generated/notion-index.json"),
  ]);
  return [...items, ...notionIndex.filter((item) => String(item?.type ?? "").trim().toLowerCase() === "article")]
    .filter((item) => String(item?.status ?? "").trim().toLowerCase() === "published")
    .filter((item) => !isAiLikeArticleEntry(item))
    .map((item) => normalizeArticleEntry(item))
    .filter((item, index, array) => array.findIndex((candidate) => candidate.slug === item.slug) === index);
}

export async function loadNoticeIndex() {
  const items = await fetchOptionalItems("content/generated/notion-notices.json");
  return items
    .map((item) => normalizeNoticeEntry(item))
    .filter((item) => !item.status || item.status === "published")
    .sort((a, b) => {
      if (Boolean(a.pin) !== Boolean(b.pin)) {
        return a.pin ? -1 : 1;
      }
      const updatedDiff = new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime();
      if (updatedDiff !== 0) {
        return updatedDiff;
      }
      return new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime();
    });
}

export async function loadArticleDetail(slug) {
  const articleSlug = String(slug ?? "").trim();
  if (!articleSlug) {
    throw new Error("Missing article slug.");
  }

  const index = await loadArticleIndex();
  const matched = index.find((item) => item.slug === articleSlug);
  if (!matched || !matched.detailPath) {
    throw new Error("Article detail is unavailable.");
  }

  const detail = await fetchJson(matched.detailPath, "Failed to load article detail.");
  if (!detail?.item) {
    throw new Error("Article detail payload is invalid.");
  }

  return {
    meta: matched,
    item: detail.item,
  };
}

export async function loadSiteConfig() {
  const response = await fetch(sitePath("content/site.json"));
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
    return "\u535a\u4e3b\u6700\u8fd1\u6765\u8fc7";
  }

  const now = Date.now();
  const date = new Date(isoString).getTime();
  if (Number.isNaN(date)) {
    return "\u535a\u4e3b\u6700\u8fd1\u6765\u8fc7";
  }

  const diffHours = Math.max(1, Math.floor((now - date) / (1000 * 60 * 60)));
  return `\u535a\u4e3b\u5728 ${diffHours} \u5c0f\u65f6\u524d\u6765\u8fc7`;
}

export function normalizeText(entry) {
  return `${entry.title} ${entry.tags.join(" ")} ${entry.content.join(" ")} ${entry.summary || ""} ${entry.category || ""}`.toLowerCase();
}

export function searchEntries(entries, query) {
  const q = query.trim().toLowerCase();
  if (!q) {
    return entries;
  }

  return entries.filter((entry) => normalizeText(entry).includes(q));
}

export function setupSplash() {
  setupGlobalFooter();

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

export function setupPageTransition() {
  const markerKey = "horafeng-page-transition";
  const enterFlag = sessionStorage.getItem(markerKey) === "1";
  const resetPageState = () => {
    document.body.classList.remove("page-entering", "page-enter-active", "page-leaving", "no-scroll");
  };

  if (enterFlag) {
    document.body.classList.add("page-entering");
    requestAnimationFrame(() => {
      document.body.classList.add("page-enter-active");
    });
    window.setTimeout(() => {
      document.body.classList.remove("page-entering", "page-enter-active");
      sessionStorage.removeItem(markerKey);
    }, 320);
  }

  window.addEventListener("pageshow", () => {
    resetPageState();
    sessionStorage.removeItem(markerKey);
  });

  window.addEventListener("pagehide", resetPageState);

  document.addEventListener("click", (event) => {
    const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
    if (!link) {
      return;
    }

    if (link.dataset.noTransition === "1") {
      return;
    }
    if (link.target && link.target !== "_self") {
      return;
    }
    if (link.hasAttribute("download")) {
      return;
    }
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }

    const nextUrl = new URL(link.href, window.location.href);
    if (nextUrl.origin !== window.location.origin) {
      return;
    }
    if (nextUrl.pathname === window.location.pathname && nextUrl.search === window.location.search) {
      return;
    }

    event.preventDefault();
    if (document.body.classList.contains("page-leaving")) {
      return;
    }

    document.body.classList.add("page-leaving");
    sessionStorage.setItem(markerKey, "1");
    window.setTimeout(() => {
      window.location.assign(nextUrl.toString());
    }, 180);
  });
}

function getMobileChromeNavItems() {
  const params = new URLSearchParams(window.location.search);
  const content = String(params.get("content") || "").trim().toLowerCase();
  const page = String(document.body.dataset.page || "").trim().toLowerCase();

  return [
    { href: sitePath("index.html"), label: "首页", active: page === "home" && !content },
    { href: `${sitePath("index.html")}?content=article`, label: "文章", active: (page === "home" && content === "article") || page === "article" },
    { href: `${sitePath("index.html")}?content=note`, label: "小记", active: page === "home" && content === "note" },
    { href: sitePath("archive.html"), label: "归档", active: page === "archive" },
    { href: `${sitePath("index.html")}?content=notice`, label: "公告", active: page === "home" && content === "notice" },
    { href: sitePath("guestbook.html"), label: "留言板", active: page === "guestbook" },
    { href: sitePath("friends/"), label: "友链", active: page === "friends" },
  ];
}

function renderMobileChromeProfile(profile = {}) {
  const name = profile.name || "HoraFeng";
  const handle = profile.handle || "@horafeng";
  const signature = profile.signature || "";
  const bio = profile.bio || "";
  const lastSeen = formatLastSeen(profile.lastSeenAt);
  const normalizeUrl = (value, fallback = "") => {
    const text = String(value || fallback || "").trim();
    if (!text) {
      return "";
    }
    if (/^(https?:)?\/\//i.test(text) || /^data:/i.test(text) || text.startsWith("/")) {
      return text;
    }
    return sitePath(text);
  };

  const avatar = normalizeUrl(profile.avatar, "assets/images/Profile.png");
  const cover = normalizeUrl(profile.cover);
  const github = profile.github || "https://github.com/horafeng";
  const email = profile.email || "horafeng@outlook.com";
  const navItems = getMobileChromeNavItems();

  return `
    <section class="mobile-drawer-card mobile-drawer-profile-card" aria-label="博主信息">
      <div class="profile-cover" style="background-image:url(${cover});background-size:cover;background-position:center;"></div>
      <div class="profile-main compact mobile-drawer-profile" aria-label="博主信息">
        <img class="profile-avatar" src="${avatar}" alt="博主头像" />
        <h1>${escapeHtml(name)}</h1>
        <p class="profile-handle">${escapeHtml(handle)}</p>
        <p class="subtle">${escapeHtml(signature)}</p>
        <p class="subtle">${escapeHtml(bio)}</p>
        <p class="last-seen subtle">${escapeHtml(lastSeen)}</p>
      </div>
      <div class="profile-actions compact" aria-label="联系方式">
        <a class="profile-action-btn profile-action-icon" href="${github}" target="_blank" rel="noreferrer" aria-label="GitHub" title="GitHub">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 2C6.48 2 2 6.58 2 12.22c0 4.5 2.87 8.32 6.84 9.66.5.09.68-.22.68-.49 0-.24-.01-1.04-.01-1.88-2.78.62-3.37-1.2-3.37-1.2-.46-1.18-1.11-1.49-1.11-1.49-.91-.64.07-.63.07-.63 1 .08 1.53 1.05 1.53 1.05.9 1.56 2.36 1.11 2.94.85.09-.67.35-1.11.63-1.37-2.22-.26-4.55-1.14-4.55-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.31.1-2.72 0 0 .84-.28 2.75 1.05A9.35 9.35 0 0 1 12 6.84c.85 0 1.71.12 2.51.35 1.91-1.33 2.75-1.05 2.75-1.05.55 1.41.2 2.46.1 2.72.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.8-4.57 5.06.36.32.69.95.69 1.93 0 1.39-.01 2.5-.01 2.84 0 .27.18.59.69.49A10.24 10.24 0 0 0 22 12.22C22 6.58 17.52 2 12 2Z" />
          </svg>
        </a>
        <a class="profile-action-btn profile-action-icon" href="mailto:${email}" aria-label="邮箱" title="邮箱">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 5.5h16A1.5 1.5 0 0 1 21.5 7v10A1.5 1.5 0 0 1 20 18.5H4A1.5 1.5 0 0 1 2.5 17V7A1.5 1.5 0 0 1 4 5.5Zm0 1.5v.18l8 5.34 8-5.34V7H4Zm16 10V8.96l-7.58 5.06a.75.75 0 0 1-.84 0L4 8.96V17h16Z" />
          </svg>
        </a>
      </div>
    </section>
    <section class="mobile-drawer-card mobile-drawer-nav-card" aria-label="手机端导航">
      <nav class="mobile-drawer-nav" aria-label="手机端侧栏导航">
        <div class="mobile-drawer-section-head">
          <span class="mobile-drawer-section-kicker">页面</span>
        </div>
        <div class="mobile-drawer-nav-list">
          ${navItems
            .slice(0, 4)
            .map(
              (item) => `
                <a class="mobile-drawer-nav-link${item.active ? " active" : ""}" href="${item.href}">
                  <span>${escapeHtml(item.label)}</span>
                </a>
              `,
            )
            .join("")}
        </div>
        <div class="mobile-drawer-secondary-list">
          ${navItems
            .slice(4)
            .map(
              (item) => `
                <a class="mobile-drawer-secondary-link${item.active ? " active" : ""}" href="${item.href}">
                  ${escapeHtml(item.label)}
                </a>
              `,
            )
            .join("")}
          <button class="mobile-drawer-secondary-link" type="button" data-mobile-search-trigger="1">搜索</button>
        </div>
      </nav>
    </section>
  `;
}

function ensureStandaloneMobileChrome(options = {}) {
  if (document.body.dataset.page === "home") {
    return null;
  }

  const nav = document.querySelector("[data-site-nav]");
  if (!nav) {
    return null;
  }

  let drawerOverlay = document.getElementById("mobile-drawer-overlay");
  if (!drawerOverlay) {
    drawerOverlay = document.createElement("div");
    drawerOverlay.id = "mobile-drawer-overlay";
    drawerOverlay.className = "mobile-drawer-overlay";
    drawerOverlay.hidden = true;
    drawerOverlay.innerHTML = `
      <aside id="mobile-drawer" class="mobile-drawer panel" aria-label="个人资料侧边栏">
        <button id="mobile-drawer-close" class="drawer-close" type="button" aria-label="关闭侧栏">关闭</button>
        <div id="mobile-profile-slot"></div>
      </aside>
    `;
    document.body.appendChild(drawerOverlay);
  }

  let searchOverlay = document.getElementById("mobile-search-overlay");
  if (!searchOverlay) {
    searchOverlay = document.createElement("div");
    searchOverlay.id = "mobile-search-overlay";
    searchOverlay.className = "mobile-search-overlay";
    searchOverlay.hidden = true;
    searchOverlay.innerHTML = `
      <div class="mobile-search-backdrop" data-close-mobile-search="1"></div>
      <section class="mobile-search-sheet" role="dialog" aria-modal="true" aria-labelledby="mobile-search-title">
        <div class="mobile-search-head">
          <h2 id="mobile-search-title">搜索</h2>
          <button id="mobile-search-close" class="mobile-search-close" type="button" aria-label="关闭搜索">×</button>
        </div>
        <form id="mobile-search-form" class="mobile-search-form" role="search">
          <input id="mobile-search-input" type="search" placeholder="搜索什么..." aria-label="搜索站内内容" />
          <button type="submit">搜索</button>
        </form>
        <div class="mobile-search-shortcuts" aria-label="快捷跳转">
          <a href="${sitePath("index.html")}">首页</a>
          <a href="${sitePath("index.html")}?content=article">文章</a>
          <a href="${sitePath("index.html")}?content=note">小记</a>
          <a href="${sitePath("index.html")}?content=notice">公告</a>
          <a href="${sitePath("guestbook.html")}">留言板</a>
          <a href="${sitePath("friends/")}">友链</a>
        </div>
      </section>
    `;
    document.body.appendChild(searchOverlay);
  }

  const mobileSlot = document.getElementById("mobile-profile-slot");
  const profile = options.profile || {};
  if (mobileSlot) {
    mobileSlot.innerHTML = renderMobileChromeProfile(profile);
  }

  const leftButton = nav.querySelector(".site-nav-left");
  const brandMini = nav.querySelector("[data-nav-brand-center]");
  const searchButton = nav.querySelector("[data-nav-backtop]");
  if (brandMini) {
    brandMini.textContent = "HoraFeng的博客";
  }

  const closeDrawer = () => {
    drawerOverlay.hidden = true;
    document.body.classList.remove("mobile-home-drawer-open");
  };

  const openDrawer = () => {
    drawerOverlay.hidden = false;
    document.body.classList.add("mobile-home-drawer-open");
    closeSearch();
  };

  const closeSearch = () => {
    searchOverlay.classList.remove("open");
    document.body.classList.remove("mobile-search-open");
    window.setTimeout(() => {
      if (!searchOverlay.classList.contains("open")) {
        searchOverlay.hidden = true;
      }
    }, 220);
  };

  const openSearch = () => {
    searchOverlay.hidden = false;
    requestAnimationFrame(() => {
      searchOverlay.classList.add("open");
      document.body.classList.add("mobile-search-open");
      document.getElementById("mobile-search-input")?.focus();
    });
    closeDrawer();
  };

  leftButton?.addEventListener("click", (event) => {
    if (!window.matchMedia("(max-width: 767px)").matches) {
      return;
    }
    event.preventDefault();
    openDrawer();
  });

  searchButton?.addEventListener("click", (event) => {
    if (!window.matchMedia("(max-width: 767px)").matches) {
      return;
    }
    event.preventDefault();
    openSearch();
  });

  document.getElementById("mobile-drawer-close")?.addEventListener("click", closeDrawer);
  drawerOverlay.addEventListener("click", (event) => {
    if (event.target === drawerOverlay) {
      closeDrawer();
      return;
    }

    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    if (target.closest("[data-mobile-search-trigger]")) {
      event.preventDefault();
      openSearch();
      return;
    }

    if (target.closest("a[href]")) {
      closeDrawer();
    }
  });

  document.getElementById("mobile-search-close")?.addEventListener("click", closeSearch);
  searchOverlay.addEventListener("click", (event) => {
    const target = event.target;
    if (target instanceof HTMLElement && target.dataset.closeMobileSearch === "1") {
      closeSearch();
    }
  });
  searchOverlay.querySelectorAll("a[href]").forEach((link) => {
    link.addEventListener("click", closeSearch);
  });

  document.getElementById("mobile-search-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const query = String(document.getElementById("mobile-search-input")?.value || "").trim();
    const nextUrl = new URL(sitePath("index.html"), window.location.origin);
    if (query) {
      nextUrl.searchParams.set("q", query);
    }
    window.location.assign(nextUrl.toString());
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeDrawer();
      closeSearch();
    }
  });

  return {
    updateProfile(nextProfile = {}) {
      if (mobileSlot) {
        mobileSlot.innerHTML = renderMobileChromeProfile(nextProfile);
      }
    },
  };
}

export function setupSiteChrome(options = {}) {
  const setupSeasonalBackground = () => {
    const now = new Date();
    const month = now.getMonth() + 1;
    const hour = now.getHours();
    const season = month >= 3 && month <= 5 ? "spring" : month >= 6 && month <= 8 ? "summer" : month >= 9 && month <= 11 ? "autumn" : "winter";
    const dayPeriod = hour >= 6 && hour < 18 ? "day" : "night";
    const configuredCover = String(options.profileCoverUrl || "").trim();
    const backgroundImage = configuredCover || DEFAULT_SITE_BACKGROUND;

    document.body.dataset.season = season;
    document.body.dataset.dayPeriod = dayPeriod;
    document.body.style.setProperty("--season-bg-image", `url("${backgroundImage}")`);
  };

  setupSeasonalBackground();
  const mobileChrome = ensureStandaloneMobileChrome({ profile: options.profile || null });
  if (!String(options.profileCoverUrl || "").trim()) {
    void loadSiteConfig()
      .then((config) => {
        const profileCoverUrl = String(config?.profile?.cover || "").trim();
        if (!profileCoverUrl) {
          return;
        }
        document.body.style.setProperty("--season-bg-image", `url("${profileCoverUrl}")`);
        mobileChrome?.updateProfile(config?.profile || {});
      })
      .catch(() => {});
  }

  const userAgent = navigator.userAgent || "";
  const androidMatch = userAgent.match(/Android\s+(\d+)/i);
  const chromeMatch = userAgent.match(/Chrome\/(\d+)/i);
  const androidMajor = androidMatch ? Number.parseInt(androidMatch[1], 10) : null;
  const chromeMajor = chromeMatch ? Number.parseInt(chromeMatch[1], 10) : null;
  const isLegacyBrowser = (androidMajor !== null && androidMajor <= 5) || (chromeMajor !== null && chromeMajor <= 88);
  if (isLegacyBrowser) {
    document.body.classList.add("legacy-compat");
  }

  const nav = document.querySelector("[data-site-nav]");
  if (!nav) {
    return;
  }

  document.body.classList.add("with-site-nav");
  const scrollSelector = options.scrollContainerSelector || ".flow-panel";
  const scrollContainer = document.querySelector(scrollSelector);
  const useWindowScroll = options.useWindowScroll === true;
  const preferWindowOnMobile = options.preferWindowOnMobile !== false;
  const useWindow = useWindowScroll || (preferWindowOnMobile && window.matchMedia("(max-width: 1023px)").matches) || !scrollContainer;
  const scrollTarget = useWindow ? window : scrollContainer;
  const brandMini = nav.querySelector("[data-nav-brand-center]");
  const backTop = nav.querySelector("[data-nav-backtop]");
  const dropdown = nav.querySelector("[data-nav-dropdown]");
  const dropdownToggle = nav.querySelector("[data-nav-dropdown-toggle]");
  const desktopHoverBacktop = window.matchMedia("(min-width: 1024px) and (hover: hover) and (pointer: fine)").matches;

  const getScrollTop = () => {
    if (scrollTarget === window) {
      return window.scrollY || document.documentElement.scrollTop || 0;
    }
    return scrollTarget.scrollTop || 0;
  };

  const scrollToTop = () => {
    if (scrollTarget === window) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    scrollTarget.scrollTo({ top: 0, behavior: "smooth" });
  };

  const closeDropdown = () => {
    if (dropdown) {
      dropdown.classList.remove("open");
    }
  };

  let lastTop = getScrollTop();
  let condensed = false;
  const applyNavState = () => {
    const top = getScrollTop();
    const delta = top - lastTop;

    if (top <= 24) {
      condensed = false;
      document.body.classList.remove("site-nav-show-backtop");
    } else if (delta > 6 && top > 92) {
      condensed = true;
    } else if (delta < -6) {
      condensed = false;
      document.body.classList.remove("site-nav-show-backtop");
    }

    document.body.classList.toggle("site-nav-condensed", condensed);
    document.body.classList.toggle("site-nav-frosted", top > 18);
    lastTop = top;
  };

  applyNavState();
  scrollTarget.addEventListener("scroll", applyNavState, { passive: true });

  if (dropdownToggle && dropdown) {
    dropdownToggle.addEventListener("click", () => {
      dropdown.classList.toggle("open");
    });
  }

  document.addEventListener("click", (event) => {
    if (dropdown && dropdown.contains(event.target)) {
      return;
    }
    closeDropdown();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeDropdown();
      document.body.classList.remove("site-nav-show-backtop");
    }
  });

  if (brandMini) {
    brandMini.addEventListener("click", () => {
      if (!document.body.classList.contains("site-nav-condensed")) {
        scrollToTop();
        return;
      }
      if (desktopHoverBacktop) {
        return;
      }
      document.body.classList.toggle("site-nav-show-backtop");
    });

    if (desktopHoverBacktop) {
      brandMini.addEventListener("mouseenter", () => {
        if (document.body.classList.contains("site-nav-condensed")) {
          document.body.classList.add("site-nav-show-backtop");
        }
      });

      nav.addEventListener("mouseleave", () => {
        document.body.classList.remove("site-nav-show-backtop");
      });
    }
  }

  if (backTop) {
    backTop.addEventListener("click", () => {
      document.body.classList.remove("site-nav-show-backtop");
      scrollToTop();
    });
  }
}

