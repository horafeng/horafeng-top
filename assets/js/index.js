import {
  escapeHtml,
  formatLastSeen,
  getStats,
  linkify,
  loadHomeFeed,
  loadRecentComments,
  loadNoticeIndex,
  loadSiteConfig,
  searchEntries,
  setupSiteChrome,
  setupPageTransition,
  setupSplash,
} from "./common.js?v=f6e0c5dd3d";
import { mountContentComments } from "./content-comments.js";

let allEntries = [];
let visibleEntries = [];
let siteConfig = null;
let currentPostId = null;

let currentImages = [];
let currentImageIndex = 0;
let wheelLock = false;
let mediaUiTimer = null;
let mediaKeydownHandler = null;
let dragState = null;
let dismissDragState = null;
let lastOpenOrigin = null;
let currentCommentWidget = null;
let welcomeTypingTimer = null;

const WELCOME_LINES = ["欢迎来到我的博客", "私のブログへようこそ", "Welcome to my blog"];
const WELCOME_TYPE_DELAY_MS = 140;
const WELCOME_DELETE_DELAY_MS = 80;
const WELCOME_LINE_HOLD_MS = 5000;
const NOTICE_STORAGE_KEY = "hf-latest-notice-token";
const DEFAULT_SITE_ORIGIN = "https://horafeng.top";
const DEFAULT_HERO_SIGNATURE = "在尝试各种各样的事情";
const MOJIBAKE_PATTERN = /[�锟]|[鍦浜鎴鐨涓绋嬫熀]/;

const FALLBACK_COVERS = [
  "assets/images/diary/cover-01.svg",
  "assets/images/diary/cover-02.svg",
  "assets/images/diary/cover-03.svg",
];

function escapeAttr(text) {
  return String(text).replaceAll('"', "&quot;");
}

function readableText(value, fallback = "") {
  const text = String(value || "").trim();
  if (!text || MOJIBAKE_PATTERN.test(text)) {
    return fallback;
  }
  return text;
}

function compactText(value, limit = 72, fallback = "") {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) {
    return fallback;
  }
  return text.length > limit ? `${text.slice(0, Math.max(0, limit - 1)).trimEnd()}…` : text;
}

function formatHomeDate(dateText) {
  const value = String(dateText || "").trim();
  if (!value) {
    return "";
  }
  return value.slice(0, 10);
}

function toAbsoluteUrl(url) {
  const value = String(url || "").trim();
  if (!value) {
    return "";
  }
  if (/^https?:\/\//i.test(value) || /^data:/i.test(value)) {
    return value;
  }
  return `${DEFAULT_SITE_ORIGIN}/${value.replace(/^\/+/, "")}`;
}

function setMetaTag({ property = "", name = "", content = "" } = {}) {
  const value = String(content || "").trim();
  if (!value) {
    return;
  }

  const selector = property ? `meta[property="${property}"]` : `meta[name="${name}"]`;
  let tag = document.head.querySelector(selector);
  if (!tag) {
    tag = document.createElement("meta");
    if (property) {
      tag.setAttribute("property", property);
    } else {
      tag.setAttribute("name", name);
    }
    document.head.appendChild(tag);
  }
  tag.setAttribute("content", value);
}

function applyHomeSeo(config, entries) {
  const profile = config?.profile || {};
  const first = Array.isArray(entries) ? entries[0] : null;
  const title = `${profile.name || "HoraFeng"} 的博客`;
  const description = String(profile.signature || profile.bio || "欢迎来到我的博客。").trim();
  const image = toAbsoluteUrl(profile.avatar || profile.cover || first?.images?.[0] || "");
  const url = `${DEFAULT_SITE_ORIGIN}/`;

  setMetaTag({ property: "og:title", content: title });
  setMetaTag({ property: "og:description", content: description });
  setMetaTag({ property: "og:image", content: image });
  setMetaTag({ property: "og:url", content: url });
  setMetaTag({ property: "og:type", content: "website" });
  setMetaTag({ name: "twitter:card", content: image ? "summary_large_image" : "summary" });
  setMetaTag({ name: "twitter:title", content: title });
  setMetaTag({ name: "twitter:description", content: description });
  setMetaTag({ name: "twitter:image", content: image });
}

function hashString(text) {
  return [...String(text)].reduce((acc, char) => acc + char.charCodeAt(0), 0);
}

function getFallbackCover(id = "fallback") {
  return FALLBACK_COVERS[hashString(id) % FALLBACK_COVERS.length];
}

function bindImageFallbacks(scope = document) {
  scope.querySelectorAll("img[data-fallback]").forEach((img) => {
    if (img.dataset.boundError === "1") {
      return;
    }

    img.dataset.boundError = "1";
    img.addEventListener("error", () => {
      const fallback = img.dataset.fallback || FALLBACK_COVERS[0];
      if (img.src.endsWith(fallback)) {
        return;
      }
      img.src = fallback;
      img.classList.add("is-fallback");
    });
  });
}

function getArticleUrl(entry) {
  return `article.html?slug=${encodeURIComponent(entry.slug)}`;
}

