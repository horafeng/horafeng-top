import {
  escapeHtml,
  getStats,
  linkify,
  loadHomeFeed,
  loadSiteConfig,
  renderMockComments,
  searchEntries,
  setupPageTransition,
  setupSiteChrome,
  setupSplash,
} from "./common.js";
import { mountContentComments } from "./content-comments.js";

const FALLBACK_COVERS = [
  "assets/images/diary/cover-01.svg",
  "assets/images/diary/cover-02.svg",
  "assets/images/diary/cover-03.svg",
];

const state = {
  entries: [],
  query: "",
  activeTag: "all",
  siteConfig: null,
  currentImages: [],
  currentImageIndex: 0,
  wheelLock: false,
  mediaUiTimer: null,
  mediaKeydownHandler: null,
  dragState: null,
  currentCommentWidget: null,
  lastOpenOrigin: null,
};

function escapeAttr(text) {
  return String(text).replaceAll('"', "&quot;");
}

function hashString(text) {
  return [...String(text || "archive")].reduce((acc, char) => acc + char.charCodeAt(0), 0);
}

function getFallbackCover(seed = "archive") {
  return FALLBACK_COVERS[hashString(seed) % FALLBACK_COVERS.length];
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

function getSummary(entry) {
  const compact = String((entry.content || []).join(" ") || "")
    .replace(/\s+/g, " ")
    .trim();

  if (!compact) {
    return "这篇归档暂时还没有摘要，可以直接打开卡片继续看完整内容。";
  }

  return compact.length > 92 ? `${compact.slice(0, 92)}...` : compact;
}

function formatDate(dateString) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return dateString || "";
  }

  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function readStateFromUrl() {
  const params = new URLSearchParams(window.location.search);
  state.query = params.get("q") || "";
  state.activeTag = params.get("tag") || "all";
}

function syncStateToUrl() {
  const params = new URLSearchParams();
  const query = state.query.trim();

  if (query) {
    params.set("q", query);
  }

  if (state.activeTag && state.activeTag !== "all") {
    params.set("tag", state.activeTag);
  }

  const next = params.toString();
  history.replaceState({}, "", next ? `${window.location.pathname}?${next}` : window.location.pathname);
}

function renderTagFilters(entries) {
  const container = document.getElementById("archive-tag-filters");
  if (!container) {
    return;
  }

  const { tags } = getStats(entries);
  const sortedTags = [...tags.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-CN"));
  const hasActiveTag = sortedTags.some(([tag]) => tag === state.activeTag);
  const activeTag = state.activeTag === "all" || hasActiveTag ? state.activeTag : "all";
  state.activeTag = activeTag;

  container.innerHTML = [
    `<button type="button" class="archive-filter-btn${activeTag === "all" ? " active" : ""}" data-tag="all">全部档案 <span>${entries.length}</span></button>`,
    ...sortedTags.map(
      ([tag, count]) =>
        `<button type="button" class="archive-filter-btn${activeTag === tag ? " active" : ""}" data-tag="${escapeAttr(tag)}">#${escapeHtml(tag)} <span>${count}</span></button>`,
    ),
  ].join("");

  container.querySelectorAll("[data-tag]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeTag = button.dataset.tag || "all";
      applyFilters();
    });
  });
}

function getFilteredEntries() {
  let next = [...state.entries];

  if (state.activeTag !== "all") {
    next = next.filter((entry) => entry.tags.includes(state.activeTag));
  }

  if (state.query.trim()) {
    next = searchEntries(next, state.query);
  }

  return next;
}

function renderMeta(filteredEntries) {
  const totalEl = document.getElementById("archive-total-count");
  const visibleMeta = document.getElementById("archive-visible-meta");
  const emptyCopy = document.getElementById("archive-empty-copy");

  if (totalEl) {
    totalEl.textContent = String(state.entries.length);
  }

  const filters = [];
  if (state.activeTag !== "all") {
    filters.push(`标签 #${state.activeTag}`);
  }
  if (state.query.trim()) {
    filters.push(`关键词 “${state.query.trim()}”`);
  }

  if (visibleMeta) {
    visibleMeta.textContent = filters.length
      ? `当前展示 ${filteredEntries.length} / ${state.entries.length} 条，已应用 ${filters.join(" · ")}`
      : `当前展示全部 ${filteredEntries.length} 条归档内容`;
  }

  if (emptyCopy) {
    emptyCopy.textContent = filters.length
      ? `没有找到符合 ${filters.join(" 和 ")} 的归档内容，试试清空关键词或切回“全部档案”。`
      : "换个关键词，或者回到“全部档案”试试。";
  }
}

