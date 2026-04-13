import { escapeHtml, linkify } from "./common.js";
import {
  getPendingComments,
  normalizePendingComment,
  reconcilePendingComments,
  renderPendingBadge,
  savePendingComment,
  showCommentSuccessToast,
} from "./comment-ui.js";

const TEXT = {
  title: "\u7559\u8a00",
  subtitleArticle: "\u770b\u5b8c\u8fd9\u7bc7\u5185\u5bb9\u540e\uff0c\u6b22\u8fce\u7559\u4e0b\u4f60\u7684\u60f3\u6cd5\u3002",
  subtitleNote: "\u8fd9\u6761\u5c0f\u8bb0\u4e0b\u9762\u4e5f\u53ef\u4ee5\u76f4\u63a5\u7559\u8a00\u3002",
  empty: "\u8fd8\u6ca1\u6709\u516c\u5f00\u7559\u8a00\uff0c\u6b22\u8fce\u5199\u4e0b\u7b2c\u4e00\u6761\u3002",
  loading: "\u6b63\u5728\u52a0\u8f7d\u7559\u8a00...",
  loadFailed: "\u7559\u8a00\u52a0\u8f7d\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002",
  refresh: "\u5237\u65b0",
  submit: "\u53d1\u9001\u7559\u8a00",
  submitting: "\u53d1\u9001\u4e2d...",
  contentLabel: "\u7559\u8a00\u5185\u5bb9",
  nicknameLabel: "\u6635\u79f0",
  contactLabel: "\u8054\u7cfb\u65b9\u5f0f\uff08\u90ae\u7bb1\u6216 QQ\uff09",
  contentPlaceholder: "\u5199\u4e0b\u4f60\u7684\u60f3\u6cd5...",
  nicknamePlaceholder: "\u4f8b\u5982\uff1a\u8def\u8fc7\u7684\u8bfb\u8005",
  contactPlaceholder: "name@example.com \u6216 12345678",
  notify: "\u6536\u5230\u56de\u590d\u65f6\uff0c\u901a\u8fc7\u90ae\u4ef6\u63d0\u9192\u6211",
  pending: "\u7559\u8a00\u5df2\u63d0\u4ea4\uff0c\u5ba1\u6838\u901a\u8fc7\u540e\u4f1a\u663e\u793a\u5728\u8fd9\u91cc\u3002",
  published: "\u7559\u8a00\u5df2\u53d1\u5e03\u3002",
  turnstileHint: "\u8bf7\u5b8c\u6210\u4eba\u673a\u9a8c\u8bc1\u540e\u518d\u63d0\u4ea4\u3002",
  turnstileMissing: "Turnstile Site Key \u672a\u914d\u7f6e\u3002",
  dockPlaceholder: "\u5199\u4e0b\u4f60\u7684\u7559\u8a00...",
  openComposer: "\u5199\u7559\u8a00",
  cancelReply: "\u53d6\u6d88\u56de\u590d",
  reply: "\u56de\u590d",
  replyingTo: "\u6b63\u5728\u56de\u590d",
  noText: "\uff08\u8fd9\u6761\u7559\u8a00\u6682\u65e0\u6b63\u6587\uff09",
  anonymous: "\u8bbf\u5ba2",
  countSuffix: "\u6761",
};

const DEFAULTS = {
  turnstileSiteKey: "",
  turnstileEnabled: false,
  commentNotifyDefault: true,
  defaultAvatarUrl: "/assets/images/avatar-default.svg",
  adminAvatarUrl: "/assets/images/Profile.png",
};

let cachedConfigPromise = null;
let turnstileScriptPromise = null;

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

function truncatePreview(text, maxLen = 80) {
  const compact = String(text || "")
    .replace(/\s+/g, " ")
    .trim();

  if (!compact) {
    return TEXT.noText;
  }

  return compact.length > maxLen ? `${compact.slice(0, maxLen)}...` : compact;
}

