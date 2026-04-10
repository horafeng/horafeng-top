import { escapeHtml, linkify, setupSplash } from "./common.js";

const state = {
  pageKey: "guestbook",
  widgetId: null,
  turnstileSiteKey: "",
};

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

  return `
    <article class="guestbook-item ${levelClass} ${adminClass}" data-comment-id="${node.id}">
      <header class="guestbook-item-head">
        <p class="guestbook-author">
          ${escapeHtml(node.nickname)}
          ${node.is_admin ? '<span class="admin-badge">博主</span>' : ""}
        </p>
        <p class="guestbook-time">${formatTime(node.created_at)}</p>
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
    const message = payload.message || "Request failed.";
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return payload;
}

async function loadComments() {
  const list = document.getElementById("guestbook-list");
  list.innerHTML = '<p class="subtle">正在加载留言…</p>';

  const data = await apiJson(`/api/comments?page_key=${encodeURIComponent(state.pageKey)}&limit=100`);
  const items = data.items || [];

  if (!items.length) {
    list.innerHTML = '<p class="subtle">还没有公开留言，欢迎做第一个留言的人。</p>';
    return;
  }

  list.innerHTML = items.map((item) => renderCommentNode(item)).join("");
  bindReplyButtons();
}

function ensureTurnstileScript() {
  if (window.turnstile) {
    return Promise.resolve();
  }

  if (document.getElementById("turnstile-script")) {
    return new Promise((resolve, reject) => {
      const script = document.getElementById("turnstile-script");
      script.addEventListener("load", () => resolve(), { once: true });
      script.addEventListener("error", () => reject(new Error("Turnstile script failed to load.")), { once: true });
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.id = "turnstile-script";
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Turnstile script failed to load."));
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
    hint.textContent = "请完成上方人机验证后再提交留言。";
  } catch (error) {
    hint.textContent = error.message;
  }
}

async function loadConfig() {
  try {
    const config = await apiJson("/api/config", { method: "GET", headers: {} });
    state.turnstileSiteKey = config.turnstileSiteKey || "";
  } catch {
    state.turnstileSiteKey = "";
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
        turnstileToken,
      };

      const result = await apiJson("/api/comments", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setFeedback(result.message || "留言成功。");
      form.reset();
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
  await loadConfig();
  await setupTurnstile();
  bindForm();
  await loadComments();
}

main().catch((error) => {
  setFeedback(error.message || "留言板加载失败，请稍后刷新。", true);
});