function renderTimeline(entries) {
  const timeline = document.getElementById("timeline");

  if (!entries.length) {
    timeline.innerHTML = '<p class="subtle">没有匹配结果，换个关键词试试。</p>';
    return;
  }

  timeline.innerHTML = entries
    .map((entry) => {
      const isArticle = entry.contentType === "article";
      const preview = entry.content.join(" ");
      const safePreview = escapeHtml(isArticle && !preview ? "\u70b9\u51fb\u9605\u8bfb\u5168\u6587\u3002" : preview);
      const tags = entry.tags.slice(0, 4).map((tag) => `#${tag}`).join(" ");
      const coverImage = entry.cover || entry.images[0] || "";
      const hasImage = Boolean(coverImage);
      const fallback = getFallbackCover(entry.id);

      if (isArticle) {
        const metaTrail = [entry.date, entry.category, "\u957f\u6587"]
          .filter(Boolean)
          .map((item) => `<span>${escapeHtml(item)}</span>`)
          .join("");
        const href = getArticleUrl(entry);
        const articleBadge = '<span class="entry-type-badge">\u6587\u7ae0</span>';

        if (!hasImage) {
          return `
            <article class="entry-card no-image article-card">
              <a class="entry-link article-link" href="${escapeAttr(href)}" aria-label="\u6253\u5f00\u6587\u7ae0\uff1a${escapeAttr(entry.title)}">
                <div class="entry-shell no-image-shell">
                  <div class="entry-copy">
                    <div class="entry-meta">${metaTrail}</div>
                    <div class="entry-card-head">${articleBadge}</div>
                    <h3 class="entry-title">${escapeHtml(entry.title)}</h3>
                    <p class="entry-snippet">${safePreview}</p>
                    <p class="entry-meta entry-tags">${tags}</p>
                  </div>
                </div>
              </a>
            </article>
          `;
        }

        return `
          <article class="entry-card has-image article-card">
            <a class="entry-link article-link" href="${escapeAttr(href)}" aria-label="\u6253\u5f00\u6587\u7ae0\uff1a${escapeAttr(entry.title)}">
              <div class="entry-shell has-image-shell">
                <div class="entry-copy">
                  <div class="entry-meta">${metaTrail}</div>
                  <div class="entry-card-head">${articleBadge}</div>
                  <h3 class="entry-title clamp-1">${escapeHtml(entry.title)}</h3>
                  <p class="entry-snippet clamp-2">${safePreview}</p>
                  <p class="entry-meta entry-tags">${tags}</p>
                </div>
                <div class="entry-visual">
                  <img class="entry-cover" src="${escapeAttr(coverImage)}" data-fallback="${escapeAttr(fallback)}" alt="${escapeAttr(entry.title)}" loading="lazy" />
                </div>
                <span class="entry-fusion" aria-hidden="true"></span>
              </div>
            </a>
          </article>
        `;
      }

      if (entry.contentType === "notice") {
        const metaTrail = [entry.date, entry.category || "公告", entry.pin ? "置顶" : ""]
          .filter(Boolean)
          .map((item) => `<span>${escapeHtml(item)}</span>`)
          .join("");
        const lines = Array.isArray(entry.content) ? entry.content : [];
        const body = lines.length ? lines.map((line) => `<p>${linkify(line)}</p>`).join("") : "<p>本条公告暂无详细正文。</p>";
        const tagsHtml = entry.tags.length ? `<p class="entry-meta entry-tags">${entry.tags.map((tag) => `#${escapeHtml(tag)}`).join(" ")}</p>` : "";
        const pinBadge = entry.pin ? '<span class="entry-type-badge">置顶公告</span>' : '<span class="entry-type-badge">公告</span>';

        return `
          <article class="entry-card no-image article-card notice-card" data-entry-id="${escapeAttr(entry.id)}">
            <div class="entry-link article-link notice-link-static">
              <div class="entry-shell no-image-shell">
                <div class="entry-copy">
                  <div class="entry-meta">${metaTrail}</div>
                  <div class="entry-card-head">${pinBadge}</div>
                  <h3 class="entry-title">${escapeHtml(entry.title)}</h3>
                  <div class="entry-detail notice-inline-body">${body}</div>
                  ${tagsHtml}
                </div>
              </div>
            </div>
          </article>
        `;
      }

      if (!hasImage) {
        return `
          <article class="entry-card no-image" data-entry-card="${entry.id}" data-entry-id="${entry.id}" tabindex="0" role="button" aria-label="打开帖子：${escapeAttr(entry.title)}">
            <div class="entry-link">
              <div class="entry-shell no-image-shell">
                <div class="entry-copy">
                  <div class="entry-meta"><span>${entry.date}</span><span>${entry.mood}</span></div>
                  <h3 class="entry-title clamp-1">${entry.title}</h3>
                  <p class="entry-snippet clamp-2">${safePreview}</p>
                  <p class="entry-meta entry-tags">${tags}</p>
                </div>
              </div>
            </div>
          </article>
        `;
      }

      return `
        <article class="entry-card has-image" data-entry-card="${entry.id}" data-entry-id="${entry.id}" tabindex="0" role="button" aria-label="打开帖子：${escapeAttr(entry.title)}">
          <div class="entry-link">
            <div class="entry-shell has-image-shell">
              <div class="entry-copy">
                <div class="entry-meta"><span>${entry.date}</span><span>${entry.mood}</span></div>
                <h3 class="entry-title clamp-1">${entry.title}</h3>
                <p class="entry-snippet clamp-2">${safePreview}</p>
                <p class="entry-meta entry-tags">${tags}</p>
              </div>
              <div class="entry-visual">
                <img class="entry-cover" src="${escapeAttr(entry.images[0])}" data-fallback="${escapeAttr(fallback)}" alt="${escapeAttr(entry.title)}" loading="lazy" />
              </div>
              <span class="entry-fusion" aria-hidden="true"></span>
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  bindImageFallbacks(timeline);
  window.dispatchEvent(new CustomEvent("home:timeline-rendered"));
}

function notifyHomeRendered() {
  window.dispatchEvent(
    new CustomEvent("home:rendered", {
      detail: {
        config: siteConfig,
        entries: visibleEntries,
      },
    }),
  );
}

function renderSidebar(entries, config) {
  const { tags, archives } = getStats(entries);
  const allTags = [...tags.entries()].sort((a, b) => b[1] - a[1]);
  const latestArchives = [...archives.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 10);

  const tagHTML = allTags
    .map(([tag, count]) => `<a class="chip" href="index.html?tag=${encodeURIComponent(tag)}">#${tag} (${count})</a>`)
    .join("");

  const archiveHTML = latestArchives
    .map(([month, count]) => `<li><a href="index.html?archive=${month}">${month} (${count})</a></li>`)
    .join("");

  [document.getElementById("tag-preview"), document.getElementById("mobile-tag-preview")].forEach((el) => {
    if (el) {
      el.innerHTML = tagHTML;
    }
  });

  [document.getElementById("archive-preview"), document.getElementById("mobile-archive-preview")].forEach((el) => {
    if (el) {
      el.innerHTML = archiveHTML;
    }
  });

  void renderRecentComments(entries);
}

function getCommentTarget(entry) {
  if (!entry) {
    return null;
  }

  if (entry.contentType === "article" && entry.slug) {
    return {
      title: entry.title || "文章",
      href: getArticleUrl(entry),
      typeLabel: "\u6587\u7ae0",
    };
  }

  return {
    title: entry.title || "\u5c0f\u8bb0",
    href: `index.html?post=${encodeURIComponent(entry.id)}`,
    typeLabel: "\u5c0f\u8bb0",
  };
}

function resolveRecentCommentTarget(comment, entries) {
  const pageKey = String(comment?.page_key || "").trim().toLowerCase();
  if (!pageKey) {
    return null;
  }

  if (pageKey === "guestbook") {
    return {
      title: "\u7559\u8a00\u677f",
      href: "guestbook.html",
      typeLabel: "\u7559\u8a00\u677f",
    };
  }

  if (pageKey.startsWith("article:")) {
    const slug = pageKey.slice("article:".length);
    const matched = entries.find((entry) => entry.contentType === "article" && entry.slug === slug);
    return (
      getCommentTarget(matched) || {
        title: "\u6587\u7ae0",
        href: `article.html?slug=${encodeURIComponent(slug)}`,
        typeLabel: "\u6587\u7ae0",
      }
    );
  }

  if (pageKey.startsWith("note:")) {
    const noteId = pageKey.slice("note:".length);
    const matched = entries.find((entry) => entry.id === noteId);
    return (
      getCommentTarget(matched) || {
        title: "\u5c0f\u8bb0",
        href: `index.html?post=${encodeURIComponent(noteId)}`,
        typeLabel: "\u5c0f\u8bb0",
      }
    );
  }

  return {
    title: pageKey,
    href: "guestbook.html",
    typeLabel: "\u7559\u8a00",
  };
}

function formatCommentTime(isoString) {
  const date = new Date(isoString || "");
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function renderRecentCommentsList(listEl, comments, entries) {
  if (!listEl) {
    return;
  }

  if (!comments.length) {
    listEl.innerHTML = '<li class="subtle">\u6682\u65f6\u8fd8\u6ca1\u6709\u516c\u5f00\u7559\u8a00\u3002</li>';
    return;
  }

  listEl.innerHTML = comments
    .map((comment) => {
      const target = resolveRecentCommentTarget(comment, entries);
      const nickname = escapeHtml(comment.nickname || "\u8bbf\u5ba2");
      const content = escapeHtml(String(comment.content || "").replace(/\s+/g, " ").trim() || "\uff08\u6682\u65e0\u6b63\u6587\uff09");
      const avatar = escapeAttr(comment.avatar_url || "/assets/images/avatar-default.svg");
      const timeLabel = escapeHtml(formatCommentTime(comment.created_at));
      const targetTitle = target ? escapeHtml(target.title) : "\u533f\u540d\u9875\u9762";
      const href = target ? escapeAttr(target.href) : "guestbook.html";
      const typeLabel = target ? escapeHtml(target.typeLabel) : "\u7559\u8a00";

      return `
        <li class="recent-comment-entry">
          <a class="recent-comment-link" href="${href}">
            <img class="recent-comment-avatar" src="${avatar}" alt="${nickname} avatar" loading="lazy" referrerpolicy="no-referrer" />
            <div class="recent-comment-body">
              <div class="recent-comment-top">
                <p class="recent-comment-author">${nickname}</p>
                <time class="recent-comment-time">${timeLabel}</time>
              </div>
              <p class="recent-comment-text">${content}</p>
              <p class="recent-comment-target">
                <span class="recent-comment-type">${typeLabel}</span>
                <span class="recent-comment-title">${targetTitle}</span>
              </p>
            </div>
          </a>
        </li>
      `;
    })
    .join("");
}

async function renderRecentComments(entries) {
  const comments = await loadRecentComments(10);
  renderRecentCommentsList(document.getElementById("recent-comments"), comments, entries);
  renderRecentCommentsList(document.getElementById("mobile-recent-comments"), comments, entries);
}

async function renderHomePinnedNotice() {
  const host = document.getElementById("home-pinned-notice");
  if (!host) {
    return;
  }

  const notices = await loadNoticeIndex();
  const pinned = notices
    .filter((item) => Boolean(item?.pin))
    .sort((a, b) => {
      const updatedDiff = new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime();
      if (updatedDiff !== 0) {
        return updatedDiff;
      }
      return new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime();
    });

  if (!pinned.length) {
    host.hidden = true;
    host.innerHTML = "";
    return;
  }

  const latestPinned = pinned[0];
  const summary = Array.isArray(latestPinned.content) ? latestPinned.content.find((line) => String(line || "").trim()) || "" : "";
  host.hidden = false;
  host.innerHTML = `
    <article class="home-pinned-notice-card">
      <div class="home-pinned-notice-meta">
        <span class="entry-type-badge">置顶公告</span>
        <span>${escapeHtml(latestPinned.date || "")}</span>
      </div>
      <h3 class="home-pinned-notice-title">${escapeHtml(latestPinned.title || "公告")}</h3>
      ${summary ? `<p class="home-pinned-notice-summary">${linkify(summary)}</p>` : ""}
      <a class="chip" href="index.html?content=notice">查看公告列表</a>
    </article>
  `;
}

function getHomeEntryExcerpt(entry, limit = 78) {
  const summary = entry?.summary || (Array.isArray(entry?.content) ? entry.content.join(" ") : "");
  const fallback = entry?.contentType === "article" ? "点击阅读全文。" : "这条内容暂时没有摘要。";
  return compactText(summary, limit, fallback);
}

function getHomeStats(entries, comments, notices) {
  return {
    articleCount: entries.filter((entry) => entry.contentType === "article").length,
    noteCount: entries.filter((entry) => entry.contentType === "note").length,
    commentCount: Array.isArray(comments) ? comments.length : 0,
    noticeCount: Array.isArray(notices) ? notices.length : 0,
  };
}

function renderOverviewMiniCards(items, type) {
  if (!items.length) {
    return `<p class="home-overview-empty">暂时还没有可展示的内容。</p>`;
  }

  return `
    <div class="home-overview-mini-grid">
      ${items
        .map((item) => {
          if (type === "comment") {
            const author = escapeHtml(compactText(item.nickname || "访客", 16, "访客"));
            const text = escapeHtml(compactText(item.content, 58, "这条评论暂时没有正文。"));
            const time = escapeHtml(formatCommentTime(item.created_at));
            return `
              <article class="home-overview-mini-card">
                <p class="home-overview-mini-text">${text}</p>
                <p class="home-overview-mini-meta"><span>${author}</span><time>${time}</time></p>
              </article>
            `;
          }

          const title = escapeHtml(compactText(item.title, 28, type === "notice" ? "公告" : "小记"));
          const text = escapeHtml(getHomeEntryExcerpt(item, 56));
          const date = escapeHtml(formatHomeDate(item.date || item.updatedAt));
          const href =
            type === "notice"
              ? "index.html?content=notice"
              : `index.html?post=${encodeURIComponent(item.id)}`;

          return `
            <a class="home-overview-mini-card" href="${escapeAttr(href)}">
              <p class="home-overview-mini-title">${title}</p>
              <p class="home-overview-mini-text">${text}</p>
              <p class="home-overview-mini-meta"><time>${date}</time></p>
            </a>
          `;
        })
        .join("")}
    </div>
  `;
}

function setupHomeOverviewTabs() {
  const section = document.getElementById("home-overview-section");
  if (!section) {
    return;
  }

  const tabs = [...section.querySelectorAll("[data-home-overview-tab]")];
  const panels = [...section.querySelectorAll("[data-home-overview-panel]")];
  const activate = (name) => {
    tabs.forEach((tab) => {
      const active = tab.dataset.homeOverviewTab === name;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", active ? "true" : "false");
    });
    panels.forEach((panel) => {
      panel.classList.toggle("is-active", panel.dataset.homeOverviewPanel === name);
    });
  };

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => activate(tab.dataset.homeOverviewTab));
  });
  activate("profile");
}