function renderTimeline(entries) {
  const timeline = document.getElementById("archive-timeline");
  const empty = document.getElementById("archive-empty");

  if (!timeline || !empty) {
    return;
  }

  if (!entries.length) {
    timeline.innerHTML = "";
    empty.hidden = false;
    return;
  }

  empty.hidden = true;
  timeline.innerHTML = entries
    .map((entry, index) => {
      const sideClass = index % 2 === 0 ? "is-left" : "is-right";
      const cover = entry.images?.[0] || "";
      const hasImage = Boolean(cover);
      const fallback = getFallbackCover(entry.id);
      const tagsHtml = (entry.tags || [])
        .map((tag) => `<span class="archive-card-tag">#${escapeHtml(tag)}</span>`)
        .join("");
      const entryType = entry.contentType === "article" ? "article" : "note";
      const typeBadge =
        entryType === "article"
          ? '<span class="archive-card-kind is-article">文章</span>'
          : '<span class="archive-card-kind is-note">小记</span>';
      const actionLabel = entryType === "article" ? "打开文章" : "查看小记";

      return `
        <article class="archive-item ${sideClass}${hasImage ? "" : " no-cover"}">
          <span class="archive-item-node" aria-hidden="true"></span>
          <button
            class="archive-card${hasImage ? "" : " no-cover"}"
            type="button"
            data-entry-id="${escapeAttr(entry.id)}"
            data-entry-type="${escapeAttr(entryType)}"
            data-entry-slug="${escapeAttr(entry.slug || "")}"
            aria-label="${escapeAttr(actionLabel)} ${escapeAttr(entry.title)}"
          >
            ${
              hasImage
                ? `
            <div class="archive-card-cover-wrap">
              <img
                class="archive-card-cover"
                src="${escapeAttr(cover)}"
                data-fallback="${escapeAttr(fallback)}"
                alt="${escapeAttr(entry.title)}"
                loading="lazy"
                referrerpolicy="no-referrer"
              />
            </div>`
                : ""
            }
            <div class="archive-card-body">
              <p class="archive-card-time">
                ${typeBadge}
                <span>${escapeHtml(formatDate(entry.date))}</span>
                <span>${escapeHtml(entry.mood || "✦")}</span>
              </p>
              <h2 class="archive-card-title">${escapeHtml(entry.title)}</h2>
              <div class="archive-card-tags">${tagsHtml}</div>
              <p class="archive-card-snippet">${escapeHtml(getSummary(entry))}</p>
            </div>
          </button>
        </article>
      `;
    })
    .join("");

  bindImageFallbacks(timeline);
}

function applyFilters({ syncUrl = true } = {}) {
  renderTagFilters(state.entries);
  const filteredEntries = getFilteredEntries();
  renderMeta(filteredEntries);
  renderTimeline(filteredEntries);
  bindTimelineClicks();

  if (syncUrl) {
    syncStateToUrl();
  }
}

function setupSearch() {
  const form = document.getElementById("archive-search-form");
  const input = document.getElementById("archive-search-input");

  if (!form || !input) {
    return;
  }

  input.value = state.query;

  const submitSearch = () => {
    state.query = input.value || "";
    applyFilters();
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    submitSearch();
  });

  input.addEventListener("input", submitSearch);
}

function showMediaUI() {
  const viewer = document.getElementById("media-viewer");
  if (!viewer || state.currentImages.length < 2) {
    return;
  }

  viewer.classList.add("ui-visible");
  window.clearTimeout(state.mediaUiTimer);
  state.mediaUiTimer = window.setTimeout(() => {
    viewer.classList.remove("ui-visible");
  }, 1200);
}

function markActiveSlide() {
  const track = document.getElementById("media-track");
  if (!track) {
    return;
  }

  track.querySelectorAll(".media-slide").forEach((slide, index) => {
    slide.classList.toggle("is-active", index === state.currentImageIndex);
  });
}

function updateMediaPosition(nextIndex, options = {}) {
  const { animated = true } = options;
  if (state.currentImages.length < 2) {
    return;
  }

  state.currentImageIndex = (nextIndex + state.currentImages.length) % state.currentImages.length;

  const track = document.getElementById("media-track");
  const counter = document.getElementById("media-counter");
  if (!track || !counter) {
    return;
  }

  track.style.transition = animated ? "transform 320ms cubic-bezier(0.22, 0.8, 0.28, 1)" : "none";
  track.style.transform = `translate3d(${-state.currentImageIndex * 100}%, 0, 0)`;
  counter.textContent = `${state.currentImageIndex + 1}/${state.currentImages.length}`;
  markActiveSlide();
  showMediaUI();
}

