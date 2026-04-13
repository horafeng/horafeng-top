import { escapeHtml, linkify } from "./common.js";
import {
  clearCommentIdentity,
  getPendingComments,
  getStoredCommentIdentity,
  normalizePendingComment,
  reconcilePendingComments,
  renderPendingBadge,
  saveCommentIdentity,
  savePendingComment,
  showCommentSuccessToast,
} from "./comment-ui.js";

const TEXT = {
  title: "\u7559\u8a00",
  subtitleArticle: "\u770b\u5b8c\u8fd9\u7bc7\u5185\u5bb9\u540e\uff0c\u6b22\u8fce\u7559\u4e0b\u4f60\u7684\u60f3\u6cd5\u3002",
  subtitleNote: "\u8fd9\u6761\u5c0f\u8bb0\u4e0b\u9762\u4e5f\u53ef\u4ee5\u76f4\u63a5\u7559\u8a00\u3002",
  subtitleGuestbook: "\u8fd9\u91cc\u662f\u72ec\u7acb\u7559\u8a00\u677f\uff0c\u4e5f\u6b22\u8fce\u56de\u590d\u5176\u4ed6\u8bbf\u5ba2\u3002",
  empty: "\u8fd8\u6ca1\u6709\u516c\u5f00\u7559\u8a00\uff0c\u6b22\u8fce\u5199\u4e0b\u7b2c\u4e00\u6761\u3002",
  loading: "\u6b63\u5728\u52a0\u8f7d\u7559\u8a00...",
  loadFailed: "\u7559\u8a00\u52a0\u8f7d\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002",
  refresh: "\u5237\u65b0",
  writeComment: "\u5199\u8bc4\u8bba",
  submit: "\u53d1\u9001",
  submitting: "\u53d1\u9001\u4e2d...",
  contentPlaceholder: "\u5199\u4e0b\u4f60\u7684\u60f3\u6cd5...",
  pending: "\u8bc4\u8bba\u5df2\u63d0\u4ea4\uff0c\u5ba1\u6838\u540e\u5c55\u73b0\u3002",
  published: "\u8bc4\u8bba\u5df2\u53d1\u5e03\u3002",
  anonymous: "\u8bbf\u5ba2",
  reply: "\u56de\u590d",
  countSuffix: "\u6761",
  replyingTo: "\u6b63\u5728\u56de\u590d",
  cancelReply: "\u53d6\u6d88\u56de\u590d",
  identityTitle: "\u53d1\u8868\u8bc4\u8bba\u524d\u8bf7\u5148\u586b\u5199\u4fe1\u606f",
  nickname: "\u6635\u79f0",
  contact: "\u8054\u7cfb\u65b9\u5f0f",
  contactHint: "\u8bf7\u586b\u5199 QQ \u6216\u90ae\u7bb1",
  notify: "\u6536\u5230\u56de\u590d\u65f6\uff0c\u901a\u8fc7\u90ae\u7bb1\u63d0\u9192\u6211",
  continueComment: "\u7ee7\u7eed\u8bc4\u8bba",
  cancel: "\u53d6\u6d88",
  identityHint: "\u4eba\u673a\u9a8c\u8bc1\u901a\u8fc7\u540e\uff0c\u4f1a\u5728\u672c\u673a\u8bb0\u4f4f\u4f60\u7684\u8eab\u4efd\u4fe1\u606f\u3002",
  editIdentity: "\u4fee\u6539\u4fe1\u606f",
  switchIdentity: "\u5207\u6362\u8eab\u4efd",
  verifiedAs: "\u4ee5",
  verifiedSuffix: "\u8eab\u4efd\u8bc4\u8bba",
  verifiedCompact: "\u5df2\u8bb0\u4f4f\u8eab\u4efd",
  pressHint: "Enter \u53d1\u9001\uff0cShift+Enter \u6362\u884c",
  noText: "\uff08\u8fd9\u6761\u8bc4\u8bba\u6682\u65e0\u6b63\u6587\uff09",
  turnstileHint: "\u8bf7\u5b8c\u6210\u4eba\u673a\u9a8c\u8bc1\u540e\u518d\u7ee7\u7eed\u3002",
  turnstileMissing: "Turnstile Site Key \u672a\u914d\u7f6e\u3002",
  fillNickname: "\u8bf7\u586b\u5199\u6635\u79f0\u3002",
  fillContact: "\u8bf7\u586b\u5199\u8054\u7cfb\u65b9\u5f0f\u3002",
  fillContent: "\u8bf7\u586b\u5199\u8bc4\u8bba\u5185\u5bb9\u3002",
  verifyFirst: "\u8bf7\u5148\u5b8c\u6210\u4fe1\u606f\u9a8c\u8bc1\u3002",
};

