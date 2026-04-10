import { escapeHtml, formatLastSeen, linkify, loadSiteConfig, setupPageTransition, setupSplash } from "./common.js";

const state = {
  pageKey: "guestbook",
  widgetId: null,
  turnstileSiteKey: "",
  defaultAvatarUrl: "/assets/images/avatar-default.svg",
  adminAvatarUrl: "/assets/images/Profile.png",
  bloggerAvatarUrl: "/assets/images/Profile.png",
  notifyDefault: true,
};

const DEFAULT_AVATAR_POOL = [
  "/assets/images/avatar-default-1.svg",
  "/assets/images/avatar-default-2.svg",
  "/assets/images/avatar-default-3.svg",
  "/assets/images/avatar-default-4.svg",
  "/assets/images/avatar-default-5.svg",
  "/assets/images/avatar-default-6.svg",
];

function hashSeed(text) {
  return [...String(text || "guest")].reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) >>> 0, 7);
}

function pickDefaultAvatar(seed) {
  return DEFAULT_AVATAR_POOL[hashSeed(seed) % DEFAULT_AVATAR_POOL.length];
}

function formatTime(isoString) {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return isoString || "";
  }
  return date.toLocaleString("zh-CN", { hour12: false });
}

function contentToHtml(text) {
  return String(text || "")
    .split("\n")
    .map((line) => linkify(line))
    .join("<br />");
}

function setFeedback(message, isError = false) {
  const feedback = document.getElementById("guestbook-feedback");
  feedback.textContent = message || "";
  feedback.classList.toggle("feedback-error", Boolean(isError));
}

function bindAvatarFallbacks(scope = document) {
  scope.querySelectorAll("img[data-default-avatar]").forEach((img) => {
    if (img.dataset.boundError === "1") {
      return;
    }

    img.dataset.boundError = "1";
    img.addEventListener("error", () => {
      const fallback = img.dataset.fallbackAvatar || img.dataset.defaultAvatar || state.defaultAvatarUrl;
      if (img.src.endsWith(fallback)) {
        return;
      }
      img.src = fallback;
      img.classList.add("is-default-avatar");
    });
  });
}

function parseTimeValue(raw) {
  const value = String(raw || "").trim();
  if (!value) {
    return 0;
  }

  const direct = Date.parse(value);
  if (!Number.isNaN(direct)) {
    return direct;
  }

  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const normalizedValue = Date.parse(normalized);
  if (!Number.isNaN(normalizedValue)) {
    return normalizedValue;
  }

  const utcValue = Date.parse(`${normalized}Z`);
  return Number.isNaN(utcValue) ? 0 : utcValue;
}

function sortCommentTreeByTime(nodes = [], order = "desc") {
  const next = [...nodes];
  next.sort((a, b) =>
    order === "asc"
      ? parseTimeValue(a.created_at) - parseTimeValue(b.created_at) || Number(a.id || 0) - Number(b.id || 0)
      : parseTimeValue(b.created_at) - parseTimeValue(a.created_at) || Number(b.id || 0) - Number(a.id || 0),
  );

  next.forEach((node) => {
    if (Array.isArray(node.children) && node.children.length) {
      node.children = sortCommentTreeByTime(node.children, "asc");
    }
  });

  return next;
}

function setReplyTarget(commentId, nickname) {
  const parentInput = document.getElementById("guestbook-parent-id");
  const hint = document.getElementById("guestbook-replying");
  parentInput.value = commentId ? String(commentId) : "";

  if (!commentId) {
    hint.hidden = true;
    hint.innerHTML = "";
    return;
  }

  hint.hidden = false;
  hint.innerHTML = `正在回复 <strong>${escapeHtml(nickname || "访客")}</strong> <button type="button" id="reply-cancel" class="link-like">取消</button>`;
  document.getElementById("reply-cancel")?.addEventListener("click", () => setReplyTarget(null, ""));
}