function renderHomeOverview(entries, config, comments, notices) {
  const host = document.getElementById("home-overview-section");
  if (!host) {
    return;
  }

  const profile = config?.profile || {};
  const stats = getHomeStats(entries, comments, notices);
  const profileName = readableText(profile.name, "HoraFeng");
  const profileHandle = readableText(profile.handle, "@horafeng");
  const signature = readableText(profile.signature || profile.bio, DEFAULT_HERO_SIGNATURE);
  const avatar = profile.avatar || "assets/images/Profile.png";
  const notes = entries.filter((entry) => entry.contentType === "note").slice(0, 6);
  const noticeItems = notices.slice(0, 6);
  const commentItems = comments.slice(0, 6);

  host.innerHTML = `
    <div class="home-overview-tabs" role="tablist" aria-label="首页信息切换">
      <button class="home-overview-tab is-active" type="button" role="tab" data-home-overview-tab="profile" aria-selected="true">博主</button>
      <button class="home-overview-tab" type="button" role="tab" data-home-overview-tab="notes" aria-selected="false">小记</button>
      <button class="home-overview-tab" type="button" role="tab" data-home-overview-tab="comments" aria-selected="false">评论</button>
      <button class="home-overview-tab" type="button" role="tab" data-home-overview-tab="notices" aria-selected="false">公告</button>
    </div>
    <div class="home-overview-panels">
      <article class="home-overview-panel home-profile-overview is-active" data-home-overview-panel="profile">
        <img class="home-profile-avatar" src="${escapeAttr(avatar)}" alt="博主头像" loading="lazy" />
        <div class="home-profile-copy">
          <p class="home-profile-kicker">${escapeHtml(profileHandle)}</p>
          <h2>${escapeHtml(profileName)}</h2>
          <p>${escapeHtml(signature)}</p>
          <div class="home-profile-stats" aria-label="站点统计">
            <span><strong>${stats.articleCount}</strong>文章</span>
            <span><strong>${stats.noteCount}</strong>小记</span>
            <span><strong>${stats.commentCount}</strong>近期评论</span>
            <span><strong>${stats.noticeCount}</strong>公告</span>
          </div>
          <div class="profile-actions compact" aria-label="联系方式">
            ${renderProfileActionLinks(profile)}
          </div>
        </div>
      </article>
      <article class="home-overview-panel" data-home-overview-panel="notes">
        ${renderOverviewMiniCards(notes, "note")}
      </article>
      <article class="home-overview-panel" data-home-overview-panel="comments">
        ${renderOverviewMiniCards(commentItems, "comment")}
      </article>
      <article class="home-overview-panel" data-home-overview-panel="notices">
        ${renderOverviewMiniCards(noticeItems, "notice")}
      </article>
    </div>
  `;

  setupHomeOverviewTabs();
}

function getLatestDisplayEntries(entries) {
  const articles = entries.filter((entry) => entry.contentType === "article");
  const used = new Set(articles.map((entry) => entry.id || entry.slug || entry.title));
  const supplements = entries
    .filter((entry) => entry.contentType !== "notice")
    .filter((entry) => !used.has(entry.id || entry.slug || entry.title));
  return [...articles, ...supplements].slice(0, 6);
}

function renderLatestArticleCard(entry, index) {
  const title = escapeHtml(compactText(entry.title, index === 0 ? 42 : 34, "未命名内容"));
  const excerpt = escapeHtml(getHomeEntryExcerpt(entry, index === 0 ? 92 : 58));
  const date = escapeHtml(formatHomeDate(entry.date));
  const category = escapeHtml(readableText(entry.category || entry.tags?.[0], entry.contentType === "article" ? "文章" : "小记"));
  const cover = entry.cover || entry.images?.[0] || getFallbackCover(entry.id || entry.slug || entry.title);
  const href = entry.contentType === "article" && entry.slug ? getArticleUrl(entry) : `index.html?post=${encodeURIComponent(entry.id)}`;
  const sizeClass = index === 0 ? "is-large" : index <= 2 ? "is-medium" : "is-small";

  return `
    <article class="home-latest-card ${sizeClass}">
      <a href="${escapeAttr(href)}" class="home-latest-link">
        <div class="home-latest-cover-wrap">
          <img class="home-latest-cover" src="${escapeAttr(cover)}" data-fallback="${escapeAttr(getFallbackCover(entry.id))}" alt="${escapeAttr(title)}" loading="lazy" />
        </div>
        <div class="home-latest-copy">
          <p class="home-latest-meta"><span>${category}</span><time>${date}</time></p>
          <h3>${title}</h3>
          <p class="home-latest-excerpt">${excerpt}</p>
        </div>
      </a>
    </article>
  `;
}

function renderHomeLatest(entries) {
  const host = document.getElementById("home-latest-section");
  if (!host) {
    return;
  }

  const latest = getLatestDisplayEntries(entries);
  const emptySlots = Array.from({ length: Math.max(0, 6 - latest.length) });

  host.innerHTML = `
    <div class="home-section-head">
      <h2>最新文章</h2>
      <p>按现有内容时间排序，优先展示文章，数据不足时用已有小记补足。</p>
    </div>
    <div class="home-latest-grid">
      ${latest.map((entry, index) => renderLatestArticleCard(entry, index)).join("")}
      ${emptySlots.map(() => '<div class="home-latest-card is-empty"><span>等待下一篇内容同步</span></div>').join("")}
    </div>
  `;

  bindImageFallbacks(host);
}

function renderGrowthVisual(key) {
  const visuals = {
    earthshow: `
      <div class="growth-earth" aria-hidden="true"><span></span></div>
    `,
    photo: `
      <div class="growth-camera" aria-hidden="true"><span class="camera-body"></span><span class="camera-lens"></span><span class="camera-flash"></span><span class="photo-card"></span></div>
    `,
    website: `
      <div class="growth-code" aria-hidden="true"><span></span><span></span><span></span><i></i></div>
    `,
    model: `
      <div class="growth-brain" aria-hidden="true"><span></span><span></span><i></i><i></i></div>
    `,
    video: `
      <div class="growth-video" aria-hidden="true"><span class="film"></span><span class="cut cut-a"></span><span class="cut cut-b"></span></div>
    `,
    language: `
      <div class="growth-language" aria-hidden="true"><span></span><span></span><i></i><i></i></div>
    `,
  };
  return visuals[key] || visuals.earthshow;
}

function renderHomeGrowth() {
  const host = document.getElementById("home-growth-section");
  if (!host) {
    return;
  }

  const directions = [
    { key: "earthshow", label: "EarthShow", desc: "把世界装进一个缓慢旋转的小地球里。" },
    { key: "photo", label: "摄影", desc: "记录真实好瞬间，留住光线和现场感。" },
    { key: "website", label: "做网站", desc: "把想法搭成页面，也把页面做成作品。" },
    { key: "model", label: "大模型", desc: "理解智能工具，尝试把想象力接进工作流。" },
    { key: "video", label: "剪视频", desc: "用时间轴、节奏和画面讲清楚一件事。" },
    { key: "language", label: "学外语", desc: "把语言练成通向别人世界的路。" },
  ];

  host.innerHTML = `
    <div class="home-growth-head">
      <h2>成长路线图 / 方向切换器</h2>
      <p>每 10 秒自动切换，也可以手动选择方向。</p>
    </div>
    <div class="home-growth-tabs" role="tablist" aria-label="成长方向">
      ${directions
        .map(
          (item, index) => `
            <button class="home-growth-tab${index === 0 ? " is-active" : ""}" type="button" role="tab" data-growth-tab="${item.key}" aria-selected="${index === 0 ? "true" : "false"}">
              ${escapeHtml(item.label)}
            </button>
          `,
        )
        .join("")}
    </div>
    <div class="home-growth-panels">
      ${directions
        .map(
          (item, index) => `
            <article class="home-growth-panel${index === 0 ? " is-active" : ""}" data-growth-panel="${item.key}">
              ${renderGrowthVisual(item.key)}
              <div class="home-growth-copy">
                <h3>${escapeHtml(item.label)}</h3>
                <p>${escapeHtml(item.desc)}</p>
              </div>
            </article>
          `,
        )
        .join("")}
    </div>
  `;
}

function setupHomeGrowthSwitcher() {
  const host = document.getElementById("home-growth-section");
  if (!host || host.dataset.growthBound === "1") {
    return;
  }

  host.dataset.growthBound = "1";
  const tabs = [...host.querySelectorAll("[data-growth-tab]")];
  const panels = [...host.querySelectorAll("[data-growth-panel]")];
  if (!tabs.length) {
    return;
  }

  let activeIndex = 0;
  let timer = null;
  const activate = (nextIndex, resetTimer = false) => {
    activeIndex = (nextIndex + tabs.length) % tabs.length;
    const key = tabs[activeIndex].dataset.growthTab;
    tabs.forEach((tab, index) => {
      const active = index === activeIndex;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", active ? "true" : "false");
    });
    panels.forEach((panel) => {
      panel.classList.toggle("is-active", panel.dataset.growthPanel === key);
    });
    if (resetTimer) {
      window.clearInterval(timer);
      timer = window.setInterval(() => activate(activeIndex + 1), 10000);
    }
  };

  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => activate(index, true));
  });
  timer = window.setInterval(() => activate(activeIndex + 1), 10000);
}

