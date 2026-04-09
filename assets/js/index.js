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
let siteConfig = null;
let currentPostId = null;
let currentImages = [];
let currentImageIndex = 0;
let wheelLock = false;

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
        <article class="entry-card" data-entry-card="${entry.id}">
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

    hint.textContent = input.value.trim() ? `关键词 “${input.value.trim()}” 命中 ${results.length} 条` : "";
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

function renderMediaCarousel(images, title) {
  const media = document.getElementById("post-media");
  currentImages = images || [];
  currentImageIndex = 0;

  if (!currentImages.length) {
    media.innerHTML = '<div class="media-empty subtle">这条帖子没有配图。</div>';
    return;
  }

  media.innerHTML = `
    <div class="media-viewer" id="media-viewer">
      <button type="button" class="media-nav prev" id="media-prev" aria-label="上一张">‹</button>
      <img id="post-main-image" class="post-main-image" src="${currentImages[0]}" alt="${title}" loading="lazy" />
      <button type="button" class="media-nav next" id="media-next" aria-label="下一张">›</button>
      <p class="media-counter" id="media-counter">1/${currentImages.length}</p>
    </div>
  `;

  const update = (nextIndex) => {
    currentImageIndex = (nextIndex + currentImages.length) % currentImages.length;
    const image = document.getElementById("post-main-image");
    const counter = document.getElementById("media-counter");

    image.classList.add("switching");
    window.setTimeout(() => {
      image.src = currentImages[currentImageIndex];
      counter.textContent = `${currentImageIndex + 1}/${currentImages.length}`;
      image.classList.remove("switching");
    }, 120);
  };

  document.getElementById("media-prev").addEventListener("click", () => update(currentImageIndex - 1));
  document.getElementById("media-next").addEventListener("click", () => update(currentImageIndex + 1));

  const viewer = document.getElementById("media-viewer");
  viewer.addEventListener(
    "wheel",
    (event) => {
      if (window.innerWidth < 768 || wheelLock || currentImages.length < 2) {
        return;
      }

      event.preventDefault();
      wheelLock = true;
      update(event.deltaY > 0 ? currentImageIndex + 1 : currentImageIndex - 1);
      window.setTimeout(() => {
        wheelLock = false;
      }, 180);
    },
    { passive: false },
  );

  let start = null;
  viewer.addEventListener("pointerdown", (event) => {
    start = { x: event.clientX, y: event.clientY };
  });
  viewer.addEventListener("pointerup", (event) => {
    if (!start || currentImages.length < 2) {
      start = null;
      return;
    }

    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    start = null;

    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) {
      return;
    }

    update(dx < 0 ? currentImageIndex + 1 : currentImageIndex - 1);
  });
}

function renderPostModal(entry) {
  const title = document.getElementById("post-title");
  const meta = document.getElementById("post-meta");
  const tags = document.getElementById("post-tags");
  const body = document.getElementById("post-body");
  const comments = document.getElementById("post-comments-list");

  title.textContent = entry.title;
  meta.innerHTML = `<span>${entry.date}</span><span>${entry.mood}</span>`;
  tags.innerHTML = entry.tags.map((tag) => `<span class="chip">#${tag}</span>`).join("");
  body.innerHTML = entry.content.map((line) => `<p>${linkify(line)}</p>`).join("");

  renderMediaCarousel(entry.images, entry.title);
  renderMockComments(comments, siteConfig.comments?.entryMock || [], 10);
}

function getSharedSourceElement(entryId) {
  const card = document.querySelector(`.entry-link[data-entry-id="${CSS.escape(entryId)}"]`);
  if (!card) {
    return null;
  }

  return card.querySelector(".entry-cover") || card;
}

function getSharedTargetElement() {
  return document.getElementById("post-main-image") || document.getElementById("post-modal");
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
  clone.style.transform = "translateZ(0)";
  clone.style.zIndex = "140";
  clone.style.pointerEvents = "none";
  clone.style.objectFit = "cover";
  document.body.appendChild(clone);
  return { clone, rect };
}

