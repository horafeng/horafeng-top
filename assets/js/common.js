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

const PAGE_TRANSITION_KEY = "horafeng-page-transition";

function ensureSplashScreen() {
  let splash = document.getElementById("splash-screen");
  if (splash) {
    return splash;
  }

  splash = document.createElement("div");
  splash.id = "splash-screen";
  splash.className = "splash-screen";
  splash.setAttribute("aria-hidden", "true");
  splash.innerHTML = '<span class="splash-logo">HoraFeng</span>';
  document.body.appendChild(splash);
  return splash;
}

function showSplashScreen(mode = "page") {
  const splash = ensureSplashScreen();
  splash.classList.remove("exiting");
  splash.classList.add("visible");
  splash.dataset.mode = mode;
  document.body.classList.add("no-scroll", "page-loading");
  return splash;
}

function hideSplashScreen(splash = document.getElementById("splash-screen")) {
  if (!splash) {
    document.body.classList.remove("no-scroll", "page-loading");
    return;
  }

  splash.classList.add("exiting");
  window.setTimeout(() => {
    splash.remove();
    document.body.classList.remove("no-scroll", "page-loading");
  }, 360);
}

export function setupSplash() {
  setupGlobalFooter();

  const firstVisitKey = "horafeng-splash-played";
  const navigation = performance.getEntriesByType("navigation")[0];
  const navType = navigation?.type || "navigate";
  const isPageTransition = sessionStorage.getItem(PAGE_TRANSITION_KEY) === "1";

  if (navType === "reload") {
    sessionStorage.removeItem(firstVisitKey);
  }

  if (!isPageTransition && sessionStorage.getItem(firstVisitKey)) {
    document.getElementById("splash-screen")?.remove();
    return;
  }

  const splash = showSplashScreen(isPageTransition ? "page" : "intro");
  sessionStorage.setItem(firstVisitKey, "1");

  const startedAt = performance.now();
  const minDuration = isPageTransition ? 780 : 1220;
  const maxDuration = isPageTransition ? 1900 : 1220;
  let dismissed = false;

  const dismiss = () => {
    if (dismissed) {
      return;
    }
    dismissed = true;
    const elapsed = performance.now() - startedAt;
    window.setTimeout(() => hideSplashScreen(splash), Math.max(0, minDuration - elapsed));
  };

  if (isPageTransition) {
    if (document.readyState === "complete") {
      dismiss();
    } else {
      window.addEventListener("load", dismiss, { once: true });
      window.setTimeout(dismiss, maxDuration);
    }
    return;
  }

  window.setTimeout(dismiss, minDuration);
}