async function renderHomeCuratedSections(entries, _config) {
  renderHomeLatest(entries.filter((entry) => entry.contentType !== "notice"));
  window.dispatchEvent(new CustomEvent("home:curated-rendered"));
}

function renderProfileActionLinks(profile, options = {}) {
  const email = String(profile.email || "horafeng@outlook.com").trim();
  const github = String(profile.github || "https://github.com/horafeng").trim();
  const emailId = options.includeEmailId ? ' id="email-button"' : "";
  const githubId = options.includeGithubId ? ' id="github-button"' : "";

  return `
    <a
      ${githubId}
      class="profile-action-btn profile-action-icon"
      href="${github}"
      target="_blank"
      rel="noreferrer"
      aria-label="GitHub"
      title="GitHub"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2C6.48 2 2 6.58 2 12.22c0 4.5 2.87 8.32 6.84 9.66.5.09.68-.22.68-.49 0-.24-.01-1.04-.01-1.88-2.78.62-3.37-1.2-3.37-1.2-.46-1.18-1.11-1.49-1.11-1.49-.91-.64.07-.63.07-.63 1 .08 1.53 1.05 1.53 1.05.9 1.56 2.36 1.11 2.94.85.09-.67.35-1.11.63-1.37-2.22-.26-4.55-1.14-4.55-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.31.1-2.72 0 0 .84-.28 2.75 1.05A9.35 9.35 0 0 1 12 6.84c.85 0 1.71.12 2.51.35 1.91-1.33 2.75-1.05 2.75-1.05.55 1.41.2 2.46.1 2.72.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.8-4.57 5.06.36.32.69.95.69 1.93 0 1.39-.01 2.5-.01 2.84 0 .27.18.59.69.49A10.24 10.24 0 0 0 22 12.22C22 6.58 17.52 2 12 2Z" />
      </svg>
    </a>
    <a
      ${emailId}
      class="profile-action-btn profile-action-icon"
      href="mailto:${email}"
      aria-label="邮箱"
      title="邮箱"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 5.5h16A1.5 1.5 0 0 1 21.5 7v10A1.5 1.5 0 0 1 20 18.5H4A1.5 1.5 0 0 1 2.5 17V7A1.5 1.5 0 0 1 4 5.5Zm0 1.5v.18l8 5.34 8-5.34V7H4Zm16 10V8.96l-7.58 5.06a.75.75 0 0 1-.84 0L4 8.96V17h16Z" />
      </svg>
    </a>
  `;
}

function getMobileDrawerNavItems() {
  const params = new URLSearchParams(window.location.search);
  const content = String(params.get("content") || "").trim().toLowerCase();

  return [
    { href: "index.html", label: "首页", active: !content },
    { href: "index.html?content=article", label: "文章", active: content === "article" },
    { href: "index.html?content=note", label: "小记", active: content === "note" },
    { href: "archive.html", label: "归档", active: window.location.pathname.endsWith("/archive.html") },
  ];
}

function renderMobileDrawerNav() {
  const navItems = getMobileDrawerNavItems();
  return `
    <section class="mobile-drawer-card mobile-drawer-nav-card" aria-label="手机端导航">
      <nav class="mobile-drawer-nav" aria-label="手机端侧栏导航">
        <div class="mobile-drawer-section-head">
          <span class="mobile-drawer-section-kicker">页面</span>
        </div>
        <div class="mobile-drawer-nav-list">
          ${navItems
            .map(
              (item) => `
                <a class="mobile-drawer-nav-link${item.active ? " active" : ""}" href="${escapeAttr(item.href)}">
                  <span>${escapeHtml(item.label)}</span>
                </a>
              `,
            )
            .join("")}
        </div>
        <div class="mobile-drawer-secondary-list">
          <a class="mobile-drawer-secondary-link" href="index.html?content=notice">公告</a>
          <a class="mobile-drawer-secondary-link" href="guestbook.html">留言板</a>
          <a class="mobile-drawer-secondary-link" href="friends/">友链</a>
          <button class="mobile-drawer-secondary-link" type="button" data-mobile-search-trigger="1">搜索</button>
        </div>
      </nav>
    </section>
  `;
}

function renderProfile(config) {
  const profile = config.profile || {};

  const cover = document.getElementById("profile-cover");
  const avatar = document.getElementById("profile-avatar");
  const name = document.getElementById("profile-name");
  const handle = document.getElementById("profile-handle");
  const signature = document.getElementById("profile-signature");
  const bio = document.getElementById("profile-bio");
  const lastSeen = document.getElementById("profile-last-seen");
  const actions = document.querySelector("#desktop-profile-panel .profile-actions");
  const emailButton = document.getElementById("email-button");
  const githubButton = document.getElementById("github-button");

  if (profile.cover) {
    cover.style.backgroundImage = `url(${profile.cover})`;
    cover.style.backgroundSize = "cover";
    cover.style.backgroundPosition = "center";
  }

  avatar.src = profile.avatar || avatar.src;
  name.textContent = profile.name || "HoraFeng";
  handle.textContent = profile.handle || "@horafeng";
  signature.textContent = profile.signature || "";
  bio.textContent = profile.bio || "";
  lastSeen.textContent = formatLastSeen(profile.lastSeenAt);

  if (actions) {
    actions.innerHTML = renderProfileActionLinks(profile, { includeEmailId: true, includeGithubId: true });
  } else {
    if (githubButton) {
      githubButton.href = profile.github || "https://github.com/horafeng";
    }
    if (emailButton) {
      emailButton.href = `mailto:${profile.email || "horafeng@outlook.com"}`;
    }
  }

  const mobileSlot = document.getElementById("mobile-profile-slot");
  if (!mobileSlot) {
    return;
  }

  mobileSlot.innerHTML = `
    <section class="mobile-drawer-card mobile-drawer-profile-card" aria-label="博主信息">
      <div class="profile-cover" style="background-image:url(${profile.cover || ""});background-size:cover;background-position:center;"></div>
      <div class="profile-main compact mobile-drawer-profile" aria-label="博主信息">
        <img class="profile-avatar" src="${profile.avatar || avatar.src}" alt="博主头像" />
        <h1>${profile.name || "HoraFeng"}</h1>
        <p class="profile-handle">${profile.handle || "@horafeng"}</p>
        <p class="subtle">${profile.signature || ""}</p>
        <p class="subtle">${profile.bio || ""}</p>
        <p class="last-seen subtle">${formatLastSeen(profile.lastSeenAt)}</p>
      </div>
      <div class="profile-actions compact" aria-label="联系方式">
        ${renderProfileActionLinks(profile)}
      </div>
    </section>
    ${renderMobileDrawerNav()}
  `;
}

function setupWelcomeTyping() {
  const el = document.getElementById("home-welcome-typing");
  if (!el) {
    return;
  }

  if (welcomeTypingTimer) {
    window.clearTimeout(welcomeTypingTimer);
    welcomeTypingTimer = null;
  }

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion) {
    let idx = 0;
    el.textContent = WELCOME_LINES[idx];
    const rotate = () => {
      idx = (idx + 1) % WELCOME_LINES.length;
      el.textContent = WELCOME_LINES[idx];
      welcomeTypingTimer = window.setTimeout(rotate, 5000);
    };
    welcomeTypingTimer = window.setTimeout(rotate, 5000);
    return;
  }

  let lineIndex = 0;
  let charIndex = 0;
  let deleting = false;

  const tick = () => {
    const line = WELCOME_LINES[lineIndex];
    if (!deleting) {
      charIndex = Math.min(line.length, charIndex + 1);
      el.textContent = line.slice(0, charIndex);
      if (charIndex >= line.length) {
        deleting = true;
        welcomeTypingTimer = window.setTimeout(tick, WELCOME_LINE_HOLD_MS);
        return;
      }
      welcomeTypingTimer = window.setTimeout(tick, WELCOME_TYPE_DELAY_MS);
      return;
    }

    charIndex = Math.max(1, charIndex - 1);
    el.textContent = line.slice(0, charIndex);
    if (charIndex <= 1) {
      deleting = false;
      lineIndex = (lineIndex + 1) % WELCOME_LINES.length;
      charIndex = 0;
      welcomeTypingTimer = window.setTimeout(tick, 180);
      return;
    }
    welcomeTypingTimer = window.setTimeout(tick, WELCOME_DELETE_DELAY_MS);
  };

  tick();
}