function renderCommentNode(node, depth = 0) {
  const levelClass = depth > 0 ? "is-reply" : "is-root";
  const adminClass = node.is_admin ? "is-admin" : "";
  const replyMeta = node.reply_to ? `<span class="reply-to">回复 @${escapeHtml(node.reply_to)}</span>` : "";
  const children = (node.children || []).map((child) => renderCommentNode(child, depth + 1)).join("");
  const fallbackAvatar = node.is_admin
    ? state.bloggerAvatarUrl || state.adminAvatarUrl
    : pickDefaultAvatar(`${node.id}:${node.nickname || "guest"}`);
  const avatarUrl = node.avatar_url || fallbackAvatar;

  return `
    <article class="guestbook-item ${levelClass} ${adminClass}" data-comment-id="${node.id}">
      <header class="guestbook-item-head">
        <div class="guestbook-user">
          <img
            class="guestbook-avatar"
            src="${escapeHtml(avatarUrl)}"
            data-default-avatar="${escapeHtml(state.defaultAvatarUrl)}"
            data-fallback-avatar="${escapeHtml(fallbackAvatar)}"
            alt="${escapeHtml(node.nickname || "访客")} avatar"
            loading="lazy"
            referrerpolicy="no-referrer"
          />
          <div class="guestbook-user-meta">
            <p class="guestbook-author">
              ${escapeHtml(node.nickname)}
              ${node.is_admin ? '<span class="admin-badge">博主</span>' : ""}
            </p>
            <p class="guestbook-time">${formatTime(node.created_at)}</p>
          </div>
        </div>
      </header>
      <p class="guestbook-content">${contentToHtml(node.content)}</p>
      <div class="guestbook-meta">
        ${replyMeta}
        <button type="button" class="link-like" data-reply-id="${node.id}" data-reply-nick="${escapeHtml(node.nickname)}">回复</button>
      </div>
      ${children ? `<div class="guestbook-children">${children}</div>` : ""}
    </article>
  `;
}

function bindReplyButtons() {
  document.querySelectorAll("[data-reply-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const commentId = button.getAttribute("data-reply-id");
      const nickname = button.getAttribute("data-reply-nick") || "";
      setReplyTarget(commentId, nickname);
      document.getElementById("guestbook-content")?.focus();
    });
  });
}

async function apiJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {}),
    },
    credentials: "same-origin",
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload.message || "请求失败。";
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return payload;
}

async function loadComments() {
  const list = document.getElementById("guestbook-list");
  list.innerHTML = '<p class="subtle guestbook-empty">正在加载留言…</p>';

  const data = await apiJson(`/api/comments?page_key=${encodeURIComponent(state.pageKey)}&limit=100`);
  const items = sortCommentTreeByTime(data.items || [], "desc");

  if (!items.length) {
    list.innerHTML = `
      <div class="guestbook-empty-card">
        <p class="guestbook-empty-title">还没有公开留言</p>
        <p class="subtle">欢迎写下第一条留言，让这页有一点温度。</p>
      </div>
    `;
    return;
  }

  list.innerHTML = items.map((item) => renderCommentNode(item)).join("");
  bindReplyButtons();
  bindAvatarFallbacks(list);
}