function sortCommentTreeByTime(nodes = [], order = "desc") {
  const next = [...nodes];
  next.sort((a, b) => {
    const aTime = Date.parse(a.created_at || "") || 0;
    const bTime = Date.parse(b.created_at || "") || 0;

    return order === "asc"
      ? aTime - bTime || Number(a.id || 0) - Number(b.id || 0)
      : bTime - aTime || Number(b.id || 0) - Number(a.id || 0);
  });

  next.forEach((node) => {
    if (Array.isArray(node.children) && node.children.length) {
      node.children = sortCommentTreeByTime(node.children, "asc");
    }
  });

  return next;
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
    throw new Error(payload.message || TEXT.loadFailed);
  }

  return payload;
}

async function loadConfig() {
  if (!cachedConfigPromise) {
    cachedConfigPromise = apiJson("/api/config", { method: "GET", headers: {} }).catch(() => DEFAULTS);
  }

  const config = await cachedConfigPromise;
  return {
    ...DEFAULTS,
    ...config,
  };
}

function ensureTurnstileScript() {
  if (window.turnstile) {
    return Promise.resolve();
  }

  if (!turnstileScriptPromise) {
    turnstileScriptPromise = new Promise((resolve, reject) => {
      const existing = document.getElementById("turnstile-script");
      if (existing) {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener("error", () => reject(new Error("Turnstile load failed.")), { once: true });
        return;
      }

      const script = document.createElement("script");
      script.id = "turnstile-script";
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Turnstile load failed."));
      document.head.appendChild(script);
    });
  }

  return turnstileScriptPromise;
}

function renderCommentNode(node, depth = 0) {
  const children = Array.isArray(node.children) ? node.children : [];
  const levelClass = depth > 0 ? "is-reply" : "is-root";
  const adminClass = node.is_admin ? "is-admin" : "";
  const pendingClass = node.is_pending_local ? "is-pending-local" : "";
  const replyMeta = node.reply_to ? `<span class="content-comment-reply-to">\u56de\u590d @${escapeHtml(node.reply_to)}</span>` : "";
  const avatarUrl = node.avatar_url || DEFAULTS.defaultAvatarUrl;
  const authorName = node.nickname || TEXT.anonymous;
  const pendingBadge = node.is_pending_local ? renderPendingBadge(node.pending_label) : "";

  return `
    <article class="content-comment-item ${levelClass} ${adminClass} ${pendingClass}" data-comment-id="${escapeHtml(node.id)}">
      <header class="content-comment-item-head">
        <div class="content-comment-user">
          <img
            class="content-comment-avatar"
            src="${escapeHtml(avatarUrl)}"
            alt="${escapeHtml(authorName)} avatar"
            loading="lazy"
            referrerpolicy="no-referrer"
          />
          <div class="content-comment-user-meta">
            <p class="content-comment-author">
              ${escapeHtml(authorName)}
              ${node.is_admin ? '<span class="content-comment-admin-badge">\u535a\u4e3b</span>' : ""}
              ${pendingBadge}
            </p>
            <p class="content-comment-time">${escapeHtml(formatTime(node.created_at))}</p>
          </div>
        </div>
        ${
          node.is_pending_local
            ? ""
            : `
              <button
                type="button"
                class="content-comment-reply-btn"
                data-action="reply"
                data-comment-id="${escapeHtml(node.id)}"
                data-comment-name="${escapeHtml(authorName)}"
                data-comment-preview="${escapeHtml(truncatePreview(node.content))}"
              >${TEXT.reply}</button>
            `
        }
      </header>
      <div class="content-comment-body">${contentToHtml(node.content)}</div>
      ${replyMeta ? `<div class="content-comment-meta">${replyMeta}</div>` : ""}
      ${children.length ? `<div class="content-comment-children">${children.map((child) => renderCommentNode(child, depth + 1)).join("")}</div>` : ""}
    </article>
  `;
}

function countCommentTree(nodes = []) {
  return nodes.reduce(
    (total, node) => total + 1 + countCommentTree(Array.isArray(node.children) ? node.children : []),
    0,
  );
}

