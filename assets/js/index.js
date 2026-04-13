import {
  escapeHtml,
  formatLastSeen,
  getStats,
  linkify,
  loadHomeFeed,
  loadRecentComments,
  loadSiteConfig,
  searchEntries,
  setupSiteChrome,
  setupPageTransition,
  setupSplash,
} from "./common.js";
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

const FALLBACK_COVERS = [
  "assets/images/diary/cover-01.svg",
  "assets/images/diary/cover-02.svg",
  "assets/images/diary/cover-03.svg",
];

function escapeAttr(text) {
  return String(text).replaceAll('"', "&quot;");
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
      const hasImage = entry.images.length > 0;
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
                  <img class="entry-cover" src="${escapeAttr(entry.images[0])}" data-fallback="${escapeAttr(fallback)}" alt="${escapeAttr(entry.title)}" loading="lazy" />
                </div>
                <span class="entry-fusion" aria-hidden="true"></span>
              </div>
            </a>
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

function renderProfile(config) {
  const profile = config.profile || {};

  const cover = document.getElementById("profile-cover");
  const avatar = document.getElementById("profile-avatar");
  const name = document.getElementById("profile-name");
  const handle = document.getElementById("profile-handle");
  const signature = document.getElementById("profile-signature");
  const bio = document.getElementById("profile-bio");
  const lastSeen = document.getElementById("profile-last-seen");
  const emailButton = document.getElementById("email-button");

  if (profile.cover) {
    cover.style.backgroundImage = `url(${profile.cover})`;
    cover.style.backgroundSize = "cover";
    cover.style.backgroundPosition = "center";
  }

  avatar.src = profile.avatar || avatar.src;
  name.textContent = profile.name || "HoraFeng";
  handle.textContent = profile.handle || "@horafeng";
  signature.textContent = profile.signature || "把普通日子写成会发光的碎片。";
  bio.textContent = profile.bio || "这里是我的轻日记与生活记事。";
  lastSeen.textContent = formatLastSeen(profile.lastSeenAt);

  emailButton.href = "mailto:horafeng@outlook.com";
  emailButton.textContent = "发送邮件";

  const mobileSlot = document.getElementById("mobile-profile-slot");
  mobileSlot.innerHTML = `
    <div class="profile-cover" style="background-image:url(${profile.cover || ""});background-size:cover;background-position:center;"></div>
    <div class="profile-main compact">
      <img class="profile-avatar" src="${profile.avatar || avatar.src}" alt="博主头像" />
      <h1>${profile.name || "HoraFeng"}</h1>
      <p class="profile-handle">${profile.handle || "@horafeng"}</p>
      <p class="subtle">${profile.signature || "把普通日子写成会发光的碎片。"}</p>
      <p class="subtle">${profile.bio || "这里是我的轻日记与生活记事。"}</p>
      <p class="last-seen subtle">${formatLastSeen(profile.lastSeenAt)}</p>
    </div>
    <div class="profile-actions compact">
      <a class="profile-action-btn" href="mailto:horafeng@outlook.com">发送邮件</a>
    </div>
    <nav class="soft-nav">
      <a class="active" href="index.html">日记流</a>
      <a href="archive.html">归档</a>
      <a href="guestbook.html">留言板</a>
    </nav>
  `;
}

function filterByParams(entries) {
  const params = new URLSearchParams(window.location.search);
  const tag = params.get("tag");
  const archive = params.get("archive");
  const contentType = params.get("content");
  const heading = document.getElementById("timeline-heading");

  let list = entries;
  if (contentType) {
    list = list.filter((entry) => entry.contentType === contentType);
    heading.textContent =
      contentType === "article"
        ? "\u6700\u8fd1\u6587\u7ae0"
        : contentType === "notice"
          ? "\u6700\u8fd1\u516c\u544a"
          : "\u6700\u8fd1\u5c0f\u8bb0";
  } else if (tag) {
    heading.textContent = `标签：#${tag}`;
    list = list.filter((entry) => entry.tags.includes(tag));
  } else if (archive) {
    heading.textContent = `归档：${archive}`;
    list = list.filter((entry) => entry.date.startsWith(archive));
  } else {
    heading.textContent = "\u6700\u8fd1\u5185\u5bb9";
  }

  return list;
}

function setupSearch() {
  const form = document.getElementById("search-form");
  const input = document.getElementById("search-input");
  const hint = document.getElementById("search-hint");

  const applyQuery = (rawQuery) => {
    const query = String(rawQuery || "");
    const results = searchEntries(visibleEntries, query);
    renderTimeline(results);
    bindTimelineClicks();
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
  const profile = siteConfig?.profile || {};
  const authorName = entry.author || profile.name || "HoraFeng";
  const avatar = profile.avatar || "https://dummyimage.com/120x120/f3f5f8/8a94a6&text=HF";
  const likes = Number.isFinite(entry.likes) ? entry.likes : 1;

  layout.classList.add("text-only");
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

  layout.classList.remove("text-only");
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

function bindTimelineClicks() {
  document.querySelectorAll(".entry-card[data-entry-id]").forEach((card) => {
    card.addEventListener("click", async (event) => {
      event.preventDefault();
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
      const rect = card.getBoundingClientRect();
      await openPostById(card.dataset.entryId, true, { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
    });
  });
}

function setupMobileDrawer() {
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
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      closeDrawer();
    }
  });
}

function setupMobileHomeChrome() {
  const searchButton = document.getElementById("mobile-home-search");
  const searchInput = document.getElementById("search-input");
  let lastScrollY = window.scrollY;
  let ticking = false;
  let lastTouchY = null;

  const focusSearch = () => {
    if (!searchInput) {
      return;
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
      window.setTimeout(() => {
        searchInput.focus();
      }, 180);
    };

  const showTopbar = () => {
    document.body.classList.remove("mobile-home-nav-hidden");
  };

  const hideTopbar = () => {
    if (
      document.body.classList.contains("mobile-post-open") ||
      document.body.classList.contains("mobile-home-drawer-open")
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

  searchButton?.addEventListener("click", focusSearch);
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
  setupSiteChrome({
    scrollContainerSelector: ".flow-panel",
    searchTargetSelector: "#search-input",
    useWindowScroll: true,
  });

  const [entries, config] = await Promise.all([loadHomeFeed(), loadSiteConfig()]);
  allEntries = entries;
  siteConfig = config;

  renderProfile(config);
  visibleEntries = filterByParams(entries);
  renderTimeline(visibleEntries);
  renderSidebar(entries, config);

  setupSearch();
  setupDesktopSidebarLayout();
  setupOverlayControls();
  setupMobileDrawer();
  setupMobileHomeChrome();
  bindTimelineClicks();

  const params = new URLSearchParams(window.location.search);
  const postId = params.get("post");
  if (postId) {
    await openPostById(postId, false);
  }
}

main().catch((error) => {
  const timeline = document.getElementById("timeline");
  timeline.innerHTML = `<p class="subtle">${error.message}</p>`;
});




