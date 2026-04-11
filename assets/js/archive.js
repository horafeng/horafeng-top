import { escapeHtml, getStats, loadEntries, searchEntries, setupPageTransition, setupSiteChrome, setupSplash } from "./common.js";

const FALLBACK_COVERS = [
  "assets/images/diary/cover-01.svg",
  "assets/images/diary/cover-02.svg",
  "assets/images/diary/cover-03.svg",
];

const state = {
  entries: [],
  query: "",
  activeTag: "all",
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
    return "这篇归档暂时还没有摘要，可以点进详情继续看完整内容。";
  }

  return compact.length > 92 ? `${compact.slice(0, 92)}...` : compact;
}

function getCover(entry) {
  return entry.images?.[0] || getFallbackCover(entry.id);
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
  const normalizedTag = sortedTags.some(([tag]) => tag === state.activeTag) ? state.activeTag : "all";
  state.activeTag = normalizedTag;

  container.innerHTML = [
    `<button type="button" class="archive-filter-btn${normalizedTag === "all" ? " active" : ""}" data-tag="all">全部档案 <span>${entries.length}</span></button>`,
    ...sortedTags.map(
      ([tag, count]) =>
        `<button type="button" class="archive-filter-btn${normalizedTag === tag ? " active" : ""}" data-tag="${escapeAttr(tag)}">#${escapeHtml(tag)} <span>${count}</span></button>`,
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
      const cover = getCover(entry);
      const fallback = getFallbackCover(entry.id);
      const tagsHtml = (entry.tags || [])
        .map((tag) => `<span class="archive-card-tag">#${escapeHtml(tag)}</span>`)
        .join("");

      return `
        <article class="archive-item ${sideClass}">
          <span class="archive-item-node" aria-hidden="true"></span>
          <a class="archive-card" href="index.html?post=${encodeURIComponent(entry.id)}" aria-label="查看 ${escapeAttr(entry.title)}">
            <div class="archive-card-cover-wrap">
              <img
                class="archive-card-cover"
                src="${escapeAttr(cover)}"
                data-fallback="${escapeAttr(fallback)}"
                alt="${escapeAttr(entry.title)}"
                loading="lazy"
                referrerpolicy="no-referrer"
              />
            </div>
            <div class="archive-card-body">
              <p class="archive-card-time">
                <span>${escapeHtml(formatDate(entry.date))}</span>
                <span>${escapeHtml(entry.mood || "✦")}</span>
              </p>
              <h2 class="archive-card-title">${escapeHtml(entry.title)}</h2>
              <div class="archive-card-tags">${tagsHtml}</div>
              <p class="archive-card-snippet">${escapeHtml(getSummary(entry))}</p>
            </div>
          </a>
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

async function main() {
  setupSplash();
  setupPageTransition();
  setupSiteChrome({
    scrollContainerSelector: ".archive-flow-panel",
    useWindowScroll: true,
  });

  readStateFromUrl();
  state.entries = await loadEntries();
  setupSearch();
  applyFilters({ syncUrl: false });
}

main().catch((error) => {
  const timeline = document.getElementById("archive-timeline");
  if (timeline) {
    timeline.innerHTML = `<p class="subtle">${escapeHtml(error.message || "归档页加载失败。")}</p>`;
  }
});