function animateSharedOpen(entryId) {
  const source = getSharedSourceElement(entryId);
  const target = getSharedTargetElement();
  if (!source || !target) {
    return Promise.resolve(false);
  }

  const overlay = document.getElementById("post-overlay");
  overlay.classList.add("shared-transition");

  const { clone, rect: sourceRect } = createSharedClone(source);
  const targetRect = target.getBoundingClientRect();

  source.style.visibility = "hidden";
  target.style.visibility = "hidden";

  return new Promise((resolve) => {
    const animation = clone.animate(
      [
        {
          left: `${sourceRect.left}px`,
          top: `${sourceRect.top}px`,
          width: `${sourceRect.width}px`,
          height: `${sourceRect.height}px`,
          borderRadius: "12px",
        },
        {
          left: `${targetRect.left}px`,
          top: `${targetRect.top}px`,
          width: `${targetRect.width}px`,
          height: `${targetRect.height}px`,
          borderRadius: window.innerWidth < 768 ? "0px" : "12px",
        },
      ],
      {
        duration: window.innerWidth < 768 ? 360 : 300,
        easing: "cubic-bezier(0.2, 0.85, 0.22, 1)",
        fill: "forwards",
      },
    );

    animation.onfinish = () => {
      clone.remove();
      source.style.visibility = "";
      target.style.visibility = "";
      overlay.classList.remove("shared-transition");
      resolve(true);
    };
  });
}

function animateSharedClose(entryId) {
  const source = getSharedSourceElement(entryId);
  const target = getSharedTargetElement();
  if (!source || !target) {
    return Promise.resolve(false);
  }

  const overlay = document.getElementById("post-overlay");
  overlay.classList.add("shared-transition", "closing");

  const sourceRect = source.getBoundingClientRect();
  const { clone, rect: targetRect } = createSharedClone(target);

  source.style.visibility = "hidden";
  target.style.visibility = "hidden";

  return new Promise((resolve) => {
    const animation = clone.animate(
      [
        {
          left: `${targetRect.left}px`,
          top: `${targetRect.top}px`,
          width: `${targetRect.width}px`,
          height: `${targetRect.height}px`,
          borderRadius: window.innerWidth < 768 ? "0px" : "12px",
        },
        {
          left: `${sourceRect.left}px`,
          top: `${sourceRect.top}px`,
          width: `${sourceRect.width}px`,
          height: `${sourceRect.height}px`,
          borderRadius: "12px",
        },
      ],
      {
        duration: window.innerWidth < 768 ? 320 : 260,
        easing: "ease",
        fill: "forwards",
      },
    );

    animation.onfinish = () => {
      clone.remove();
      source.style.visibility = "";
      target.style.visibility = "";
      overlay.classList.remove("shared-transition", "closing");
      resolve(true);
    };
  });
}

function hidePostOverlay() {
  const overlay = document.getElementById("post-overlay");
  overlay.hidden = true;
  overlay.classList.remove("open", "closing", "shared-transition");
  document.body.classList.remove("no-scroll");
}

async function closePostDirect() {
  const overlay = document.getElementById("post-overlay");
  if (overlay.hidden) {
    return;
  }

  const didShared = currentPostId ? await animateSharedClose(currentPostId) : false;
  if (!didShared) {
    overlay.classList.add("closing");
    await new Promise((resolve) => window.setTimeout(resolve, 220));
  }

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

async function openPostById(id, pushState = true) {
  const entry = allEntries.find((item) => item.id === id);
  if (!entry) {
    return;
  }

  currentPostId = id;
  renderPostModal(entry);

  const overlay = document.getElementById("post-overlay");
  overlay.hidden = false;
  overlay.classList.remove("closing");
  overlay.classList.add("open");
  document.body.classList.add("no-scroll");

  await animateSharedOpen(id);

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

    if (dx > 90 && Math.abs(dx) > Math.abs(dy)) {
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
}

function bindTimelineClicks() {
  document.querySelectorAll(".entry-link[data-entry-id]").forEach((link) => {
    link.addEventListener("click", async (event) => {
      event.preventDefault();
      await openPostById(link.dataset.entryId, true);
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
    await openPostById(postId, false);
  }
}

main().catch((error) => {
  const timeline = document.getElementById("timeline");
  timeline.innerHTML = `<p class="subtle">${error.message}</p>`;
});
