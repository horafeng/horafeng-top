import {
  formatLastSeen,
  getStats,
  linkify,
  loadEntries,
  loadSiteConfig,
  renderMockComments,
  searchEntries,
  setupSplash,
} from "./common.js";

let allEntries = [];
let visibleEntries = [];
let currentPostId = null;
let siteConfig = null;

function renderTimeline(entries) {
  const timeline = document.getElementById("timeline");

  if (!entries.length) {
    timeline.innerHTML = '<p class="subtle">没有匹配结果，换个关键词试试。</p>';
    return;
  }

  timeline.innerHTML = entries
    .map((entry) => {
      const preview = entry.content.slice(0, 2).join(" ");
      const tags = entry.tags.map((tag) => `#${tag}`).join(" ");
      const cover = entry.images[0]
        ? `<img class="entry-cover" src="${entry.images[0]}" alt="${entry.title}" loading="lazy" />`
        : "";

      return `
        <article class="entry-card">
          <a class="entry-link" href="entry.html?id=${encodeURIComponent(entry.id)}" data-entry-id="${entry.id}">
            ${cover}
            <div class="entry-meta"><span>${entry.date}</span><span>${entry.mood}</span></div>
            <h3 class="entry-title">${entry.title}</h3>
            <p class="entry-snippet">${linkify(preview)}</p>
            <p class="entry-meta">${tags}</p>
          </a>
        </article>
      `;
    })
    .join("");
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

  const mock = config.comments?.recentMock || [];
  renderMockComments(document.getElementById("recent-comments"), mock, 10);
  renderMockComments(document.getElementById("mobile-recent-comments"), mock, 10);
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
  const imButton = document.getElementById("im-button");

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

  emailButton.href = profile.email ? `mailto:${profile.email}` : "mailto:hello@example.com";
  emailButton.textContent = profile.emailLabel || "发送邮件";
  imButton.href = profile.im?.url || "#";
  imButton.textContent = profile.im?.label || "即时消息";

  const mobileSlot = document.getElementById("mobile-profile-slot");
  mobileSlot.innerHTML = `
    <div class="profile-cover" style="background-image:url(${profile.cover || ""});background-size:cover;background-position:center;"></div>
    <div class="profile-main">
      <img class="profile-avatar" src="${profile.avatar || avatar.src}" alt="博主头像" />
      <h1>${profile.name || "HoraFeng"}</h1>
      <p class="profile-handle">${profile.handle || "@horafeng"}</p>
      <p class="subtle">${profile.signature || "把普通日子写成会发光的碎片。"}</p>
      <p class="subtle">${profile.bio || "这里是我的轻日记与生活记事。"}</p>
      <p class="last-seen subtle">${formatLastSeen(profile.lastSeenAt)}</p>
    </div>
    <div class="profile-actions">
      <a class="profile-action-btn" href="${profile.email ? `mailto:${profile.email}` : "mailto:hello@example.com"}">${profile.emailLabel || "发送邮件"}</a>
      <a class="profile-action-btn ghost" href="${profile.im?.url || "#"}" target="_blank" rel="noopener noreferrer">${profile.im?.label || "即时消息"}</a>
    </div>
  `;
}

function filterByParams(entries) {
  const params = new URLSearchParams(window.location.search);
  const tag = params.get("tag");
  const archive = params.get("archive");
  const heading = document.getElementById("timeline-heading");

  let list = entries;
  if (tag) {
    heading.textContent = `标签：#${tag}`;
    list = list.filter((entry) => entry.tags.includes(tag));
  } else if (archive) {
    heading.textContent = `归档：${archive}`;
    list = list.filter((entry) => entry.date.startsWith(archive));
  } else {
    heading.textContent = "最近日记";
  }

  return list;
}

function setupSearch() {
  const form = document.getElementById("search-form");
  const input = document.getElementById("search-input");
  const hint = document.getElementById("search-hint");

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const results = searchEntries(visibleEntries, input.value);
    renderTimeline(results);
    bindTimelineClicks();

    if (input.value.trim()) {
      hint.textContent = `关键词 “${input.value.trim()}” 命中 ${results.length} 条`;
    } else {
      hint.textContent = "";
    }
  });

  input.addEventListener("input", () => {
    if (input.value.trim()) {
      return;
    }

    hint.textContent = "";
    renderTimeline(visibleEntries);
    bindTimelineClicks();
  });
}

function renderPostModal(entry) {
  const media = document.getElementById("post-media");
  const title = document.getElementById("post-title");
  const meta = document.getElementById("post-meta");
  const tags = document.getElementById("post-tags");
  const body = document.getElementById("post-body");
  const comments = document.getElementById("post-comments-list");

  title.textContent = entry.title;
  meta.innerHTML = `<span>${entry.date}</span><span>${entry.mood}</span>`;
  tags.innerHTML = entry.tags.map((tag) => `<span class="chip">#${tag}</span>`).join("");

  if (entry.images.length) {
    media.innerHTML = entry.images.map((url) => `<img src="${url}" alt="${entry.title}" loading="lazy" />`).join("");
  } else {
    media.innerHTML = '<div class="subtle">这条帖子没有配图。</div>';
  }

  body.innerHTML = entry.content.map((line) => `<p>${linkify(line)}</p>`).join("");
  renderMockComments(comments, siteConfig.comments?.entryMock || [], 10);
}