const DEFAULTS = {
  turnstileSiteKey: "",
  commentNotifyDefault: true,
  defaultAvatarUrl: "/assets/images/avatar-default.svg",
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
    credentials: "same-origin",
    headers: {
      "content-type": "application/json",
      ...(options.headers || {}),
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.message || TEXT.loadFailed);
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function loadConfig() {
  if (!cachedConfigPromise) {
    cachedConfigPromise = apiJson("/api/config", { method: "GET", headers: {} }).catch(() => DEFAULTS);
  }
  const config = await cachedConfigPromise;
  return { ...DEFAULTS, ...config };
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

function countCommentTree(nodes = []) {
  return nodes.reduce(
    (total, node) => total + 1 + countCommentTree(Array.isArray(node.children) ? node.children : []),
    0,
  );
}

function cloneCommentNode(node = {}) {
  return {
    ...node,
    children: Array.isArray(node.children) ? node.children.map((child) => cloneCommentNode(child)) : [],
  };
}

function mergePendingComments(items = [], pendingItems = []) {
  const roots = items.map((item) => cloneCommentNode(item));
  const map = new Map();

  const collect = (node) => {
    map.set(String(node.id), node);
    (node.children || []).forEach(collect);
  };
  roots.forEach(collect);

  [...pendingItems]
    .sort((a, b) => (Date.parse(a.created_at || "") || 0) - (Date.parse(b.created_at || "") || 0))
    .forEach((item) => {
      const node = {
        ...normalizePendingComment(item),
        children: [],
      };
      const parentId = node.parent_id === null || node.parent_id === undefined ? "" : String(node.parent_id);
      const parent = parentId ? map.get(parentId) : null;

      if (parent) {
        node.reply_to = parent.nickname || TEXT.anonymous;
        node.reply_to_id = parent.id;
        parent.children = Array.isArray(parent.children) ? parent.children : [];
        parent.children.push(node);
      } else {
        roots.unshift(node);
      }

      map.set(String(node.id), node);
    });

  return sortCommentTreeByTime(roots, "desc");
}

function flattenReplies(children = [], bucket = []) {
  children.forEach((child) => {
    bucket.push(child);
    if (Array.isArray(child.children) && child.children.length) {
      flattenReplies(child.children, bucket);
    }
  });
  return bucket;
}

function renderReplyLabel(node) {
  if (!node.reply_to && !node.reply_to_id) {
    return "";
  }

  const idPart = node.reply_to_id ? `#${escapeHtml(node.reply_to_id)}` : "";
  const namePart = node.reply_to ? ` @${escapeHtml(node.reply_to)}` : "";
  return `<span class="content-comment-reply-prefix">回复 ${idPart}${namePart}</span>`;
}

function renderCommentNode(node, { isReply = false } = {}) {
  const adminClass = node.is_admin ? "is-admin" : "";
  const pendingClass = node.is_pending_local ? "is-pending-local" : "";
  const pendingBadge = node.is_pending_local ? renderPendingBadge(node.pending_label) : "";
  const authorName = node.nickname || TEXT.anonymous;
  const replyLabel = isReply ? renderReplyLabel(node) : "";

  return `
    <article class="content-comment-item ${isReply ? "is-reply" : "is-root"} ${adminClass} ${pendingClass}" data-comment-id="${escapeHtml(node.id)}">
      <header class="content-comment-item-head">
        <div class="content-comment-user">
          <img
            class="content-comment-avatar"
            src="${escapeHtml(node.avatar_url || DEFAULTS.defaultAvatarUrl)}"
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
      <div class="content-comment-body">${replyLabel}${replyLabel ? " " : ""}${contentToHtml(node.content)}</div>
    </article>
  `;
}

function renderCommentThread(node) {
  const replies = flattenReplies(sortCommentTreeByTime(Array.isArray(node.children) ? node.children : [], "asc")).sort(
    (a, b) => (Date.parse(a.created_at || "") || 0) - (Date.parse(b.created_at || "") || 0),
  );

  return `
    <article class="content-comment-thread-item" data-comment-thread="${escapeHtml(node.id)}">
      ${renderCommentNode(node)}
      ${replies.length ? `<div class="content-comment-replies">${replies.map((reply) => renderCommentNode(reply, { isReply: true })).join("")}</div>` : ""}
    </article>
  `;
}

function buildWidgetMarkup(mode) {
  const subtitle =
    mode === "note" ? TEXT.subtitleNote : mode === "guestbook" ? TEXT.subtitleGuestbook : TEXT.subtitleArticle;

  return `
    <section class="content-comment-thread content-comment-thread-${mode}">
      <div class="content-comment-head">
        <div>
          <h4>${TEXT.title}</h4>
          <p class="subtle">${subtitle}</p>
        </div>
        <div class="content-comment-head-actions">
          <span class="content-comment-count" data-comment-count>0 ${TEXT.countSuffix}</span>
          <button type="button" class="content-comment-refresh" data-action="refresh">${TEXT.refresh}</button>
        </div>
      </div>

      <section class="content-comment-entry" data-entry-area>
        <div class="content-comment-identity-inline subtle" data-identity-summary hidden></div>
        <div class="content-comment-actions-bar" data-actions-bar>
          <button type="button" class="content-comment-primary-btn" data-action="open-compose">${TEXT.writeComment}</button>
          <button type="button" class="content-comment-secondary-btn" data-action="edit-identity" hidden>${TEXT.editIdentity}</button>
        </div>

        <div class="content-comment-composer" data-composer hidden>
          <div class="content-comment-composer-head">
            <p class="content-comment-composer-title" data-composer-title>${TEXT.writeComment}</p>
            <button type="button" class="content-comment-secondary-btn" data-action="cancel-compose">${TEXT.cancel}</button>
          </div>
          <textarea
            class="content-comment-textarea"
            data-content-input
            rows="1"
            maxlength="2000"
            placeholder="${TEXT.contentPlaceholder}"
          ></textarea>
          <div class="content-comment-composer-foot">
            <p class="subtle">${TEXT.pressHint}</p>
            <div class="content-comment-composer-buttons">
              <button type="button" class="content-comment-secondary-btn" data-action="edit-identity-inline">${TEXT.switchIdentity}</button>
              <button type="button" class="content-comment-submit-btn" data-action="submit-comment">${TEXT.submit}</button>
            </div>
          </div>
          <p class="subtle content-comment-feedback" data-feedback></p>
        </div>
      </section>

      <section class="content-comment-list-wrap">
        <div class="content-comment-list" data-comment-list>
          <p class="subtle content-comment-empty">${TEXT.loading}</p>
        </div>
      </section>
    </section>
  `;
}

function ensureIdentityModal() {
  let modal = document.getElementById("comment-identity-modal");
  if (modal) {
    return modal;
  }

  modal = document.createElement("div");
  modal.id = "comment-identity-modal";
  modal.className = "comment-identity-modal";
  modal.hidden = true;
  modal.innerHTML = `
    <div class="comment-identity-backdrop" data-close-identity="1"></div>
    <div class="comment-identity-dialog" role="dialog" aria-modal="true" aria-labelledby="comment-identity-title">
      <button type="button" class="comment-identity-close" data-close-identity="1" aria-label="${TEXT.cancel}">×</button>
      <h3 id="comment-identity-title">${TEXT.identityTitle}</h3>
      <form class="comment-identity-form" data-identity-form novalidate>
        <div class="content-comment-grid">
          <div>
            <label class="field-block" for="comment-identity-nickname">${TEXT.nickname}</label>
            <input id="comment-identity-nickname" name="nickname" type="text" maxlength="24" required />
          </div>
          <div>
            <label class="field-block" for="comment-identity-contact">${TEXT.contact} <span class="subtle">${TEXT.contactHint}</span></label>
            <input id="comment-identity-contact" name="contact" type="text" maxlength="120" placeholder="name@example.com \u6216 12345678" required />
          </div>
        </div>
        <label class="notify-option" for="comment-identity-notify">
          <input id="comment-identity-notify" name="notify_enabled" type="checkbox" checked />
          <span>${TEXT.notify}</span>
        </label>
        <div class="turnstile-slot comment-identity-turnstile">
          <div data-identity-turnstile></div>
          <p class="subtle" data-identity-turnstile-hint></p>
        </div>
        <p class="subtle comment-identity-hint">${TEXT.identityHint}</p>
        <p class="subtle feedback-error" data-identity-feedback></p>
        <div class="comment-identity-actions">
          <button type="button" class="content-comment-secondary-btn" data-close-identity="1">${TEXT.cancel}</button>
          <button type="submit" class="content-comment-submit-btn" data-identity-submit>${TEXT.continueComment}</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(modal);
  return modal;
}

function mountContentComments(options = {}) {
  const { container, pageKey, mode = "article", onRendered } = options;
  if (!(container instanceof HTMLElement) || !pageKey) {
    return { destroy() {} };
  }

  const state = {
    pageKey: String(pageKey),
    mode,
    active: true,
    config: DEFAULTS,
    identity: getStoredCommentIdentity(),
    replyTarget: null,
    modalWidgetId: null,
    loadingIdentityModal: false,
  };

  container.innerHTML = buildWidgetMarkup(mode);

  const list = container.querySelector("[data-comment-list]");
  const count = container.querySelector("[data-comment-count]");
  const composer = container.querySelector("[data-composer]");
  const identitySummary = container.querySelector("[data-identity-summary]");
  const editIdentityButton = container.querySelector("[data-action='edit-identity']");
  const composerTitle = container.querySelector("[data-composer-title]");
  const contentInput = container.querySelector("[data-content-input]");
  const feedback = container.querySelector("[data-feedback]");
  const submitButton = container.querySelector("[data-action='submit-comment']");

  const setFeedback = (message = "", isError = false) => {
    feedback.textContent = message;
    feedback.classList.toggle("feedback-error", Boolean(isError));
  };

  const clearReplyTarget = () => {
    state.replyTarget = null;
    composerTitle.textContent = TEXT.writeComment;
  };

  const applyIdentitySummary = () => {
    if (!state.identity) {
      identitySummary.hidden = true;
      identitySummary.innerHTML = "";
      editIdentityButton.hidden = true;
      return;
    }

    identitySummary.hidden = false;
    identitySummary.innerHTML = `
      <span>${TEXT.verifiedCompact}：</span>
      <strong>${escapeHtml(state.identity.nickname)}</strong>
      <span>${escapeHtml(state.identity.contact)}</span>
      ${state.identity.notify_enabled ? "<span>/ \u5df2\u5f00\u542f\u56de\u590d\u63d0\u9192</span>" : ""}
    `;
    editIdentityButton.hidden = false;
  };

  const openComposer = () => {
    composer.hidden = false;
    contentInput.focus();
  };

  const closeComposer = () => {
    if (String(contentInput.value || "").trim()) {
      return;
    }
    composer.hidden = true;
    clearReplyTarget();
    setFeedback("");
  };

  const openIdentityModal = async (afterConfirm) => {
    const modal = ensureIdentityModal();
    const form = modal.querySelector("[data-identity-form]");
    const nicknameInput = modal.querySelector("#comment-identity-nickname");
    const contactInput = modal.querySelector("#comment-identity-contact");
    const notifyInput = modal.querySelector("#comment-identity-notify");
    const submit = modal.querySelector("[data-identity-submit]");
    const feedbackEl = modal.querySelector("[data-identity-feedback]");
    const turnstileHint = modal.querySelector("[data-identity-turnstile-hint]");
    const turnstileSlot = modal.querySelector("[data-identity-turnstile]");

    const closeModal = () => {
      modal.hidden = true;
      document.body.classList.remove("no-scroll");
    };

    const identity = state.identity || getStoredCommentIdentity();
    nicknameInput.value = identity?.nickname || "";
    contactInput.value = identity?.contact || "";
    notifyInput.checked = identity?.notify_enabled !== false;
    feedbackEl.textContent = "";
    modal.hidden = false;
    document.body.classList.add("no-scroll");

    modal.querySelectorAll("[data-close-identity]").forEach((button) => {
      button.onclick = () => closeModal();
    });

    if (!state.loadingIdentityModal) {
      state.loadingIdentityModal = true;
      try {
        if (!state.config.turnstileSiteKey) {
          turnstileHint.textContent = TEXT.turnstileMissing;
        } else {
          await ensureTurnstileScript();
          if (state.modalWidgetId === null) {
            state.modalWidgetId = window.turnstile.render(turnstileSlot, {
              sitekey: state.config.turnstileSiteKey,
              theme: "light",
            });
          } else {
            window.turnstile.reset(state.modalWidgetId);
          }
          turnstileHint.textContent = TEXT.turnstileHint;
        }
      } catch (error) {
        turnstileHint.textContent = error.message || TEXT.loadFailed;
      } finally {
        state.loadingIdentityModal = false;
      }
    } else if (window.turnstile && state.modalWidgetId !== null) {
      window.turnstile.reset(state.modalWidgetId);
    }

    form.onsubmit = async (event) => {
      event.preventDefault();
      feedbackEl.textContent = "";

      const nickname = String(nicknameInput.value || "").trim();
      const contact = String(contactInput.value || "").trim();
      const notify_enabled = notifyInput.checked;
      const turnstileToken =
        state.config.turnstileSiteKey && window.turnstile && state.modalWidgetId !== null
          ? window.turnstile.getResponse(state.modalWidgetId) || ""
          : "";

      if (!nickname) {
        feedbackEl.textContent = TEXT.fillNickname;
        return;
      }
      if (!contact) {
        feedbackEl.textContent = TEXT.fillContact;
        return;
      }
      if (state.config.turnstileSiteKey && !turnstileToken) {
        feedbackEl.textContent = TEXT.verifyFirst;
        return;
      }

      submit.disabled = true;
      submit.textContent = TEXT.submitting;

      try {
        const result = await apiJson("/api/comment-identity", {
          method: "POST",
          body: JSON.stringify({
            nickname,
            contact,
            notify_enabled,
            turnstileToken,
          }),
        });

        state.identity = result.identity || {
          nickname,
          contact,
          notify_enabled,
          verified_at: new Date().toISOString(),
        };
        saveCommentIdentity(state.identity);
        applyIdentitySummary();
        closeModal();
        afterConfirm?.();
      } catch (error) {
        feedbackEl.textContent = error.message || TEXT.loadFailed;
      } finally {
        submit.disabled = false;
        submit.textContent = TEXT.continueComment;
      }
    };
  };

  const renderComments = (items = []) => {
    reconcilePendingComments(state.pageKey, items);
    const pendingItems = getPendingComments(state.pageKey);
    const merged = mergePendingComments(sortCommentTreeByTime(items, "desc"), pendingItems);

    count.textContent = `${countCommentTree(merged)} ${TEXT.countSuffix}`;
    if (!merged.length) {
      list.innerHTML = `<div class="content-comment-empty-card"><p class="content-comment-empty-title">${TEXT.empty}</p></div>`;
      return;
    }
    list.innerHTML = merged.map((item) => renderCommentThread(item)).join("");
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

  const submitComment = async () => {
    if (!state.identity) {
      await openIdentityModal(() => openComposer());
      return;
    }

    const content = String(contentInput.value || "").trim();
    if (!content) {
      setFeedback(TEXT.fillContent, true);
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = TEXT.submitting;

    try {
      const result = await apiJson("/api/comments", {
        method: "POST",
        body: JSON.stringify({
          page_key: state.pageKey,
          parent_id: state.replyTarget?.id || null,
          nickname: state.identity.nickname,
          contact: state.identity.contact,
          content,
          notify_enabled: state.identity.notify_enabled,
        }),
      });

      if (result.pending && result.comment) {
        savePendingComment(state.pageKey, normalizePendingComment(result.comment));
      }

      contentInput.value = "";
      setFeedback(result.pending ? TEXT.pending : TEXT.published, false);
      showCommentSuccessToast("\u8bc4\u8bba\u6210\u529f\uff01\u5ba1\u6838\u540e\u5c55\u73b0");
      clearReplyTarget();
      await loadComments();
      closeComposer();
    } catch (error) {
      if (error.status === 400 && /Turnstile|verification/i.test(error.message || "")) {
        await openIdentityModal(() => openComposer());
      } else {
        setFeedback(error.message || TEXT.loadFailed, true);
      }
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = TEXT.submit;
    }
  };

  container.addEventListener("click", async (event) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (!target) {
      return;
    }

    const action = target.dataset.action;
    if (action === "refresh") {
      void loadComments();
      return;
    }
    if (action === "open-compose") {
      if (state.identity) {
        openComposer();
      } else {
        await openIdentityModal(() => openComposer());
      }
      return;
    }
    if (action === "edit-identity" || action === "edit-identity-inline") {
      await openIdentityModal(() => openComposer());
      return;
    }
    if (action === "cancel-compose") {
      closeComposer();
      return;
    }
    if (action === "reply") {
      state.replyTarget = {
        id: target.dataset.commentId || "",
        name: target.dataset.commentName || TEXT.anonymous,
        preview: target.dataset.commentPreview || TEXT.noText,
      };
      composerTitle.textContent = `${TEXT.replyingTo} ${state.replyTarget.name}`;
      if (state.identity) {
        openComposer();
      } else {
        await openIdentityModal(() => openComposer());
      }
    }
  });

  contentInput.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }
    event.preventDefault();
    await submitComment();
  });

  submitButton.addEventListener("click", () => {
    submitComment().catch(() => {});
  });

  applyIdentitySummary();

  void (async () => {
    state.config = await loadConfig();
    if (!state.active) {
      return;
    }
    applyIdentitySummary();
    await loadComments();
    onRendered?.();
  })();

  return {
    async refresh() {
      await loadComments();
    },
    destroy() {
      state.active = false;
      container.innerHTML = "";
    },
    clearIdentity() {
      clearCommentIdentity();
      state.identity = null;
      applyIdentitySummary();
    },
  };
}

export { mountContentComments };