function buildWidgetMarkup(mode) {
  const isNote = mode === "note";

  return `
    <section class="content-comment-thread content-comment-thread-${mode}">
      <div class="content-comment-head">
        <div>
          <h4>${TEXT.title}</h4>
          <p class="subtle">${isNote ? TEXT.subtitleNote : TEXT.subtitleArticle}</p>
        </div>
        <div class="content-comment-head-actions">
          <span class="content-comment-count" data-comment-count>0 ${TEXT.countSuffix}</span>
          <button type="button" class="content-comment-refresh" data-action="refresh">${TEXT.refresh}</button>
        </div>
      </div>

      <section class="content-comment-compose ${isNote ? "is-collapsed is-note" : "is-article"}" data-compose>
        <button type="button" class="content-comment-compose-toggle" data-action="toggle-compose">
          <span>${TEXT.openComposer}</span>
        </button>
        <form class="content-comment-form" data-comment-form novalidate>
          <input type="hidden" name="parent_id" value="" />
          <div class="content-comment-replying" data-replying hidden></div>

          <label class="field-block" for="content-comment-textarea-${mode}">${TEXT.contentLabel}</label>
          <textarea
            id="content-comment-textarea-${mode}"
            name="content"
            rows="${isNote ? "4" : "6"}"
            maxlength="2000"
            placeholder="${TEXT.contentPlaceholder}"
            required
          ></textarea>

          <div class="content-comment-grid">
            <div>
              <label class="field-block" for="content-comment-nickname-${mode}">${TEXT.nicknameLabel}</label>
              <input
                id="content-comment-nickname-${mode}"
                name="nickname"
                type="text"
                maxlength="24"
                placeholder="${TEXT.nicknamePlaceholder}"
                required
              />
            </div>
            <div>
              <label class="field-block" for="content-comment-contact-${mode}">${TEXT.contactLabel}</label>
              <input
                id="content-comment-contact-${mode}"
                name="contact"
                type="text"
                maxlength="120"
                placeholder="${TEXT.contactPlaceholder}"
                required
              />
            </div>
          </div>

          <label class="notify-option content-comment-notify" for="content-comment-notify-${mode}">
            <input id="content-comment-notify-${mode}" name="notify_enabled" type="checkbox" checked />
            <span>${TEXT.notify}</span>
          </label>

          <div class="turnstile-slot content-comment-turnstile" data-turnstile-wrap>
            <div data-turnstile-widget></div>
            <p class="subtle" data-turnstile-hint></p>
          </div>

          <div class="content-comment-submit-row">
            <button type="submit" data-submit>${TEXT.submit}</button>
            <p class="subtle content-comment-feedback" data-feedback></p>
          </div>
        </form>
      </section>

      <section class="content-comment-list-wrap">
        <div class="content-comment-list" data-comment-list>
          <p class="subtle content-comment-empty">${TEXT.loading}</p>
        </div>
      </section>

      ${
        isNote
          ? `
            <div class="content-comment-dock" data-comment-dock>
              <button type="button" class="content-comment-dock-btn" data-action="open-compose">${TEXT.dockPlaceholder}</button>
            </div>
          `
          : ""
      }
    </section>
  `;
}