function setMobilePostOrigin(sourceRect) {
  const modal = document.getElementById("post-modal");

  if (!sourceRect || window.innerWidth >= 768) {
    modal.style.removeProperty("--from-x");
    modal.style.removeProperty("--from-y");
    modal.style.removeProperty("--from-scale-x");
    modal.style.removeProperty("--from-scale-y");
    return false;
  }

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const scaleX = Math.max(0.2, sourceRect.width / vw);
  const scaleY = Math.max(0.2, sourceRect.height / vh);

  modal.style.setProperty("--from-x", `${sourceRect.left}px`);
  modal.style.setProperty("--from-y", `${sourceRect.top}px`);
  modal.style.setProperty("--from-scale-x", `${scaleX}`);
  modal.style.setProperty("--from-scale-y", `${scaleY}`);
  return true;
}

function closePostDirect() {
  const overlay = document.getElementById("post-overlay");
  if (overlay.hidden) {
    return;
  }

  overlay.classList.remove("open");
  overlay.classList.add("closing");
  window.setTimeout(() => {
    overlay.classList.remove("closing");
    overlay.classList.remove("mobile-from-card");
    overlay.hidden = true;
    document.body.classList.remove("no-scroll");
    currentPostId = null;
  }, 260);
}

function closePost() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("post")) {
    history.back();
    return;
  }

  closePostDirect();
}

function openPostById(id, pushState = true, sourceRect = null) {
  const entry = allEntries.find((item) => item.id === id);
  if (!entry) {
    return;
  }

  currentPostId = id;
  renderPostModal(entry);

  const overlay = document.getElementById("post-overlay");
  overlay.hidden = false;
  overlay.classList.remove("closing", "mobile-from-card");

  if (setMobilePostOrigin(sourceRect)) {
    overlay.classList.add("mobile-from-card");
  }

  overlay.classList.add("open");
  document.body.classList.add("no-scroll");

  if (pushState) {
    const params = new URLSearchParams(window.location.search);
    params.set("post", id);
    history.pushState({ post: id }, "", `${window.location.pathname}?${params.toString()}`);
  }
}

function setupOverlayControls() {
  const overlay = document.getElementById("post-overlay");
  const closeButton = document.getElementById("post-close");

  closeButton.addEventListener("click", closePost);
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

  const modal = document.getElementById("post-modal");
  let start = null;

  modal.addEventListener("pointerdown", (event) => {
    start = { x: event.clientX, y: event.clientY };
  });

  modal.addEventListener("pointerup", (event) => {
    if (!start || window.innerWidth >= 768) {
      start = null;
      return;
    }

    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    start = null;

    if (dx > 80 && Math.abs(dx) > Math.abs(dy)) {
      closePost();
    }
  });

  window.addEventListener("popstate", () => {
    const params = new URLSearchParams(window.location.search);
    const postId = params.get("post");

    if (postId) {
      openPostById(postId, false, null);
    } else {
      closePostDirect();
    }
  });
}

function bindTimelineClicks() {
  document.querySelectorAll(".entry-link[data-entry-id]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      const id = link.dataset.entryId;
      openPostById(id, true, link.getBoundingClientRect());
    });
  });
}

function setupMobileDrawer() {
  const trigger = document.getElementById("mobile-drawer-trigger");
  const overlay = document.getElementById("mobile-drawer-overlay");
  const closeButton = document.getElementById("mobile-drawer-close");

  const openDrawer = () => {
    overlay.hidden = false;
    requestAnimationFrame(() => overlay.classList.add("open"));
  };

  const closeDrawer = () => {
    overlay.classList.remove("open");
    window.setTimeout(() => {
      if (!overlay.classList.contains("open")) {
        overlay.hidden = true;
      }
    }, 220);
  };

  trigger.addEventListener("click", openDrawer);
  closeButton.addEventListener("click", closeDrawer);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      closeDrawer();
    }
  });
}

async function main() {
  setupSplash();

  const [entries, config] = await Promise.all([loadEntries(), loadSiteConfig()]);
  allEntries = entries;
  siteConfig = config;

  renderProfile(config);
  visibleEntries = filterByParams(entries);
  renderTimeline(visibleEntries);
  renderSidebar(entries, config);

  setupSearch();
  setupOverlayControls();
  setupMobileDrawer();
  bindTimelineClicks();

  const params = new URLSearchParams(window.location.search);
  const postId = params.get("post");
  if (postId) {
    openPostById(postId, false, null);
  }
}

main().catch((error) => {
  const timeline = document.getElementById("timeline");
  timeline.innerHTML = `<p class="subtle">${error.message}</p>`;
});