function setupNoticeOverlay() {
  const overlay = document.getElementById("notice-overlay");
  const close = document.getElementById("notice-close");
  if (!overlay) {
    return { open: () => {}, close: () => {} };
  }

  const closeNotice = () => {
    overlay.classList.remove("open");
    overlay.hidden = true;
    if (document.getElementById("post-overlay")?.hidden !== false) {
      document.body.classList.remove("no-scroll");
    }
  };

  const extractNoticeLines = (notice) => {
    const direct = Array.isArray(notice?.content) ? notice.content.map((line) => String(line || "").trim()).filter(Boolean) : [];
    if (direct.length) {
      return direct;
    }

    const fromContentLines = Array.isArray(notice?.content_lines)
      ? notice.content_lines.map((line) => String(line || "").trim()).filter(Boolean)
      : [];
    if (fromContentLines.length) {
      return fromContentLines;
    }

    const fromBlocks = Array.isArray(notice?.blocks)
      ? notice.blocks
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
    if (fromBlocks.length) {
      return fromBlocks;
    }

    const summary = String(notice?.summary || "").trim();
    return summary ? [summary] : [];
  };

  const buildNoticeExcerpt = (lines, limit = 120) => {
    const joined = lines.join(" ").replace(/\s+/g, " ").trim();
    if (!joined) {
      return "";
    }
    if (joined.length <= limit) {
      return joined;
    }
    return `${joined.slice(0, Math.max(0, limit - 3)).trimEnd()}...`;
  };

  const openNotice = (notice) => {
    const title = document.getElementById("notice-title");
    const meta = document.getElementById("notice-meta");
    const content = document.getElementById("notice-content");
    if (!title || !meta || !content) {
      return;
    }

    title.textContent = notice.title || "公告";
    meta.innerHTML = `<span>${escapeHtml(notice.date || "")}</span><span>阅读提醒</span>`;
    const lines = extractNoticeLines(notice);
    const mobileMode = window.matchMedia("(max-width: 767px)").matches;
    if (!lines.length) {
      content.innerHTML = "<p>本条公告暂无详细正文。</p>";
    } else if (mobileMode) {
      content.innerHTML = `<p class="notice-content-clamped">${linkify(buildNoticeExcerpt(lines))}</p>`;
    } else {
      content.innerHTML = lines.map((line) => `<p>${linkify(line)}</p>`).join("");
    }
    overlay.hidden = false;
    overlay.classList.add("open");
    document.body.classList.add("no-scroll");
  };

  close?.addEventListener("click", closeNotice);
  overlay.addEventListener("click", (event) => {
    const target = event.target;
    if (target instanceof HTMLElement && target.dataset.closeNotice === "1") {
      closeNotice();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !overlay.hidden) {
      closeNotice();
    }
  });

  return { open: openNotice, close: closeNotice };
}

async function maybeShowLatestNotice(noticeController) {
  const notices = await loadNoticeIndex();
  if (!notices.length) {
    return;
  }

  const pinned = notices
    .filter((item) => Boolean(item?.pin))
    .sort((a, b) => {
      const updatedDiff = new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime();
      if (updatedDiff !== 0) {
        return updatedDiff;
      }
      return new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime();
    });
  const latest = pinned[0];
  if (!latest) {
    return;
  }

  const navigation = performance.getEntriesByType("navigation")[0];
  const navType = navigation?.type || "navigate";
  if (navType === "reload") {
    window.localStorage.removeItem(NOTICE_STORAGE_KEY);
  }

  const token = `${latest.id}:${latest.date || ""}`;
  if (window.localStorage.getItem(NOTICE_STORAGE_KEY) === token) {
    return;
  }

  window.localStorage.setItem(NOTICE_STORAGE_KEY, token);
  noticeController.open(latest);
}

function filterByParams(entries) {
  const params = new URLSearchParams(window.location.search);
  const tag = params.get("tag");
  const archive = params.get("archive");
  const contentType = params.get("content");
  const heading = document.getElementById("timeline-heading");

  if (contentType === "article") {
    document.body.dataset.homeLayout = "article-list";
  } else {
    delete document.body.dataset.homeLayout;
  }

  let list = entries;
  if (contentType) {
    list = list.filter((entry) => entry.contentType === contentType);
    if (contentType === "notice") {
      list = [...list].sort((a, b) => {
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
    heading.textContent =
      contentType === "article"
        ? "\u6700\u8fd1\u6587\u7ae0"
        : contentType === "notice"
          ? "\u6700\u8fd1\u516c\u544a"
          : "\u6700\u8fd1\u5c0f\u8bb0";
  } else if (tag) {
    heading.textContent = `标签：#${tag}`;
    list = list.filter((entry) => entry.contentType !== "notice" && entry.tags.includes(tag));
  } else if (archive) {
    heading.textContent = `归档：${archive}`;
    list = list.filter((entry) => entry.contentType !== "notice" && entry.date.startsWith(archive));
  } else {
    heading.textContent = "首页内容";
    list = list.filter((entry) => entry.contentType !== "notice");
  }

  return list;
}

function setupSearch(noticeController = null) {
  const form = document.getElementById("search-form");
  const input = document.getElementById("search-input");
  const hint = document.getElementById("search-hint");
  const mobileOverlay = document.getElementById("mobile-search-overlay");
  const mobileForm = document.getElementById("mobile-search-form");
  const mobileInput = document.getElementById("mobile-search-input");
  const mobileClose = document.getElementById("mobile-search-close");

  const applyQuery = (rawQuery) => {
    const query = String(rawQuery || "");
    const results = searchEntries(visibleEntries, query);
    renderTimeline(results);
    bindTimelineClicks(noticeController);
    hint.textContent = query.trim() ? `关键词 “${query.trim()}” 命中 ${results.length} 条` : "";
    return results;
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    applyQuery(input.value);
  });

  input.addEventListener("input", () => {
    applyQuery(input.value);
  });

  const closeMobileSearch = () => {
    if (!mobileOverlay) {
      return;
    }
    mobileOverlay.classList.remove("open");
    document.body.classList.remove("mobile-search-open");
    window.setTimeout(() => {
      if (!mobileOverlay.classList.contains("open")) {
        mobileOverlay.hidden = true;
      }
    }, 220);
  };

  const openMobileSearch = () => {
    if (!mobileOverlay) {
      return;
    }
    mobileOverlay.hidden = false;
    requestAnimationFrame(() => {
      mobileOverlay.classList.add("open");
      document.body.classList.add("mobile-search-open");
      if (mobileInput) {
        mobileInput.value = input?.value || "";
        window.setTimeout(() => mobileInput.focus(), 120);
      }
    });
  };

  mobileForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    if (input && mobileInput) {
      input.value = mobileInput.value;
      applyQuery(mobileInput.value);
    }
    closeMobileSearch();
  });

  mobileInput?.addEventListener("input", () => {
    if (input) {
      input.value = mobileInput.value;
      applyQuery(mobileInput.value);
    }
  });

  mobileClose?.addEventListener("click", closeMobileSearch);
  mobileOverlay?.querySelectorAll("a[href]").forEach((link) => {
    link.addEventListener("click", closeMobileSearch);
  });
  mobileOverlay?.addEventListener("click", (event) => {
    const target = event.target;
    if (target instanceof HTMLElement && target.dataset.closeMobileSearch === "1") {
      closeMobileSearch();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && mobileOverlay && !mobileOverlay.hidden) {
      closeMobileSearch();
    }
  });

  const initialQuery = String(new URLSearchParams(window.location.search).get("q") || "").trim();
  if (initialQuery) {
    if (input) {
      input.value = initialQuery;
    }
    if (mobileInput) {
      mobileInput.value = initialQuery;
    }
    applyQuery(initialQuery);
  }

  return {
    openMobileSearch,
    closeMobileSearch,
    applyQuery,
  };
}

function setupDesktopSidebarLayout() {
  const sidePanel = document.getElementById("desktop-side-panel");
  if (!sidePanel) {
    return;
  }

  const desktopMedia = window.matchMedia("(min-width: 1024px)");
  let resizeObserver = null;

  const updateSidebarMode = () => {
    if (!desktopMedia.matches) {
      sidePanel.style.position = "";
      sidePanel.style.top = "";
      sidePanel.style.maxHeight = "";
      sidePanel.style.overflow = "";
      return;
    }

    const stickyTop = parseFloat(getComputedStyle(document.body).getPropertyValue("--site-sticky-top")) || 72;
    const availableHeight = Math.max(280, window.innerHeight - stickyTop - 16);
    const naturalHeight = sidePanel.scrollHeight;
    const shouldFlow = naturalHeight > availableHeight + 8;

    sidePanel.style.position = shouldFlow ? "relative" : "sticky";
    sidePanel.style.top = shouldFlow ? "0px" : "var(--site-sticky-top)";
    sidePanel.style.maxHeight = shouldFlow ? "none" : "calc(100vh - var(--site-sticky-top) - 16px)";
    sidePanel.style.overflow = "visible";
  };

  window.addEventListener("resize", updateSidebarMode);
  window.addEventListener("load", updateSidebarMode);
  if ("ResizeObserver" in window) {
    resizeObserver = new ResizeObserver(() => updateSidebarMode());
    resizeObserver.observe(sidePanel);
  }
  void resizeObserver;
  requestAnimationFrame(updateSidebarMode);
  window.setTimeout(updateSidebarMode, 180);
}

function isMobileHomeViewport() {
  return document.body.dataset.page === "home" && window.matchMedia("(max-width: 767px)").matches;
}

function syncMobileOverlayChrome(isOpen) {
  if (!isMobileHomeViewport()) {
    document.body.classList.remove("mobile-post-open");
    return;
  }

  document.body.classList.toggle("mobile-post-open", Boolean(isOpen));
}

function showMediaUI() {
  const viewer = document.getElementById("media-viewer");
  if (!viewer || currentImages.length < 2) {
    return;
  }

  viewer.classList.add("ui-visible");
  window.clearTimeout(mediaUiTimer);
  mediaUiTimer = window.setTimeout(() => {
    viewer.classList.remove("ui-visible");
  }, 1200);
}

function markActiveSlide() {
  const track = document.getElementById("media-track");
  if (!track) {
    return;
  }

  track.querySelectorAll(".media-slide").forEach((slide, idx) => {
    slide.classList.toggle("is-active", idx === currentImageIndex);
  });
}

