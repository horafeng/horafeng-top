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
  const cover = String(entry?.cover ?? "").trim();
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
    contentType: "article",
    source,
    hasCover: Boolean(cover),
  };
}

function normalizeNoticeEntry(entry, source = "notion-notice") {
  const publishedAt = String(entry?.published_at ?? entry?.date ?? entry?.created_time ?? "").trim();
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
    title,
    date: publishedAt,
    content: details,
    source,
    status: String(entry?.status ?? "").trim().toLowerCase(),
  };
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
    const normalized =
      String(entry?.contentType || entry?.type || "")
        .trim()
        .toLowerCase() === "article"
        ? normalizeArticleEntry(entry, entry?.source || "notion-article")
        : normalizeEntry(entry, entry?.source || "local");
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

  return mergeEntries(localEntries, notionCompatEntries);
}

export async function loadHomeFeed() {
  const [entries, notionArticles] = await Promise.all([
    loadEntries(),
    fetchOptionalItems("content/generated/notion-articles.json"),
  ]);

  const articleEntries = notionArticles
    .filter((item) => String(item?.status ?? "").trim().toLowerCase() === "published")
    .map((item) => normalizeArticleEntry(item));

  return mergeEntries(
    entries.map((entry) => ({ ...entry, contentType: entry.contentType || "note" })),
    articleEntries,
  );
}

export async function loadArticleIndex() {
  const items = await fetchOptionalItems("content/generated/notion-articles.json");
  return items
    .filter((item) => String(item?.status ?? "").trim().toLowerCase() === "published")
    .map((item) => normalizeArticleEntry(item));
}

export async function loadNoticeIndex() {
  const items = await fetchOptionalItems("content/generated/notion-notices.json");
  return items
    .map((item) => normalizeNoticeEntry(item))
    .filter((item) => !item.status || item.status === "published")
    .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
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

export function setupSiteChrome(options = {}) {
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

export function renderMockComments(listEl, comments, limit = 10) {
  if (!listEl) {
    return;
  }

  const rows = (comments || []).slice(0, limit);
  if (!rows.length) {
    listEl.innerHTML = '<li class="subtle">\u8bc4\u8bba\u533a\u6682\u672a\u5f00\u653e\u3002</li>';
    return;
  }

  listEl.innerHTML = rows
    .map((item) => `<li><p class="comment-author">${escapeHtml(item.nick || "\u8bbf\u5ba2")}</p><p class="comment-text">${escapeHtml(item.content || "")}</p></li>`)
    .join("");
}

