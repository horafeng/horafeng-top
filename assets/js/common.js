export async function loadEntries() {
  const response = await fetch("content/diaries.json");
  if (!response.ok) {
    throw new Error("Failed to load local diary content.");
  }

  const data = await response.json();
  return data.entries
    .slice()
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export async function loadSiteConfig() {
  const response = await fetch("content/site.json");
  if (!response.ok) {
    throw new Error("Failed to load site config.");
  }

  return response.json();
}

export function escapeHtml(text) {
  return text
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
    entry.tags.forEach((tag) => {
      tags.set(tag, (tags.get(tag) || 0) + 1);
    });

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
  const value = query.trim().toLowerCase();
  if (!value) {
    return entries;
  }

  return entries.filter((entry) => normalizeText(entry).includes(value));
}

export function setupSplash() {
  const splash = document.getElementById("splash-screen");
  if (!splash) {
    return;
  }

  document.body.classList.add("no-scroll");
  splash.classList.add("visible");

  window.setTimeout(() => {
    document.body.classList.remove("no-scroll");
    splash.remove();
  }, 1280);
}

export function setupMobileStage() {
  const stage = document.getElementById("home-stage");
  if (!stage) {
    return;
  }

  const controls = Array.from(document.querySelectorAll("[data-pane-target]"));
  const paneOrder = ["left", "center", "right"];
  let pointerStart = null;

  const updateButtons = (pane) => {
    controls.forEach((button) => {
      const active = button.dataset.paneTarget === pane;
      button.classList.toggle("active", active);
    });
  };

  const switchPane = (pane) => {
    stage.dataset.pane = pane;
    updateButtons(pane);
  };

  controls.forEach((button) => {
    button.addEventListener("click", () => switchPane(button.dataset.paneTarget));
  });

  stage.addEventListener("pointerdown", (event) => {
    pointerStart = {
      x: event.clientX,
      y: event.clientY,
    };
  });

  stage.addEventListener("pointerup", (event) => {
    if (!pointerStart || window.innerWidth >= 760) {
      pointerStart = null;
      return;
    }

    const dx = event.clientX - pointerStart.x;
    const dy = event.clientY - pointerStart.y;
    pointerStart = null;

    if (Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy)) {
      return;
    }

    const currentIndex = paneOrder.indexOf(stage.dataset.pane || "center");
    const targetIndex = dx < 0 ? currentIndex + 1 : currentIndex - 1;
    const safeIndex = Math.max(0, Math.min(paneOrder.length - 1, targetIndex));

    switchPane(paneOrder[safeIndex]);
  });

  switchPane("center");
}

function stripHtml(html) {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

async function fetchRecentPayload(serverURL, queryString) {
  const base = serverURL.replace(/\/$/, "");
  const endpoints = [`${base}/comment?${queryString}`, `${base}/api/comment?${queryString}`];

  for (const endpoint of endpoints) {
    const response = await fetch(endpoint);
    if (!response.ok) {
      continue;
    }

    return response.json();
  }

  throw new Error("Failed to fetch recent comments");
}

export async function renderRecentComments({ listEl, serverURL, path = "", count = 5 }) {
  if (!listEl) {
    return;
  }

  if (!serverURL) {
    listEl.innerHTML = '<li class="subtle">评论服务未配置，稍后可在 site.json 中补充。</li>';
    return;
  }

  try {
    const query = new URLSearchParams({ pageSize: String(count), type: "recent" });
    if (path) {
      query.set("path", path);
    }

    const payload = await fetchRecentPayload(serverURL, query.toString());
    const comments = payload.data || payload.comments || [];

    if (!comments.length) {
      listEl.innerHTML = '<li class="subtle">最近还没有新评论。</li>';
      return;
    }

    listEl.innerHTML = comments
      .slice(0, count)
      .map((comment) => {
        const nick = escapeHtml(comment.nick || "访客");
        const content = escapeHtml(stripHtml(comment.comment || "")).slice(0, 80);
        return `<li><p class="comment-author">${nick}</p><p class="comment-text">${content}</p></li>`;
      })
      .join("");
  } catch {
    listEl.innerHTML = '<li class="subtle">评论服务连接失败，请检查配置。</li>';
  }
}