function ensureTurnstileScript() {
  if (window.turnstile) {
    return Promise.resolve();
  }

  if (document.getElementById("turnstile-script")) {
    return new Promise((resolve, reject) => {
      const script = document.getElementById("turnstile-script");
      script.addEventListener("load", () => resolve(), { once: true });
      script.addEventListener("error", () => reject(new Error("Turnstile 脚本加载失败。")), { once: true });
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.id = "turnstile-script";
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Turnstile 脚本加载失败。"));
    document.head.appendChild(script);
  });
}

async function setupTurnstile() {
  const hint = document.getElementById("turnstile-hint");
  const widget = document.getElementById("turnstile-widget");

  if (!state.turnstileSiteKey) {
    hint.textContent = "Turnstile Site Key 未配置。";
    return;
  }

  try {
    await ensureTurnstileScript();
    state.widgetId = window.turnstile.render(widget, {
      sitekey: state.turnstileSiteKey,
      theme: "light",
    });
    hint.textContent = "请完成人机验证后再提交留言。";
  } catch (error) {
    hint.textContent = error.message;
  }
}

async function loadConfig() {
  try {
    const config = await apiJson("/api/config", { method: "GET", headers: {} });
    state.turnstileSiteKey = config.turnstileSiteKey || "";
    state.defaultAvatarUrl = config.defaultAvatarUrl || "/assets/images/avatar-default.svg";
    state.adminAvatarUrl = config.adminAvatarUrl || "/assets/images/Profile.png";
    state.notifyDefault = config.commentNotifyDefault !== false;
  } catch {
    state.turnstileSiteKey = "";
    state.defaultAvatarUrl = "/assets/images/avatar-default.svg";
    state.adminAvatarUrl = "/assets/images/Profile.png";
    state.notifyDefault = true;
  }
}

function collectTurnstileToken() {
  if (!state.turnstileSiteKey) {
    return "";
  }
  if (!window.turnstile || state.widgetId === null) {
    return "";
  }
  return window.turnstile.getResponse(state.widgetId) || "";
}

function resetTurnstileToken() {
  if (!window.turnstile || state.widgetId === null) {
    return;
  }
  window.turnstile.reset(state.widgetId);
}

function renderProfile(config) {
  const profile = config.profile || {};
  const cover = document.getElementById("guestbook-profile-cover");
  const avatar = document.getElementById("guestbook-profile-avatar");
  const name = document.getElementById("guestbook-profile-name");
  const handle = document.getElementById("guestbook-profile-handle");
  const signature = document.getElementById("guestbook-profile-signature");
  const bio = document.getElementById("guestbook-profile-bio");
  const lastSeen = document.getElementById("guestbook-profile-last-seen");
  const emailButton = document.getElementById("guestbook-email-button");

  if (profile.cover) {
    cover.style.backgroundImage = `url(${profile.cover})`;
    cover.style.backgroundSize = "cover";
    cover.style.backgroundPosition = "center";
  }

  avatar.src = profile.avatar || state.defaultAvatarUrl;
  avatar.dataset.defaultAvatar = state.defaultAvatarUrl;
  avatar.dataset.fallbackAvatar = state.defaultAvatarUrl;
  state.bloggerAvatarUrl = profile.avatar || state.adminAvatarUrl || state.defaultAvatarUrl;
  name.textContent = profile.name || "HoraFeng";
  handle.textContent = profile.handle || "@horafeng";
  signature.textContent = profile.signature || "把普通日子写成会发光的碎片。";
  bio.textContent = profile.bio || "这里是我的轻日记与生活记事。";
  lastSeen.textContent = formatLastSeen(profile.lastSeenAt);
  emailButton.href = `mailto:${profile.email || "horafeng@outlook.com"}`;
  emailButton.textContent = profile.emailLabel || "发送邮件";

  const notifyToggle = document.getElementById("guestbook-notify");
  if (notifyToggle) {
    notifyToggle.checked = state.notifyDefault;
  }

  bindAvatarFallbacks(document.getElementById("guestbook-profile-panel") || document);
}

function bindForm() {
  const form = document.getElementById("guestbook-form");
  const submitButton = document.getElementById("guestbook-submit");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setFeedback("");

    const nickname = document.getElementById("guestbook-nickname").value.trim();
    const contact = document.getElementById("guestbook-contact").value.trim();
    const content = document.getElementById("guestbook-content").value.trim();
    const parentRaw = document.getElementById("guestbook-parent-id").value.trim();
    const notifyEnabled = document.getElementById("guestbook-notify")?.checked !== false;
    const turnstileToken = collectTurnstileToken();

    if (!nickname) {
      setFeedback("请填写昵称。", true);
      return;
    }
    if (!contact) {
      setFeedback("请填写联系方式（邮箱或 QQ）。", true);
      return;
    }
    if (!content) {
      setFeedback("请填写留言内容。", true);
      return;
    }
    if (state.turnstileSiteKey && !turnstileToken) {
      setFeedback("请先完成人机验证。", true);
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = "发送中...";

    try {
      const payload = {
        page_key: state.pageKey,
        parent_id: parentRaw ? Number(parentRaw) : null,
        nickname,
        contact,
        content,
        notify_enabled: notifyEnabled,
        turnstileToken,
      };

      const result = await apiJson("/api/comments", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setFeedback(result.message || "留言成功，感谢来访。");
      form.reset();
      const notifyToggle = document.getElementById("guestbook-notify");
      if (notifyToggle) {
        notifyToggle.checked = state.notifyDefault;
      }
      setReplyTarget(null, "");
      resetTurnstileToken();
      await loadComments();
    } catch (error) {
      setFeedback(error.message || "提交失败，请稍后重试。", true);
      resetTurnstileToken();
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "发送留言";
    }
  });
}

async function main() {
  setupSplash();
  setupPageTransition();

  if ("scrollRestoration" in history) {
    history.scrollRestoration = "manual";
  }
  window.scrollTo(0, 0);

  await loadConfig();
  const siteConfig = await loadSiteConfig();

  renderProfile(siteConfig);
  await setupTurnstile();
  bindForm();
  await loadComments();
}

main().catch((error) => {
  setFeedback(error.message || "留言板加载失败，请稍后刷新。", true);
});