export function mountContentComments(options = {}) {
  const {
    container,
    pageKey,
    mode = "article",
    onRendered,
  } = options;

  if (!(container instanceof HTMLElement) || !pageKey) {
    return { destroy() {} };
  }

  const state = {
    pageKey: String(pageKey),
    mode,
    active: true,
    widgetId: null,
    turnstileSiteKey: "",
    turnstileReady: false,
    config: DEFAULTS,
  };

  container.innerHTML = buildWidgetMarkup(mode);

  const compose = container.querySelector("[data-compose]");
  const form = container.querySelector("[data-comment-form]");
  const list = container.querySelector("[data-comment-list]");
  const feedback = container.querySelector("[data-feedback]");
  const count = container.querySelector("[data-comment-count]");
  const submitButton = container.querySelector("[data-submit]");
  const replying = container.querySelector("[data-replying]");
  const dock = container.querySelector("[data-comment-dock]");
  const turnstileHint = container.querySelector("[data-turnstile-hint]");
  const turnstileWidget = container.querySelector("[data-turnstile-widget]");
  const notifyToggle = form.elements.notify_enabled;
  const parentInput = form.elements.parent_id;
  const contentInput = form.elements.content;

  const setFeedback = (message = "", isError = false) => {
    feedback.textContent = message;
    feedback.classList.toggle("feedback-error", Boolean(isError));
  };

  const resetTurnstile = () => {
    if (!window.turnstile || state.widgetId === null) {
      return;
    }

    window.turnstile.reset(state.widgetId);
  };

  const getTurnstileToken = () => {
    if (!state.turnstileSiteKey || !window.turnstile || state.widgetId === null) {
      return "";
    }

    return window.turnstile.getResponse(state.widgetId) || "";
  };

  const ensureTurnstile = async () => {
    if (!state.active || state.turnstileReady) {
      return;
    }

    if (!state.turnstileSiteKey) {
      turnstileHint.textContent = TEXT.turnstileMissing;
      state.turnstileReady = true;
      return;
    }

    try {
      await ensureTurnstileScript();
      if (!state.active || state.widgetId !== null) {
        return;
      }

      state.widgetId = window.turnstile.render(turnstileWidget, {
        sitekey: state.turnstileSiteKey,
        theme: "light",
      });
      turnstileHint.textContent = TEXT.turnstileHint;
      state.turnstileReady = true;
    } catch (error) {
      turnstileHint.textContent = error.message || TEXT.loadFailed;
    }
  };

  const expandComposer = async ({ focus = false, scroll = false } = {}) => {
    compose.classList.remove("is-collapsed");
    compose.classList.add("is-expanded");
    dock?.classList.add("is-hidden");
    await ensureTurnstile();

    if (scroll) {
      compose.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
    if (focus) {
      window.setTimeout(() => contentInput.focus(), 80);
    }
  };

  const collapseComposer = () => {
    if (mode !== "note") {
      return;
    }

    const hasDraft =
      String(form.elements.content.value || "").trim() ||
      String(form.elements.nickname.value || "").trim() ||
      String(form.elements.contact.value || "").trim() ||
      String(parentInput.value || "").trim();

    if (hasDraft) {
      return;
    }

    compose.classList.add("is-collapsed");
    compose.classList.remove("is-expanded");
    dock?.classList.remove("is-hidden");
  };

  const clearReplyTarget = () => {
    parentInput.value = "";
    replying.hidden = true;
    replying.innerHTML = "";
  };

  const setReplyTarget = async (commentId, nickname, previewText) => {
    if (!commentId) {
      clearReplyTarget();
      collapseComposer();
      return;
    }

    parentInput.value = String(commentId);
    replying.hidden = false;
    replying.innerHTML = `
      <div class="content-comment-replying-head">
        <p>${TEXT.replyingTo} <strong>${escapeHtml(nickname || TEXT.anonymous)}</strong></p>
        <button type="button" class="content-comment-cancel-reply" data-action="cancel-reply">${TEXT.cancelReply}</button>
      </div>
      <p class="content-comment-replying-preview">${escapeHtml(previewText || TEXT.noText)}</p>
    `;
    replying.querySelector("[data-action='cancel-reply']")?.addEventListener("click", () => {
      clearReplyTarget();
      contentInput.focus();
    });

    await expandComposer({ focus: true, scroll: true });
  };

  const renderComments = (items = []) => {
    reconcilePendingComments(state.pageKey, items);
    const pendingItems = getPendingComments(state.pageKey).map((item) => normalizePendingComment(item));
    const sorted = [...pendingItems, ...sortCommentTreeByTime(items, "desc")];
    const totalCount = countCommentTree(sorted);

    count.textContent = `${totalCount} ${TEXT.countSuffix}`;
    if (!sorted.length) {
      list.innerHTML = `<div class="content-comment-empty-card"><p class="content-comment-empty-title">${TEXT.empty}</p></div>`;
      return;
    }

    list.innerHTML = sorted.map((item) => renderCommentNode(item)).join("");
  };

  const loadComments = async () => {
    list.innerHTML = `<p class="subtle content-comment-empty">${TEXT.loading}</p>`;

    try {
      const payload = await apiJson(`/api/comments?page_key=${encodeURIComponent(state.pageKey)}&limit=100`);
      if (!state.active) {
        return;
      }
      renderComments(payload.items || []);
    } catch (error) {
      if (!state.active) {
        return;
      }
      list.innerHTML = `<p class="subtle content-comment-empty">${escapeHtml(error.message || TEXT.loadFailed)}</p>`;
    }
  };

  container.addEventListener("click", (event) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (!target) {
      return;
    }

    const action = target.dataset.action;
    if (action === "refresh") {
      void loadComments();
      return;
    }
    if (action === "toggle-compose" || action === "open-compose") {
      void expandComposer({ focus: true, scroll: mode === "note" });
      return;
    }
    if (action === "reply") {
      const commentId = target.dataset.commentId || "";
      const nickname = target.dataset.commentName || "";
      const previewText = target.dataset.commentPreview || "";
      void setReplyTarget(commentId, nickname, previewText);
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setFeedback("");

    const nickname = String(form.elements.nickname.value || "").trim();
    const contact = String(form.elements.contact.value || "").trim();
    const content = String(contentInput.value || "").trim();
    const turnstileToken = getTurnstileToken();

    if (!nickname) {
      setFeedback("\u8bf7\u586b\u5199\u6635\u79f0\u3002", true);
      return;
    }
    if (!contact) {
      setFeedback("\u8bf7\u586b\u5199\u8054\u7cfb\u65b9\u5f0f\u3002", true);
      return;
    }
    if (!content) {
      setFeedback("\u8bf7\u586b\u5199\u7559\u8a00\u5185\u5bb9\u3002", true);
      return;
    }
    if (state.turnstileSiteKey && !turnstileToken) {
      setFeedback("\u8bf7\u5148\u5b8c\u6210\u4eba\u673a\u9a8c\u8bc1\u3002", true);
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = TEXT.submitting;

    try {
      const result = await apiJson("/api/comments", {
        method: "POST",
        body: JSON.stringify({
          page_key: state.pageKey,
          parent_id: parentInput.value ? Number(parentInput.value) : null,
          nickname,
          contact,
          content,
          notify_enabled: notifyToggle.checked,
          turnstileToken,
        }),
      });

      setFeedback(result.pending ? TEXT.pending : TEXT.published);
      if (result.pending && result.comment) {
        savePendingComment(state.pageKey, normalizePendingComment(result.comment));
      }
      form.reset();
      notifyToggle.checked = state.config.commentNotifyDefault !== false;
      clearReplyTarget();
      resetTurnstile();
      await loadComments();
      showCommentSuccessToast("\u8bc4\u8bba\u6210\u529f\uff01\u5ba1\u6838\u540e\u5c55\u73b0");

      if (mode === "note") {
        collapseComposer();
      }
    } catch (error) {
      setFeedback(error.message || TEXT.loadFailed, true);
      resetTurnstile();
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = TEXT.submit;
    }
  });

  void (async () => {
    state.config = await loadConfig();
    if (!state.active) {
      return;
    }

    state.turnstileSiteKey = state.config.turnstileSiteKey || "";
    notifyToggle.checked = state.config.commentNotifyDefault !== false;
    if (mode !== "note") {
      await ensureTurnstile();
    }

    await loadComments();
    onRendered?.();
  })();

  return {
    async refresh() {
      await loadComments();
    },
    destroy() {
      state.active = false;
      if (window.turnstile && state.widgetId !== null) {
        try {
          window.turnstile.remove(state.widgetId);
        } catch {
          // ignore widget removal failures during teardown
        }
      }
      state.widgetId = null;
      container.innerHTML = "";
    },
  };
}