export function setupPageTransition() {
  const enterFlag = sessionStorage.getItem(PAGE_TRANSITION_KEY) === "1";
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const resetPageState = () => {
    document.body.classList.remove("page-entering", "page-enter-active", "page-leaving", "no-scroll", "page-loading");
  };

  if (enterFlag) {
    document.body.classList.add("page-entering");
    requestAnimationFrame(() => {
      document.body.classList.add("page-enter-active");
    });
    window.setTimeout(() => {
      document.body.classList.remove("page-entering", "page-enter-active");
      sessionStorage.removeItem(PAGE_TRANSITION_KEY);
    }, 320);
  }

  window.addEventListener("pageshow", () => {
    resetPageState();
    sessionStorage.removeItem(PAGE_TRANSITION_KEY);
  });

  window.addEventListener("pagehide", resetPageState);

  document.addEventListener("click", (event) => {
    if (event.defaultPrevented) {
      return;
    }

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
    if (nextUrl.hash && nextUrl.pathname === window.location.pathname && nextUrl.search === window.location.search) {
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
    sessionStorage.setItem(PAGE_TRANSITION_KEY, "1");
    showSplashScreen("page");
    window.setTimeout(() => {
      window.location.assign(nextUrl.toString());
    }, reduceMotion ? 80 : 460);
  });
}

function getMobileChromeNavItems() {
  const params = new URLSearchParams(window.location.search);
  const content = String(params.get("content") || "").trim().toLowerCase();
  const page = String(document.body.dataset.page || "").trim().toLowerCase();

  return [
    { href: sitePath("index.html"), label: "首页", icon: "🏠", active: page === "home" && !content },
    {
      label: "内容",
      icon: "📚",
      group: "content",
      active: (page === "home" && ["article", "note", "notice"].includes(content)) || page === "article" || page === "archive",
      children: [
        { href: `${sitePath("index.html")}?content=article`, label: "文章", icon: "📕", active: (page === "home" && content === "article") || page === "article" },
        { href: `${sitePath("index.html")}?content=note`, label: "小记", icon: "📝", active: page === "home" && content === "note" || page === "entry" },
        { href: sitePath("archive.html"), label: "归档", icon: "📂", active: page === "archive" || page === "tags" },
        { href: `${sitePath("index.html")}?content=notice`, label: "公告", icon: "📢", active: page === "home" && content === "notice" },
      ],
    },
    { href: sitePath("friends/"), label: "友链", icon: "🔗", active: page === "friends" },
    { href: sitePath("guestbook.html"), label: "留言板", icon: "💬", active: page === "guestbook" },
    {
      label: "项目",
      icon: "🧩",
      group: "projects",
      active: false,
      children: [
        { href: "https://earthshow.pages.dev/", label: "EarthShow", icon: "🌍", active: false, external: true },
      ],
    },
    { href: sitePath("index.html#about"), label: "关于我", icon: "👤", active: false },
  ];
}

const COMMENT_IDENTITY_KEY = "hf-comment-identity-v1";

function readMobileCommentIdentity() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(COMMENT_IDENTITY_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveMobileCommentIdentity(identity = {}) {
  const nickname = String(identity.nickname || "").trim();
  const contact = String(identity.contact || "").trim();
  if (!nickname || !contact) {
    return false;
  }

  try {
    window.localStorage.setItem(
      COMMENT_IDENTITY_KEY,
      JSON.stringify({
        nickname,
        contact,
        notify_enabled: identity.notify_enabled !== false,
        verified_at: identity.verified_at || new Date().toISOString(),
      }),
    );
    window.dispatchEvent(new CustomEvent("hf-comment-identity-updated", { detail: { nickname, contact, notify_enabled: identity.notify_enabled !== false } }));
    return true;
  } catch {
    return false;
  }
}

function renderMobileNavItems() {
  return getMobileChromeNavItems()
    .map((item) => {
      if (Array.isArray(item.children)) {
        const expanded = item.active ? "true" : "false";
        return `
          <div class="hf-mobile-nav-group${item.active ? " active" : ""}" data-mobile-nav-group="${escapeHtml(item.group)}">
            <button class="hf-mobile-nav-link hf-mobile-nav-toggle" type="button" aria-expanded="${expanded}" data-mobile-nav-toggle>
              <span class="hf-mobile-nav-label"><span class="hf-mobile-nav-icon" aria-hidden="true">${escapeHtml(item.icon || "")}</span>${escapeHtml(item.label)}</span>
              <span class="hf-mobile-nav-caret" aria-hidden="true"></span>
            </button>
            <div class="hf-mobile-subnav">
              ${item.children
                .map(
                  (child) => `
                    <a class="hf-mobile-subnav-link${child.active ? " active" : ""}" href="${child.href}"${child.external ? ' target="_blank" rel="noopener noreferrer"' : ""}>
                      <span class="hf-mobile-nav-label"><span class="hf-mobile-nav-icon" aria-hidden="true">${escapeHtml(child.icon || "")}</span>${escapeHtml(child.label)}</span>
                    </a>
                  `,
                )
                .join("")}
            </div>
          </div>
        `;
      }

      return `
        <a class="hf-mobile-nav-link${item.active ? " active" : ""}" href="${item.href}">
          <span class="hf-mobile-nav-label"><span class="hf-mobile-nav-icon" aria-hidden="true">${escapeHtml(item.icon || "")}</span>${escapeHtml(item.label)}</span>
        </a>
      `;
    })
    .join("");
}

function syncMobileIdentityFields(identity = readMobileCommentIdentity()) {
  const nickname = String(identity.nickname || "").trim();
  const contact = String(identity.contact || "").trim();
  const notify = identity.notify_enabled !== false;
  [
    ["guestbook-nickname", nickname],
    ["comment-identity-nickname", nickname],
  ].forEach(([id, value]) => {
    const input = document.getElementById(id);
    if (input instanceof HTMLInputElement && value) {
      input.value = value;
    }
  });
  [
    ["guestbook-contact", contact],
    ["comment-identity-contact", contact],
  ].forEach(([id, value]) => {
    const input = document.getElementById(id);
    if (input instanceof HTMLInputElement && value) {
      input.value = value;
    }
  });
  [
    "guestbook-notify",
    "comment-identity-notify",
  ].forEach((id) => {
    const input = document.getElementById(id);
    if (input instanceof HTMLInputElement) {
      input.checked = notify;
    }
  });
}

function ensureStandaloneMobileChrome(options = {}) {
  const nav = document.querySelector("[data-site-nav]");
  if (!nav) {
    return null;
  }

  let chrome = document.getElementById("hf-mobile-chrome");
  if (!chrome) {
    chrome = document.createElement("div");
    chrome.id = "hf-mobile-chrome";
    chrome.className = "hf-mobile-chrome";
    chrome.innerHTML = `
      <div class="hf-mobile-topbar" role="banner">
        <button class="hf-mobile-icon-btn hf-mobile-menu-btn" type="button" aria-label="打开菜单" aria-controls="hf-mobile-menu" aria-expanded="false">
          <span class="hf-mobile-menu-lines" aria-hidden="true"></span>
        </button>
        <a class="hf-mobile-brand" href="${sitePath("index.html")}" aria-label="HoraFeng" data-no-transition="1">
          <span class="hf-mobile-brand-text" data-mobile-brand-main>HoraFeng</span>
          <span class="hf-mobile-brand-text hf-mobile-brand-backtop" data-mobile-brand-backtop aria-hidden="true">返回顶部 ↑</span>
        </a>
        <div class="hf-mobile-actions">
          <button class="hf-mobile-icon-btn" type="button" aria-label="打开搜索" data-hf-mobile-search-open>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m20.4 19.2-4.2-4.2a7 7 0 1 0-1.2 1.2l4.2 4.2 1.2-1.2ZM5.5 10.5a5 5 0 1 1 10 0 5 5 0 0 1-10 0Z"></path></svg>
          </button>
          <button class="hf-mobile-icon-btn" type="button" aria-label="填写访客信息" data-hf-mobile-identity-open>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm0 1.8c-4.1 0-7.5 2.3-7.5 5.1V21h15v-2.1c0-2.8-3.4-5.1-7.5-5.1Z"></path></svg>
          </button>
        </div>
      </div>
      <nav id="hf-mobile-menu" class="hf-mobile-menu" aria-label="手机端导航">
        <div class="hf-mobile-menu-inner">
          ${renderMobileNavItems()}
        </div>
      </nav>
    `;
    document.body.prepend(chrome);
  } else {
    const menuInner = chrome.querySelector(".hf-mobile-menu-inner");
    if (menuInner) {
      menuInner.innerHTML = renderMobileNavItems();
    }
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
          <a href="${sitePath("archive.html")}">归档</a>
          <a href="${sitePath("index.html")}?content=notice">公告</a>
          <a href="${sitePath("guestbook.html")}">留言板</a>
          <a href="${sitePath("friends/")}">友链</a>
        </div>
      </section>
    `;
    document.body.appendChild(searchOverlay);
  }

  let identityOverlay = document.getElementById("hf-mobile-identity-overlay");
  if (!identityOverlay) {
    identityOverlay = document.createElement("div");
    identityOverlay.id = "hf-mobile-identity-overlay";
    identityOverlay.className = "hf-mobile-identity-overlay";
    identityOverlay.hidden = true;
    identityOverlay.innerHTML = `
      <div class="hf-mobile-modal-backdrop" data-close-mobile-identity="1"></div>
      <section class="hf-mobile-identity-sheet" role="dialog" aria-modal="true" aria-labelledby="hf-mobile-identity-title">
        <button class="hf-mobile-modal-close" type="button" aria-label="关闭访客信息" data-close-mobile-identity="1">×</button>
        <h2 id="hf-mobile-identity-title">访客信息</h2>
        <form id="hf-mobile-identity-form" class="hf-mobile-identity-form" novalidate>
          <label class="field-block" for="hf-mobile-identity-nickname">昵称</label>
          <input id="hf-mobile-identity-nickname" name="nickname" type="text" maxlength="24" required />
          <label class="field-block" for="hf-mobile-identity-contact">联系方式，邮箱或 QQ</label>
          <input id="hf-mobile-identity-contact" name="contact" type="text" maxlength="120" placeholder="name@example.com 或 12345678" required />
          <label class="notify-option" for="hf-mobile-identity-notify">
            <input id="hf-mobile-identity-notify" name="notify_enabled" type="checkbox" checked />
            <span>收到回复时邮件提醒</span>
          </label>
          <p id="hf-mobile-identity-feedback" class="subtle" aria-live="polite"></p>
          <button class="hf-mobile-identity-save" type="submit">保存</button>
        </form>
      </section>
    `;
    document.body.appendChild(identityOverlay);
  }

  const menuButton = chrome.querySelector(".hf-mobile-menu-btn");
  const mobileMenu = chrome.querySelector("#hf-mobile-menu");
  const mobileBrand = chrome.querySelector(".hf-mobile-brand");
  const mobileViewport = window.matchMedia("(max-width: 767px)");
  let lastMobileScrollY = window.scrollY || document.documentElement.scrollTop || 0;
  let mobileScrollTicking = false;
  let suppressNextOutsideMenuClick = false;

  const setBodyLock = () => {
    document.body.classList.toggle(
      "mobile-overlay-lock",
      document.body.classList.contains("hf-mobile-menu-open") ||
        document.body.classList.contains("mobile-search-open") ||
        document.body.classList.contains("hf-mobile-identity-open"),
    );
  };

  const setMobileSubmenus = (open) => {
    mobileMenu?.querySelectorAll(".hf-mobile-nav-group").forEach((group) => {
      group.classList.toggle("is-open", open);
      group.querySelector("[data-mobile-nav-toggle]")?.setAttribute("aria-expanded", open ? "true" : "false");
    });
  };

  const resetMobileBrandBacktop = () => {
    document.body.classList.remove("hf-mobile-brand-backtop-ready");
    if (mobileBrand instanceof HTMLElement) {
      mobileBrand.setAttribute("aria-label", "HoraFeng");
    }
  };

  const syncMobileScrollChrome = () => {
    if (!mobileViewport.matches) {
      document.body.classList.remove("hf-mobile-topbar-condensed", "hf-mobile-brand-backtop-ready");
      resetMobileBrandBacktop();
      mobileScrollTicking = false;
      return;
    }

    const currentY = window.scrollY || document.documentElement.scrollTop || 0;
    const delta = currentY - lastMobileScrollY;
    const hasOpenLayer =
      document.body.classList.contains("hf-mobile-menu-open") ||
      document.body.classList.contains("mobile-search-open") ||
      document.body.classList.contains("hf-mobile-identity-open");

    if (hasOpenLayer || currentY <= 16) {
      document.body.classList.remove("hf-mobile-topbar-condensed");
      resetMobileBrandBacktop();
    } else if (delta > 7) {
      document.body.classList.add("hf-mobile-topbar-condensed");
    } else if (delta < -7) {
      document.body.classList.remove("hf-mobile-topbar-condensed");
      resetMobileBrandBacktop();
    }

    lastMobileScrollY = currentY;
    mobileScrollTicking = false;
  };

  const requestMobileScrollSync = () => {
    if (!mobileScrollTicking) {
      mobileScrollTicking = true;
      window.requestAnimationFrame(syncMobileScrollChrome);
    }
  };

  const closeMenu = () => {
    document.body.classList.remove("hf-mobile-menu-open", "mobile-home-drawer-open");
    setMobileSubmenus(false);
    menuButton?.setAttribute("aria-expanded", "false");
    menuButton?.setAttribute("aria-label", "打开菜单");
    setBodyLock();
  };

  const openMenu = () => {
    closeSearch();
    closeIdentity();
    document.body.classList.remove("hf-mobile-topbar-condensed");
    resetMobileBrandBacktop();
    setMobileSubmenus(true);
    document.body.classList.add("hf-mobile-menu-open", "mobile-home-drawer-open");
    menuButton?.setAttribute("aria-expanded", "true");
    menuButton?.setAttribute("aria-label", "关闭菜单");
    setBodyLock();
  };

  const toggleMenu = () => {
    if (document.body.classList.contains("hf-mobile-menu-open")) {
      closeMenu();
    } else {
      openMenu();
    }
  };

  const closeSearch = () => {
    searchOverlay.classList.remove("open");
    document.body.classList.remove("mobile-search-open");
    window.setTimeout(() => {
      if (!searchOverlay.classList.contains("open")) {
        searchOverlay.hidden = true;
      }
    }, 220);
    setBodyLock();
  };

  const openSearch = () => {
    closeMenu();
    closeIdentity();
    searchOverlay.hidden = false;
    requestAnimationFrame(() => {
      searchOverlay.classList.add("open");
      document.body.classList.add("mobile-search-open");
      document.getElementById("mobile-search-input")?.focus();
      setBodyLock();
    });
  };

  const closeIdentity = () => {
    identityOverlay.classList.remove("open");
    document.body.classList.remove("hf-mobile-identity-open");
    window.setTimeout(() => {
      if (!identityOverlay.classList.contains("open")) {
        identityOverlay.hidden = true;
      }
    }, 200);
    setBodyLock();
  };

  const openIdentity = () => {
    closeMenu();
    closeSearch();
    const identity = readMobileCommentIdentity();
    const nicknameInput = document.getElementById("hf-mobile-identity-nickname");
    const contactInput = document.getElementById("hf-mobile-identity-contact");
    const notifyInput = document.getElementById("hf-mobile-identity-notify");
    if (nicknameInput instanceof HTMLInputElement) {
      nicknameInput.value = String(identity.nickname || "");
    }
    if (contactInput instanceof HTMLInputElement) {
      contactInput.value = String(identity.contact || "");
    }
    if (notifyInput instanceof HTMLInputElement) {
      notifyInput.checked = identity.notify_enabled !== false;
    }
    identityOverlay.hidden = false;
    requestAnimationFrame(() => {
      identityOverlay.classList.add("open");
      document.body.classList.add("hf-mobile-identity-open");
      nicknameInput?.focus();
      setBodyLock();
    });
  };

  if (chrome.dataset.mobileChromeBound !== "1") {
    chrome.dataset.mobileChromeBound = "1";
    menuButton?.addEventListener("click", toggleMenu);
    mobileBrand?.addEventListener("click", (event) => {
      if (!mobileViewport.matches || !document.body.classList.contains("hf-mobile-topbar-condensed")) {
        return;
      }

      event.preventDefault();
      if (!document.body.classList.contains("hf-mobile-brand-backtop-ready")) {
        document.body.classList.add("hf-mobile-brand-backtop-ready");
        if (mobileBrand instanceof HTMLElement) {
          mobileBrand.setAttribute("aria-label", "返回顶部");
        }
        return;
      }

      window.scrollTo({ top: 0, behavior: "smooth" });
      document.body.classList.remove("hf-mobile-topbar-condensed");
      resetMobileBrandBacktop();
    });
    chrome.querySelector("[data-hf-mobile-search-open]")?.addEventListener("click", openSearch);
    chrome.querySelector("[data-hf-mobile-identity-open]")?.addEventListener("click", openIdentity);
    mobileMenu?.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      const toggle = target.closest("[data-mobile-nav-toggle]");
      if (toggle instanceof HTMLButtonElement) {
        const group = toggle.closest(".hf-mobile-nav-group");
        const expanded = toggle.getAttribute("aria-expanded") === "true";
        toggle.setAttribute("aria-expanded", expanded ? "false" : "true");
        group?.classList.toggle("is-open", !expanded);
        event.preventDefault();
        return;
      }

      if (target.closest("a[href]")) {
        closeMenu();
      }
    });
    document.addEventListener("pointerdown", (event) => {
      if (!document.body.classList.contains("hf-mobile-menu-open")) {
        return;
      }
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      const topbar = chrome.querySelector(".hf-mobile-topbar");
      if (topbar?.contains(target)) {
        return;
      }
      if (!mobileMenu?.contains(target)) {
        suppressNextOutsideMenuClick = true;
        closeMenu();
      }
    });
    document.addEventListener(
      "click",
      (event) => {
        if (!suppressNextOutsideMenuClick) {
          return;
        }

        suppressNextOutsideMenuClick = false;
        event.preventDefault();
        event.stopImmediatePropagation();
      },
      true,
    );
    window.addEventListener("scroll", requestMobileScrollSync, { passive: true });
    window.addEventListener("resize", syncMobileScrollChrome);
  }

  setMobileSubmenus(false);

  const homeLegacyMenuButton = document.getElementById("mobile-home-profile");
  const homeLegacySearchButton = document.getElementById("mobile-home-search");
  if (homeLegacyMenuButton && homeLegacyMenuButton.dataset.hfUnifiedBound !== "1") {
    homeLegacyMenuButton.dataset.hfUnifiedBound = "1";
    homeLegacyMenuButton.addEventListener("click", (event) => {
      event.preventDefault();
      toggleMenu();
    });
  }
  if (homeLegacySearchButton && homeLegacySearchButton.dataset.hfUnifiedBound !== "1") {
    homeLegacySearchButton.dataset.hfUnifiedBound = "1";
    homeLegacySearchButton.addEventListener("click", (event) => {
      event.preventDefault();
      openSearch();
    });
  }

  if (searchOverlay.dataset.hfMobileSearchBound !== "1") {
    searchOverlay.dataset.hfMobileSearchBound = "1";
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
      const pageSearchInput = document.querySelector("#search-input, #archive-search-input");
      if (pageSearchInput instanceof HTMLInputElement) {
        pageSearchInput.value = query;
        pageSearchInput.dispatchEvent(new Event("input", { bubbles: true }));
        pageSearchInput.form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        closeSearch();
        return;
      }

      const nextUrl = new URL(sitePath("index.html"), window.location.origin);
      if (query) {
        nextUrl.searchParams.set("q", query);
      }
      window.location.assign(nextUrl.toString());
    });
  }

  if (identityOverlay.dataset.hfMobileIdentityBound !== "1") {
    identityOverlay.dataset.hfMobileIdentityBound = "1";
    identityOverlay.addEventListener("click", (event) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.dataset.closeMobileIdentity === "1") {
        closeIdentity();
      }
    });
    document.getElementById("hf-mobile-identity-form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      if (!(form instanceof HTMLFormElement)) {
        return;
      }
      const data = new FormData(form);
      const identity = {
        nickname: data.get("nickname"),
        contact: data.get("contact"),
        notify_enabled: data.get("notify_enabled") === "on",
      };
      const feedback = document.getElementById("hf-mobile-identity-feedback");
      if (!saveMobileCommentIdentity(identity)) {
        if (feedback) {
          feedback.textContent = "请填写昵称和联系方式。";
        }
        return;
      }
      syncMobileIdentityFields(identity);
      if (feedback) {
        feedback.textContent = "已保存，会在评论时自动读取。";
      }
      window.setTimeout(closeIdentity, 420);
    });
  }

  if (nav.dataset.hfMobileDesktopBridgeBound !== "1") {
    nav.dataset.hfMobileDesktopBridgeBound = "1";
    nav.querySelector(".site-nav-left")?.addEventListener("click", (event) => {
      if (!window.matchMedia("(max-width: 767px)").matches) {
        return;
      }
      event.preventDefault();
      toggleMenu();
    });
    nav.querySelector("[data-nav-backtop]")?.addEventListener("click", (event) => {
      if (!window.matchMedia("(max-width: 767px)").matches) {
        return;
      }
      event.preventDefault();
      openSearch();
    });
  }

  if (document.body.dataset.hfMobileChromeKeyBound !== "1") {
    document.body.dataset.hfMobileChromeKeyBound = "1";
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeMenu();
        closeSearch();
        closeIdentity();
      }
    });
  }

  syncMobileIdentityFields();

  return {
    updateProfile(_nextProfile = {}) {
      const menuInner = chrome.querySelector(".hf-mobile-menu-inner");
      if (menuInner) {
        menuInner.innerHTML = renderMobileNavItems();
      }
    },
    openSearch,
    closeSearch,
    openIdentity,
    closeIdentity,
    closeMenu,
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
    dropdownToggle.addEventListener("click", (event) => {
      event.stopPropagation();
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