function shiftImage(delta) {
  if (state.currentImages.length < 2) {
    return;
  }

  updateMediaPosition(state.currentImageIndex + delta, { animated: true });
}

function bindMediaKeyboard() {
  if (state.mediaKeydownHandler || state.currentImages.length < 2) {
    return;
  }

  state.mediaKeydownHandler = (event) => {
    const overlay = document.getElementById("post-overlay");
    if (!overlay || overlay.hidden) {
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

  document.addEventListener("keydown", state.mediaKeydownHandler);
}

function unbindMediaKeyboard() {
  if (!state.mediaKeydownHandler) {
    return;
  }

  document.removeEventListener("keydown", state.mediaKeydownHandler);
  state.mediaKeydownHandler = null;
}

function bindMultiImageInteractions() {
  const viewer = document.getElementById("media-viewer");
  const track = document.getElementById("media-track");
  const prev = document.getElementById("media-prev");
  const next = document.getElementById("media-next");

  if (!viewer || !track || !prev || !next || state.currentImages.length < 2) {
    return;
  }

  prev.addEventListener("click", () => shiftImage(-1));
  next.addEventListener("click", () => shiftImage(1));

  viewer.addEventListener("mouseenter", showMediaUI);
  viewer.addEventListener("mousemove", showMediaUI);
  viewer.addEventListener("mouseleave", () => {
    window.clearTimeout(state.mediaUiTimer);
    state.mediaUiTimer = window.setTimeout(() => viewer.classList.remove("ui-visible"), 420);
  });

  viewer.addEventListener(
    "wheel",
    (event) => {
      if (state.wheelLock) {
        return;
      }

      event.preventDefault();
      showMediaUI();
      state.wheelLock = true;
      shiftImage(event.deltaY > 0 ? 1 : -1);
      window.setTimeout(() => {
        state.wheelLock = false;
      }, 240);
    },
    { passive: false },
  );

  viewer.addEventListener("pointerdown", (event) => {
    const rect = viewer.getBoundingClientRect();
    state.dragState = {
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
    if (!state.dragState) {
      return;
    }

    state.dragState.deltaX = event.clientX - state.dragState.startX;
    state.dragState.deltaY = event.clientY - state.dragState.startY;

    if (!state.dragState.axisLocked) {
      const absX = Math.abs(state.dragState.deltaX);
      const absY = Math.abs(state.dragState.deltaY);
      if (absX < 6 && absY < 6) {
        return;
      }

      state.dragState.axisLocked = absX >= absY ? "x" : "y";
    }

    if (state.dragState.axisLocked === "y") {
      return;
    }

    event.preventDefault();
    const dragPercent = (state.dragState.deltaX / state.dragState.width) * 100;
    track.style.transform = `translate3d(calc(${-state.currentImageIndex * 100}% + ${dragPercent}%), 0, 0)`;
  });

  const endDrag = () => {
    if (!state.dragState) {
      return;
    }

    const threshold = state.dragState.width * 0.16;
    const delta = state.dragState.deltaX;
    const horizontalGesture = state.dragState.axisLocked !== "y";
    viewer.classList.remove("dragging");

    if (horizontalGesture && Math.abs(delta) > threshold) {
      shiftImage(delta < 0 ? 1 : -1);
    } else {
      updateMediaPosition(state.currentImageIndex, { animated: true });
    }

    state.dragState = null;
  };

  viewer.addEventListener("pointerup", endDrag);
  viewer.addEventListener("pointercancel", endDrag);
  viewer.addEventListener("pointerleave", () => {
    if (state.dragState) {
      endDrag();
    }
  });

  bindMediaKeyboard();
  showMediaUI();
}

function renderMediaCarousel(images, title, fallbackKey = "modal") {
  const media = document.getElementById("post-media");
  state.currentImages = images || [];
  state.currentImageIndex = 0;
  state.wheelLock = false;
  state.dragState = null;

  if (!media) {
    return;
  }

  if (!state.currentImages.length) {
    unbindMediaKeyboard();
    media.innerHTML = '<div class="media-empty subtle">这条帖子没有配图。</div>';
    return;
  }

  if (state.currentImages.length === 1) {
    unbindMediaKeyboard();
    media.innerHTML = `
      <div class="media-viewer single" id="media-viewer">
        <img class="post-main-image" src="${escapeAttr(state.currentImages[0])}" data-fallback="${escapeAttr(getFallbackCover(fallbackKey))}" alt="${escapeAttr(title)}" loading="lazy" />
      </div>
    `;
    bindImageFallbacks(media);
    return;
  }

  media.innerHTML = `
    <div class="media-viewer multi" id="media-viewer">
      <div class="media-track" id="media-track" style="transform: translate3d(0, 0, 0)">
        ${state.currentImages
          .map(
            (url, index) =>
              `<div class="media-slide${index === 0 ? " is-active" : ""}"><img class="post-main-image" src="${escapeAttr(url)}" data-fallback="${escapeAttr(getFallbackCover(`${fallbackKey}-${index}`))}" alt="${escapeAttr(title)}" loading="lazy" /></div>`,
          )
          .join("")}
      </div>
      <button type="button" class="media-nav prev" id="media-prev" aria-label="上一张">‹</button>
      <button type="button" class="media-nav next" id="media-next" aria-label="下一张">›</button>
      <p class="media-counter" id="media-counter">1/${state.currentImages.length}</p>
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
  const profile = state.siteConfig?.profile || {};
  const authorName = entry.author || profile.name || "HoraFeng";
  const avatar = profile.avatar || "assets/images/Profile.png";
  const likes = Number.isFinite(entry.likes) ? entry.likes : 1;

  if (!layout) {
    return;
  }

  modal?.classList.remove("post-modal-note-split");
  layout.classList.add("text-only");
  layout.classList.remove("has-media-split");
  layout.innerHTML = `
    <section class="text-post-card">
      <header class="text-post-head">
        <img class="text-post-avatar" src="${escapeAttr(avatar)}" alt="作者头像" />
        <div class="text-post-head-meta">
          <h3>归档随记</h3>
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

      <section class="text-post-comment-editor">
        <h4>评论区（预留）</h4>
        <textarea placeholder="这里暂时仍是展示用区域..." rows="4" aria-label="评论输入"></textarea>
        <div class="text-post-comment-row">
          <input type="text" placeholder="昵称" />
          <input type="text" placeholder="联系方式（邮箱/社交）" />
          <button type="button">提交</button>
        </div>
      </section>

      <section class="text-post-comments">
        <h4>最新评论</h4>
        <ul id="post-comments-list" class="comment-list compact"></ul>
      </section>
    </section>
  `;

  bindLikeControl(layout);
  renderMockComments(document.getElementById("post-comments-list"), state.siteConfig?.comments?.entryMock || [], 10);
}

function renderImagePost(entry) {
  const layout = document.getElementById("post-layout");
  const modal = document.getElementById("post-modal");

  if (!layout) {
    return;
  }

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
      <section class="post-comments">
        <h4>评论区（预留）</h4>
        <ul id="post-comments-list" class="comment-list compact"></ul>
      </section>
    </section>
  `;

  renderMediaCarousel(entry.images, entry.title, entry.id);
  renderMockComments(document.getElementById("post-comments-list"), state.siteConfig?.comments?.entryMock || [], 10);
}

function getNoteCommentPageKey(entry) {
  return `note:${entry.id}`;
}

function teardownPostComments() {
  state.currentCommentWidget?.destroy?.();
  state.currentCommentWidget = null;
}

function ensurePostCommentsHost() {
  const existingHost = document.getElementById("post-comments-host");
  if (existingHost) {
    return existingHost;
  }

  const textEditor = document.querySelector(".text-post-comment-editor");
  const textComments = document.querySelector(".text-post-comments");
  if (textEditor) {
    textEditor.outerHTML = '<section id="post-comments-host" class="post-comments-host"></section>';
    textComments?.remove();
    return document.getElementById("post-comments-host");
  }

  const reserved = document.querySelector(".post-comments");
  if (reserved) {
    reserved.outerHTML = '<section id="post-comments-host" class="post-comments-host"></section>';
    return document.getElementById("post-comments-host");
  }

  return null;
}

function mountPostComments(entry) {
  teardownPostComments();

  const host = ensurePostCommentsHost();
  if (!host) {
    return;
  }

  state.currentCommentWidget = mountContentComments({
    container: host,
    pageKey: getNoteCommentPageKey(entry),
    mode: "note",
  });
}

function renderPostModal(entry) {
  const mobileAvatar = document.getElementById("post-mobile-avatar");
  const mobileName = document.getElementById("post-mobile-name");
  const profile = state.siteConfig?.profile || {};
  const authorName = entry.author || profile.name || "HoraFeng";

  if (mobileAvatar) {
    mobileAvatar.src = profile.avatar || mobileAvatar.src;
  }

  if (mobileName) {
    mobileName.textContent = authorName;
  }

  if (entry.images.length === 0) {
    state.currentImages = [];
    state.currentImageIndex = 0;
    unbindMediaKeyboard();
    renderTextOnlyPost(entry);
    mountPostComments(entry);
    return;
  }

  renderImagePost(entry);
  mountPostComments(entry);
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
  if (!modal) {
    return;
  }

  const point = resolveOrigin(origin);
  const rect = modal.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const deltaX = point.x - centerX;
  const deltaY = point.y - centerY;
  const startScale = window.matchMedia("(max-width: 767px)").matches ? 0.08 : 0.12;
  const duration = reverse ? 260 : 340;
  const easing = "cubic-bezier(0.2, 0.84, 0.24, 1)";

  modal.style.willChange = "transform, opacity";
  modal.style.transformOrigin = "50% 50%";

  if (!reverse) {
    modal.style.transition = "none";
    modal.style.opacity = "0.2";
    modal.style.transform = `translate3d(${deltaX}px, ${deltaY}px, 0) scale(${startScale})`;
    modal.getBoundingClientRect();
    modal.style.transition = `transform ${duration}ms ${easing}, opacity ${duration - 60}ms ease`;
    modal.style.opacity = "1";
    modal.style.transform = "translate3d(0, 0, 0) scale(1)";
  } else {
    modal.style.transition = `transform ${duration}ms ${easing}, opacity ${duration - 70}ms ease`;
    modal.style.opacity = "0";
    modal.style.transform = `translate3d(${deltaX}px, ${deltaY}px, 0) scale(${startScale})`;
  }

  await new Promise((resolve) => window.setTimeout(resolve, duration + 20));
  modal.style.transition = "";
  modal.style.willChange = "";
}

function hidePostOverlay() {
  const overlay = document.getElementById("post-overlay");
  const modal = document.getElementById("post-modal");
  if (!overlay || !modal) {
    return;
  }

  modal.style.transform = "";
  modal.style.opacity = "";
  modal.style.transition = "";
  modal.style.willChange = "";
  modal.style.transformOrigin = "";
  modal.classList.remove("post-modal-note-split");

  overlay.hidden = true;
  overlay.classList.remove("open", "closing");
  document.body.classList.remove("no-scroll");
  window.clearTimeout(state.mediaUiTimer);
  unbindMediaKeyboard();
  teardownPostComments();
}

async function closePost() {
  const overlay = document.getElementById("post-overlay");
  if (!overlay || overlay.hidden) {
    return;
  }

  overlay.classList.add("closing");
  await animateModalFromOrigin(state.lastOpenOrigin, true);
  hidePostOverlay();
}

async function openPostById(id, origin = null) {
  const entry = state.entries.find((item) => item.id === id);
  if (!entry) {
    return;
  }

  const overlay = document.getElementById("post-overlay");
  if (!overlay) {
    return;
  }

  state.lastOpenOrigin = resolveOrigin(origin);
  overlay.hidden = false;
  overlay.classList.remove("closing");
  overlay.classList.add("open");
  document.body.classList.add("no-scroll");

  renderPostModal(entry);
  await animateModalFromOrigin(state.lastOpenOrigin, false);
}

function setupOverlayControls() {
  const overlay = document.getElementById("post-overlay");
  const closeButton = document.getElementById("post-close");
  const closeMobileButton = document.getElementById("post-close-mobile");

  if (!overlay || !closeButton) {
    return;
  }

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
}

function bindTimelineClicks() {
  document.querySelectorAll(".archive-card[data-entry-id]").forEach((card) => {
    const openCard = async () => {
      if (card.dataset.entryType === "article" && card.dataset.entrySlug) {
        window.location.href = `article.html?slug=${encodeURIComponent(card.dataset.entrySlug)}`;
        return;
      }

      const rect = card.getBoundingClientRect();
      await openPostById(card.dataset.entryId, {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      });
    };

    card.addEventListener("click", openCard);

    card.addEventListener("keydown", async (event) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }

      event.preventDefault();
      await openCard();
    });
  });
}

async function main() {
  setupSplash();
  setupPageTransition();
  setupSiteChrome({
    scrollContainerSelector: ".archive-flow-panel",
    useWindowScroll: true,
  });

  readStateFromUrl();
  const [entries, siteConfig] = await Promise.all([loadHomeFeed(), loadSiteConfig()]);
  state.entries = entries;
  state.siteConfig = siteConfig;

  setupSearch();
  setupOverlayControls();
  applyFilters({ syncUrl: false });
}

main().catch((error) => {
  const timeline = document.getElementById("archive-timeline");
  if (timeline) {
    timeline.innerHTML = `<p class="subtle">${escapeHtml(error.message || "归档页加载失败。")}</p>`;
  }
});