function updateMediaPosition(nextIndex, options = {}) {
  const { animated = true } = options;
  if (currentImages.length < 2) {
    return;
  }

  currentImageIndex = (nextIndex + currentImages.length) % currentImages.length;

  const track = document.getElementById("media-track");
  const counter = document.getElementById("media-counter");
  if (!track || !counter) {
    return;
  }

  track.style.transition = animated ? "transform 320ms cubic-bezier(0.22, 0.8, 0.28, 1)" : "none";
  track.style.transform = `translate3d(${-currentImageIndex * 100}%, 0, 0)`;
  counter.textContent = `${currentImageIndex + 1}/${currentImages.length}`;
  markActiveSlide();
  showMediaUI();
}

function shiftImage(delta) {
  if (currentImages.length < 2) {
    return;
  }

  updateMediaPosition(currentImageIndex + delta, { animated: true });
}

function bindMediaKeyboard() {
  if (mediaKeydownHandler || currentImages.length < 2) {
    return;
  }

  mediaKeydownHandler = (event) => {
    const overlay = document.getElementById("post-overlay");
    if (overlay.hidden) {
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      shiftImage(-1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      shiftImage(1);
    }
  };

  document.addEventListener("keydown", mediaKeydownHandler);
}

function unbindMediaKeyboard() {
  if (!mediaKeydownHandler) {
    return;
  }

  document.removeEventListener("keydown", mediaKeydownHandler);
  mediaKeydownHandler = null;
}

function bindMultiImageInteractions() {
  const viewer = document.getElementById("media-viewer");
  const track = document.getElementById("media-track");
  const prev = document.getElementById("media-prev");
  const next = document.getElementById("media-next");

  if (!viewer || !track || !prev || !next || currentImages.length < 2) {
    return;
  }

  prev.addEventListener("click", () => shiftImage(-1));
  next.addEventListener("click", () => shiftImage(1));

  viewer.addEventListener("mouseenter", showMediaUI);
  viewer.addEventListener("mousemove", showMediaUI);
  viewer.addEventListener("mouseleave", () => {
    window.clearTimeout(mediaUiTimer);
    mediaUiTimer = window.setTimeout(() => viewer.classList.remove("ui-visible"), 420);
  });

  viewer.addEventListener(
    "wheel",
    (event) => {
      if (wheelLock) {
        return;
      }

      event.preventDefault();
      showMediaUI();
      wheelLock = true;
      shiftImage(event.deltaY > 0 ? 1 : -1);
      window.setTimeout(() => {
        wheelLock = false;
      }, 240);
    },
    { passive: false },
  );

  viewer.addEventListener("pointerdown", (event) => {
    const rect = viewer.getBoundingClientRect();
    dragState = {
      startX: event.clientX,
      startY: event.clientY,
      deltaX: 0,
      deltaY: 0,
      width: rect.width,
      axisLocked: null,
    };

    viewer.classList.add("dragging");
    track.style.transition = "none";
    showMediaUI();
  });

  viewer.addEventListener("pointermove", (event) => {
    if (!dragState) {
      return;
    }

    dragState.deltaX = event.clientX - dragState.startX;
    dragState.deltaY = event.clientY - dragState.startY;

    if (!dragState.axisLocked) {
      const absX = Math.abs(dragState.deltaX);
      const absY = Math.abs(dragState.deltaY);
      if (absX < 6 && absY < 6) {
        return;
      }

      dragState.axisLocked = absX >= absY ? "x" : "y";
    }

    if (dragState.axisLocked === "y") {
      return;
    }

    event.preventDefault();
    const dragPercent = (dragState.deltaX / dragState.width) * 100;
    track.style.transform = `translate3d(calc(${-currentImageIndex * 100}% + ${dragPercent}%), 0, 0)`;
  });

  const endDrag = () => {
    if (!dragState) {
      return;
    }

    const threshold = dragState.width * 0.16;
    const delta = dragState.deltaX;
    const horizontalGesture = dragState.axisLocked !== "y";
    viewer.classList.remove("dragging");

    if (horizontalGesture && Math.abs(delta) > threshold) {
      shiftImage(delta < 0 ? 1 : -1);
    } else {
      updateMediaPosition(currentImageIndex, { animated: true });
    }

    dragState = null;
  };

  viewer.addEventListener("pointerup", endDrag);
  viewer.addEventListener("pointercancel", endDrag);
  viewer.addEventListener("pointerleave", () => {
    if (dragState) {
      endDrag();
    }
  });

  bindMediaKeyboard();
  showMediaUI();
}

function renderMediaCarousel(images, title, fallbackKey = "modal") {
  const media = document.getElementById("post-media");
  currentImages = images || [];
  currentImageIndex = 0;
  wheelLock = false;
  dragState = null;

  if (!media) {
    return;
  }

  if (!currentImages.length) {
    unbindMediaKeyboard();
    media.innerHTML = '<div class="media-empty subtle">这条帖子没有配图。</div>';
    return;
  }

  if (currentImages.length === 1) {
    unbindMediaKeyboard();
    media.innerHTML = `
      <div class="media-viewer single" id="media-viewer">
        <img class="post-main-image" src="${escapeAttr(currentImages[0])}" data-fallback="${escapeAttr(getFallbackCover(fallbackKey))}" alt="${escapeAttr(title)}" loading="lazy" />
      </div>
    `;
    bindImageFallbacks(media);
    return;
  }

  media.innerHTML = `
    <div class="media-viewer multi" id="media-viewer">
      <div class="media-track" id="media-track" style="transform: translate3d(0,0,0)">
        ${currentImages
          .map((url, idx) => `<div class="media-slide${idx === 0 ? " is-active" : ""}"><img class="post-main-image" src="${escapeAttr(url)}" data-fallback="${escapeAttr(getFallbackCover(`${fallbackKey}-${idx}`))}" alt="${escapeAttr(title)}" loading="lazy" /></div>`)
          .join("")}
      </div>
      <button type="button" class="media-nav prev" id="media-prev" aria-label="上一张">‹</button>
      <button type="button" class="media-nav next" id="media-next" aria-label="下一张">›</button>
      <p class="media-counter" id="media-counter">1/${currentImages.length}</p>
    </div>
  `;

  bindImageFallbacks(media);
  bindMultiImageInteractions();
}

function bindLikeControl(layout) {
  const likeButton = layout.querySelector("[data-like-button]");
  const likeCount = layout.querySelector("[data-like-count]");
  if (!likeButton || !likeCount) {
    return;
  }

  likeButton.addEventListener("click", () => {
    const active = likeButton.classList.toggle("active");
    const value = Number.parseInt(likeCount.textContent || "0", 10);
    const next = active ? value + 1 : Math.max(0, value - 1);
    likeCount.textContent = String(next);
  });
}

function renderTextOnlyPost(entry) {
  const layout = document.getElementById("post-layout");
  const modal = document.getElementById("post-modal");
  const profile = siteConfig?.profile || {};
  const authorName = entry.author || profile.name || "HoraFeng";
  const avatar = profile.avatar || "https://dummyimage.com/120x120/f3f5f8/8a94a6&text=HF";
  const likes = Number.isFinite(entry.likes) ? entry.likes : 1;

  modal?.classList.remove("post-modal-note-split");

  layout.classList.add("text-only");
  layout.classList.remove("has-media-split");
  layout.innerHTML = `
    <section class="text-post-card">
      <header class="text-post-head">
        <img class="text-post-avatar" src="${escapeAttr(avatar)}" alt="作者头像" />
        <div class="text-post-head-meta">
          <h3>闲谈</h3>
          <p>作者：${escapeHtml(authorName)} · 时间：${escapeHtml(entry.date)}</p>
        </div>
      </header>

      <article class="text-post-body">
        ${entry.content.map((line) => `<p>${linkify(line)}</p>`).join("")}
      </article>

      <button type="button" class="text-post-like" data-like-button>
        <span>♡</span>
        <span><span data-like-count>${likes}</span> 点赞</span>
      </button>

      <section id="post-comments-host" class="post-comments-host"></section>
    </section>
  `;

  bindImageFallbacks(layout);
  bindLikeControl(layout);
}

function renderImagePost(entry) {
  const layout = document.getElementById("post-layout");
  const modal = document.getElementById("post-modal");

  modal?.classList.add("post-modal-note-split");
  layout.classList.remove("text-only");
  layout.classList.add("has-media-split");
  layout.innerHTML = `
    <section class="post-media" id="post-media"></section>
    <section class="post-content">
      <h3 id="post-title">${escapeHtml(entry.title)}</h3>
      <p id="post-meta" class="entry-meta"><span>${escapeHtml(entry.date)}</span><span>${escapeHtml(entry.mood || "")}</span></p>
      <div id="post-tags" class="chips compact">${entry.tags.map((tag) => `<span class="chip">#${escapeHtml(tag)}</span>`).join("")}</div>
      <div id="post-body" class="entry-detail">${entry.content.map((line) => `<p>${linkify(line)}</p>`).join("")}</div>
      <section id="post-comments-host" class="post-comments-host"></section>
    </section>
  `;

  renderMediaCarousel(entry.images, entry.title, entry.id);
}

function getNoteCommentPageKey(entry) {
  return `note:${entry.id}`;
}

function teardownPostComments() {
  currentCommentWidget?.destroy?.();
  currentCommentWidget = null;
}

function mountPostComments(entry) {
  teardownPostComments();

  const host = document.getElementById("post-comments-host");
  if (!host) {
    return;
  }

  currentCommentWidget = mountContentComments({
    container: host,
    pageKey: getNoteCommentPageKey(entry),
    mode: "note",
  });
}

function renderPostModal(entry) {
  const mobileAvatar = document.getElementById("post-mobile-avatar");
  const mobileName = document.getElementById("post-mobile-name");
  const profile = siteConfig?.profile || {};
  const authorName = entry.author || profile.name || "HoraFeng";

  if (mobileAvatar) {
    mobileAvatar.src = profile.avatar || mobileAvatar.src;
  }

  if (mobileName) {
    mobileName.textContent = authorName;
  }

  if (entry.images.length === 0) {
    currentImages = [];
    currentImageIndex = 0;
    unbindMediaKeyboard();
    renderTextOnlyPost(entry);
    mountPostComments(entry);
    return;
  }

  renderImagePost(entry);
  mountPostComments(entry);
}

function getSharedSourceElement(entryId) {
  const safeId = window.CSS?.escape ? window.CSS.escape(entryId) : entryId;
  const card = document.querySelector(`.entry-card[data-entry-id="${safeId}"]`);
  if (!card) {
    return null;
  }

  return card.querySelector(".entry-cover") || card.querySelector(".entry-shell") || card;
}

function getSharedTargetElement() {
  const activeImage = document.querySelector(".media-slide.is-active .post-main-image");
  if (activeImage) {
    return activeImage;
  }

  const singleImage = document.querySelector("#media-viewer.single .post-main-image");
  if (singleImage) {
    return singleImage;
  }

  const textCard = document.querySelector(".text-post-card");
  if (textCard) {
    return textCard;
  }

  return document.getElementById("post-modal");
}

function waitForSharedMediaReady() {
  const img = document.querySelector("#post-media .post-main-image");
  if (!img) {
    return Promise.resolve();
  }

  if (img.complete && img.naturalWidth > 0) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const done = () => resolve();
    img.addEventListener("load", done, { once: true });
    img.addEventListener("error", done, { once: true });
  });
}

function createSharedClone(source) {
  const rect = source.getBoundingClientRect();
  const clone = source.cloneNode(true);
  clone.classList.add("shared-clone");
  clone.style.position = "fixed";
  clone.style.left = `${rect.left}px`;
  clone.style.top = `${rect.top}px`;
  clone.style.width = `${rect.width}px`;
  clone.style.height = `${rect.height}px`;
  clone.style.margin = "0";
  clone.style.zIndex = "140";
  clone.style.pointerEvents = "none";

  if (clone.tagName.toLowerCase() === "img") {
    clone.style.objectFit = "cover";
  }

  document.body.appendChild(clone);
  return { clone };
}

function animateShared(source, target, options = {}) {
  const { duration = 300, easing = "cubic-bezier(0.2, 0.85, 0.22, 1)", reverse = false } = options;

  if (!source || !target) {
    return Promise.resolve(false);
  }

  const fromRect = reverse ? target.getBoundingClientRect() : source.getBoundingClientRect();
  const toRect = reverse ? source.getBoundingClientRect() : target.getBoundingClientRect();

  const { clone } = createSharedClone(reverse ? target : source);
  clone.style.left = `${fromRect.left}px`;
  clone.style.top = `${fromRect.top}px`;
  clone.style.width = `${fromRect.width}px`;
  clone.style.height = `${fromRect.height}px`;

  source.style.visibility = "hidden";
  target.style.visibility = "hidden";

  return new Promise((resolve) => {
    const animation = clone.animate(
      [
        {
          left: `${fromRect.left}px`,
          top: `${fromRect.top}px`,
          width: `${fromRect.width}px`,
          height: `${fromRect.height}px`,
          borderRadius: "12px",
        },
        {
          left: `${toRect.left}px`,
          top: `${toRect.top}px`,
          width: `${toRect.width}px`,
          height: `${toRect.height}px`,
          borderRadius: window.innerWidth < 768 ? "0px" : "12px",
        },
      ],
      { duration, easing, fill: "forwards" },
    );

    animation.onfinish = () => {
      clone.remove();
      source.style.visibility = "";
      target.style.visibility = "";
      resolve(true);
    };
  });
}

function hidePostOverlay() {
  const overlay = document.getElementById("post-overlay");
  const modal = document.getElementById("post-modal");

  modal.style.transform = "";
  modal.style.opacity = "";
  modal.style.transition = "";
  modal.style.willChange = "";
  modal.style.transformOrigin = "";
  modal.classList.remove("post-modal-note-split");

  overlay.hidden = true;
  overlay.classList.remove("open", "closing", "shared-transition", "mobile-lite", "mobile-ready");
  document.body.classList.remove("no-scroll");
  syncMobileOverlayChrome(false);
  window.clearTimeout(mediaUiTimer);
  unbindMediaKeyboard();
  teardownPostComments();
}

function getViewportCenter() {
  return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
}

function resolveOrigin(origin) {
  if (!origin || !Number.isFinite(origin.x) || !Number.isFinite(origin.y)) {
    return getViewportCenter();
  }

  return {
    x: Math.max(0, Math.min(window.innerWidth, origin.x)),
    y: Math.max(0, Math.min(window.innerHeight, origin.y)),
  };
}

async function animateModalFromOrigin(origin, reverse = false) {
  const modal = document.getElementById("post-modal");
  const point = resolveOrigin(origin);
  const rect = modal.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const deltaX = point.x - centerX;
  const deltaY = point.y - centerY;
  const startScale = window.matchMedia("(max-width: 767px)").matches ? 0.08 : 0.12;
  const duration = reverse ? 300 : 380;
  const easing = "cubic-bezier(0.2, 0.84, 0.24, 1)";

  modal.style.willChange = "transform, opacity";
  modal.style.transformOrigin = "50% 50%";

  if (!reverse) {
    modal.style.transition = "none";
    modal.style.opacity = "0.25";
    modal.style.transform = `translate3d(${deltaX}px, ${deltaY}px, 0) scale(${startScale})`;
    modal.getBoundingClientRect();
    modal.style.transition = `transform ${duration}ms ${easing}, opacity ${duration - 70}ms ease`;
    modal.style.opacity = "1";
    modal.style.transform = "translate3d(0, 0, 0) scale(1)";
  } else {
    modal.style.transition = `transform ${duration}ms ${easing}, opacity ${duration - 80}ms ease`;
    modal.style.opacity = "0";
    modal.style.transform = `translate3d(${deltaX}px, ${deltaY}px, 0) scale(${startScale})`;
  }

  await new Promise((resolve) => window.setTimeout(resolve, duration + 20));
  modal.style.transition = "";
  modal.style.willChange = "";
}

async function closePostDirect() {
  const overlay = document.getElementById("post-overlay");
  if (overlay.hidden) {
    return;
  }

  overlay.classList.add("closing");
  await animateModalFromOrigin(lastOpenOrigin, true);
  hidePostOverlay();
  currentPostId = null;
}

function closePost() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("post")) {
    history.back();
    return;
  }

  closePostDirect();
}

async function openPostById(id, pushState = true, origin = null) {
  const entry = allEntries.find((item) => item.id === id);
  if (!entry) {
    return;
  }

  currentPostId = id;
  lastOpenOrigin = resolveOrigin(origin);

  const overlay = document.getElementById("post-overlay");
  overlay.hidden = false;
  overlay.classList.remove("closing", "mobile-ready", "mobile-lite", "shared-transition");
  overlay.classList.add("open");
  document.body.classList.add("no-scroll");
  syncMobileOverlayChrome(true);

  renderPostModal(entry);
  await animateModalFromOrigin(lastOpenOrigin, false);

  if (pushState) {
    const params = new URLSearchParams(window.location.search);
    params.set("post", id);
    history.pushState({ post: id }, "", `${window.location.pathname}?${params.toString()}`);
  }
}

function setupOverlayControls() {
  const overlay = document.getElementById("post-overlay");
  const closeButton = document.getElementById("post-close");
  const closeMobileButton = document.getElementById("post-close-mobile");
  const modal = document.getElementById("post-modal");

  closeButton.addEventListener("click", closePost);
  if (closeMobileButton) {
    closeMobileButton.addEventListener("click", closePost);
  }
  overlay.addEventListener("click", (event) => {
    const target = event.target;
    if (target instanceof HTMLElement && target.dataset.closeOverlay === "1") {
      closePost();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closePost();
    }
  });

  window.addEventListener("popstate", async () => {
    const params = new URLSearchParams(window.location.search);
    const postId = params.get("post");

    if (postId) {
      await openPostById(postId, false);
    } else {
      await closePostDirect();
    }
  });

  const isMobile = () => window.matchMedia("(max-width: 767px)").matches;

  const clearGesture = () => {
    dismissDragState = null;
    modal.style.transition = "";
    modal.style.transform = "";
    modal.style.opacity = "";
    modal.style.willChange = "";
  };

  const restoreModal = () => {
    modal.style.transition = "transform 240ms cubic-bezier(0.2, 0.8, 0.24, 1), opacity 220ms ease";
    modal.style.transform = "";
    modal.style.opacity = "";
    window.setTimeout(() => {
      if (!dismissDragState) {
        modal.style.transition = "";
        modal.style.willChange = "";
      }
    }, 260);
  };

  modal.addEventListener("pointerdown", (event) => {
    if (!isMobile() || overlay.hidden || event.pointerType === "mouse") {
      return;
    }

    if (event.target instanceof HTMLElement && event.target.closest("#media-viewer")) {
      return;
    }

    if (modal.scrollTop > 4) {
      return;
    }

    dismissDragState = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      deltaX: 0,
      deltaY: 0,
      engaged: false,
      closing: false,
      mode: null,
      allowEdgeSwipe: event.clientX <= 28 || Boolean(event.target instanceof HTMLElement && event.target.closest(".post-mobile-header")),
    };

    modal.setPointerCapture(event.pointerId);
    modal.style.transition = "none";
    modal.style.willChange = "transform, opacity";
  });

  modal.addEventListener("pointermove", (event) => {
    if (!dismissDragState || event.pointerId !== dismissDragState.id || dismissDragState.closing) {
      return;
    }

    const deltaX = event.clientX - dismissDragState.startX;
    const deltaY = event.clientY - dismissDragState.startY;
    dismissDragState.deltaX = deltaX;

    if (!dismissDragState.engaged) {
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);
      if (absX < 8 && absY < 8) {
        return;
      }

      if (dismissDragState.allowEdgeSwipe && deltaX > 0 && absX > absY) {
        dismissDragState.engaged = true;
        dismissDragState.mode = "edge";
      } else if (absY > absX) {
        dismissDragState.engaged = true;
        dismissDragState.mode = "vertical";
      } else {
        clearGesture();
        return;
      }
    }

    if (dismissDragState.mode === "edge") {
      event.preventDefault();
      const drift = Math.max(0, deltaX);
      const scale = Math.max(0.96, 1 - drift / 1800);
      const opacity = Math.max(0.54, 1 - drift / (window.innerWidth * 1.2));
      modal.style.transform = `translate3d(${drift}px, 0, 0) scale(${scale})`;
      modal.style.opacity = String(opacity);
      return;
    }

    dismissDragState.deltaY = deltaY;

    if (deltaY >= 0) {
      const drift = Math.min(deltaY * 0.16, 20);
      const scale = Math.max(0.98, 1 - deltaY / 1000);
      modal.style.transform = `translate3d(0, ${drift}px, 0) scale(${scale})`;
      modal.style.opacity = String(Math.max(0.9, 1 - deltaY / 1300));
      return;
    }

    event.preventDefault();
    const lift = Math.min(Math.abs(deltaY), 300);
    const scale = Math.max(0.84, 1 - lift / 1500);
    const opacity = Math.max(0.58, 1 - lift / 520);
    modal.style.transform = `translate3d(0, -${lift}px, 0) scale(${scale})`;
    modal.style.opacity = String(opacity);
  });

  const endDismissGesture = (event) => {
    if (!dismissDragState || event.pointerId !== dismissDragState.id || dismissDragState.closing) {
      return;
    }

    if (modal.hasPointerCapture(event.pointerId)) {
      modal.releasePointerCapture(event.pointerId);
    }

    const shouldClose =
      dismissDragState.mode === "edge"
        ? dismissDragState.deltaX > Math.min(160, window.innerWidth * 0.28)
        : dismissDragState.deltaY < -120;
    if (!shouldClose) {
      dismissDragState = null;
      restoreModal();
      return;
    }

    dismissDragState.closing = true;
    modal.style.transition = "transform 180ms cubic-bezier(0.22, 0.82, 0.22, 1), opacity 150ms ease";
    modal.style.transform =
      dismissDragState.mode === "edge" ? "translate3d(42vw, 0, 0) scale(0.94)" : "translate3d(0, -42vh, 0) scale(0.9)";
    modal.style.opacity = "0";

    window.setTimeout(() => {
      dismissDragState = null;
      const params = new URLSearchParams(window.location.search);
      if (params.get("post")) {
        params.delete("post");
        const next = params.toString();
        history.replaceState({}, "", next ? `${window.location.pathname}?${next}` : window.location.pathname);
      }
      hidePostOverlay();
      currentPostId = null;
    }, 140);
  };

  modal.addEventListener("pointerup", endDismissGesture);
  modal.addEventListener("pointercancel", endDismissGesture);
}

function bindTimelineClicks(noticeController = null) {
  document.querySelectorAll(".entry-card[data-entry-id]").forEach((card) => {
    card.addEventListener("click", async (event) => {
      event.preventDefault();
      const entry = allEntries.find((item) => item.id === card.dataset.entryId);
      if (entry?.contentType === "notice") {
        noticeController?.open?.(entry);
        return;
      }

      const origin = {
        x: event.clientX || card.getBoundingClientRect().left + card.getBoundingClientRect().width / 2,
        y: event.clientY || card.getBoundingClientRect().top + card.getBoundingClientRect().height / 2,
      };
      await openPostById(card.dataset.entryId, true, origin);
    });

    card.addEventListener("keydown", async (event) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }

      event.preventDefault();
      const entry = allEntries.find((item) => item.id === card.dataset.entryId);
      if (entry?.contentType === "notice") {
        noticeController?.open?.(entry);
        return;
      }

      const rect = card.getBoundingClientRect();
      await openPostById(card.dataset.entryId, true, { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
    });
  });
}

function setupMobileDrawer(searchController) {
  const trigger = document.getElementById("mobile-drawer-trigger");
  const overlay = document.getElementById("mobile-drawer-overlay");
  const closeButton = document.getElementById("mobile-drawer-close");
  const topProfileButton = document.getElementById("mobile-home-profile");
  const openDrawer = () => {
    document.body.classList.add("mobile-home-drawer-open");
    overlay.hidden = false;
    requestAnimationFrame(() => overlay.classList.add("open"));
  };

  const closeDrawer = () => {
    document.body.classList.remove("mobile-home-drawer-open");
    overlay.classList.remove("open");
    window.setTimeout(() => {
      if (!overlay.classList.contains("open")) {
        overlay.hidden = true;
      }
    }, 220);
  };

  trigger.addEventListener("click", openDrawer);
  topProfileButton?.addEventListener("click", openDrawer);
  closeButton.addEventListener("click", closeDrawer);
  overlay.querySelectorAll("a[href]").forEach((link) => {
    link.addEventListener("click", closeDrawer);
  });
  overlay.querySelectorAll("[data-mobile-search-trigger]").forEach((button) => {
    button.addEventListener("click", () => {
      closeDrawer();
      searchController?.openMobileSearch?.();
    });
  });
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      closeDrawer();
    }
  });
}

function setupMobileHomeChrome(searchController) {
  const searchButton = document.getElementById("mobile-home-search");
  let lastScrollY = window.scrollY;
  let ticking = false;
  let lastTouchY = null;

  const showTopbar = () => {
    document.body.classList.remove("mobile-home-nav-hidden");
  };

  const hideTopbar = () => {
    if (
      document.body.classList.contains("mobile-post-open") ||
      document.body.classList.contains("mobile-home-drawer-open") ||
      document.body.classList.contains("mobile-search-open")
    ) {
      return;
    }
    document.body.classList.add("mobile-home-nav-hidden");
  };

  const syncMobileTopbar = () => {
    if (!isMobileHomeViewport()) {
      showTopbar();
      lastScrollY = window.scrollY || document.documentElement.scrollTop || 0;
      lastTouchY = null;
      ticking = false;
      return;
    }

    const currentY = window.scrollY || document.documentElement.scrollTop || 0;
    const delta = currentY - lastScrollY;

    if (currentY <= 18 || currentY < 0) {
      showTopbar();
    } else if (delta > 8) {
      hideTopbar();
    } else if (delta < -8) {
      showTopbar();
    }

    lastScrollY = currentY;
    ticking = false;
  };

  const onScroll = () => {
    if (!ticking) {
      ticking = true;
      window.requestAnimationFrame(syncMobileTopbar);
    }
  };

  const onTouchStart = (event) => {
    if (!isMobileHomeViewport() || event.touches.length !== 1) {
      return;
    }
    lastTouchY = event.touches[0].clientY;
  };

  const onTouchMove = (event) => {
    if (!isMobileHomeViewport() || event.touches.length !== 1 || lastTouchY == null) {
      return;
    }

    const currentY = event.touches[0].clientY;
    const deltaY = currentY - lastTouchY;
    const scrollTop = window.scrollY || document.documentElement.scrollTop || 0;

    if (scrollTop <= 18) {
      showTopbar();
    } else if (deltaY < -6) {
      hideTopbar();
    } else if (deltaY > 6) {
      showTopbar();
    }

    lastTouchY = currentY;
  };

  const onTouchEnd = () => {
    lastTouchY = null;
    syncMobileTopbar();
  };

  searchButton?.addEventListener("click", () => searchController?.openMobileSearch?.());
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", syncMobileTopbar);
  window.addEventListener("touchstart", onTouchStart, { passive: true });
  window.addEventListener("touchmove", onTouchMove, { passive: true });
  window.addEventListener("touchend", onTouchEnd, { passive: true });
  syncMobileTopbar();
}

async function main() {
  setupSplash();
  setupPageTransition();

  const [entries, config] = await Promise.all([loadHomeFeed(), loadSiteConfig()]);
  allEntries = entries;
  siteConfig = config;
  setupSiteChrome({
    profileCoverUrl: config?.profile?.cover || "",
    scrollContainerSelector: ".flow-panel",
    searchTargetSelector: "#search-input",
    useWindowScroll: true,
  });

  setupWelcomeTyping();
  const noticeController = setupNoticeOverlay();

  renderProfile(config);
  visibleEntries = filterByParams(entries);
  applyHomeSeo(config, visibleEntries);
  renderTimeline(visibleEntries);
  renderSidebar(entries.filter((entry) => entry.contentType !== "notice"), config);
  await renderHomeCuratedSections(entries, config);
  notifyHomeRendered();
  await renderHomePinnedNotice();

  const searchController = setupSearch(noticeController);
  setupDesktopSidebarLayout();
  setupOverlayControls();
  setupMobileDrawer(searchController);
  setupMobileHomeChrome(searchController);
  bindTimelineClicks(noticeController);

  const params = new URLSearchParams(window.location.search);
  const postId = params.get("post");
  if (postId) {
    await openPostById(postId, false);
  }

  if (!postId) {
    await maybeShowLatestNotice(noticeController);
  }
}

main().catch((error) => {
  const timeline = document.getElementById("timeline");
  timeline.innerHTML = `<p class="subtle">${error.message}</p>`;
});




