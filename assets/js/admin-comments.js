import { escapeHtml, linkify } from "./common.js?v=f6e0c5dd3d";

const TEXT = {
  loginSuccess: "\u767b\u5f55\u6210\u529f\u3002",
  logoutSuccess: "\u5df2\u9000\u51fa\u767b\u5f55\u3002",
  fillLogin: "\u8bf7\u586b\u5199\u8d26\u53f7\u548c\u5bc6\u7801\u3002",
  loadingComments: "\u6b63\u5728\u52a0\u8f7d\u7559\u8a00\u2026",
  noComments: "\u5f53\u524d\u7b5b\u9009\u6761\u4ef6\u4e0b\u6ca1\u6709\u7559\u8a00\u3002",
  emptyReply: "\u56de\u590d\u5185\u5bb9\u4e0d\u80fd\u4e3a\u7a7a\u3002",
  replySent: "\u56de\u590d\u5df2\u53d1\u9001\u3002",
  commentDeleted: "\u7559\u8a00\u5df2\u5220\u9664\u3002",
  sessionExpired: "\u767b\u5f55\u5df2\u5931\u6548\uff0c\u8bf7\u91cd\u65b0\u767b\u5f55\u3002",
  dashboardUnavailable: "\u540e\u53f0\u6682\u4e0d\u53ef\u7528\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002",
  loadingSync: "\u6b63\u5728\u52a0\u8f7d Notion \u540c\u6b65\u72b6\u6001\u2026",
  syncIdle: "\u7a7a\u95f2",
  syncRunning: "\u540c\u6b65\u4e2d",
  syncTriggered: "\u5df2\u89e6\u53d1",
  syncSuccess: "\u6210\u529f",
  syncFailed: "\u5931\u8d25",
  syncSkipped: "\u65e0\u53d8\u66f4",
  syncNever: "\u6682\u65e0",
  syncRequested: "Notion \u540c\u6b65\u5df2\u89e6\u53d1\uff0c\u6b63\u5728\u7b49\u5f85\u7ed3\u679c\u56de\u62a5\u3002",
  syncConflict: "\u5f53\u524d\u5df2\u6709\u4e00\u6b21 Notion \u540c\u6b65\u5728\u8fdb\u884c\u4e2d\u3002",
  syncButtonIdle: "\u7acb\u5373\u540c\u6b65 Notion",
  syncButtonBusy: "\u6b63\u5728\u89e6\u53d1\u2026",
  autoOn: "\u5df2\u5f00\u542f",
  autoOff: "\u5df2\u5173\u95ed",
  autoEnableButton: "\u5f00\u542f\u81ea\u52a8\u540c\u6b65",
  autoDisableButton: "\u5173\u95ed\u81ea\u52a8\u540c\u6b65",
  autoUpdating: "\u6b63\u5728\u66f4\u65b0\u81ea\u52a8\u540c\u6b65\u2026",
  autoUpdated: (enabled) => `\u81ea\u52a8\u540c\u6b65\u5df2${enabled ? "\u5f00\u542f" : "\u5173\u95ed"}\u3002`,
  bloggerBadge: "\u535a\u4e3b",
  contactLabel: "\u8054\u7cfb\u65b9\u5f0f\uff08\u4ec5\u540e\u53f0\u53ef\u89c1\uff09\uff1a",
  notifyEnabled: "\u90ae\u4ef6\u63d0\u9192\uff1a\u5df2\u5f00\u542f",
  notifyDisabled: "\u90ae\u4ef6\u63d0\u9192\uff1a\u5df2\u5173\u95ed",
  recipientLabel: "\u6536\u4ef6\uff1a",
  statusLabel: "\u72b6\u6001\uff1a",
  replyToLabel: "\u56de\u590d",
  approve: "\u901a\u8fc7",
  pending: "\u5f85\u5ba1",
  spam: "\u6807\u8bb0\u5783\u573e",
  remove: "\u5220\u9664",
  reply: "\u56de\u590d",
  replyPlaceholder: "\u8f93\u5165\u56de\u590d\u5185\u5bb9",
  sendReply: "\u53d1\u9001\u56de\u590d",
  totalLoaded: (count, total) => `\u5df2\u52a0\u8f7d ${count} \u6761\u7559\u8a00\uff08\u603b\u8ba1 ${total} \u6761\uff09\u3002`,
  totalEmpty: "\u5171 0 \u6761\u7559\u8a00\u3002",
  statusUpdated: (status) => `\u5df2\u66f4\u65b0\u72b6\u6001\u4e3a ${status}\u3002`,
  sourceGuestbook: "\u7559\u8a00\u677f",
  sourceNote: "\u5c0f\u8bb0",
  sourceArticle: "\u6587\u7ae0",
  sourceOther: "\u5176\u4ed6\u9875\u9762",
};

const state = {
  loggedIn: false,
  loading: false,
  syncLoading: false,
  syncPollingTimer: null,
  syncStatus: null,
  autoToggleLoading: false,
};

function setLoginFeedback(message, isError = false) {
  const el = document.getElementById("admin-login-feedback");
  if (!el) return;
  el.textContent = message || "";
  el.classList.toggle("feedback-error", Boolean(isError));
}

function setAdminFeedback(message, isError = false) {
  const el = document.getElementById("admin-feedback");
  if (!el) return;
  el.textContent = message || "";
  el.classList.toggle("feedback-error", Boolean(isError));
}

function setSyncFeedback(message, isError = false) {
  const el = document.getElementById("admin-sync-message");
  if (!el) return;
  el.textContent = message || "";
  el.classList.toggle("feedback-error", Boolean(isError));
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
    const error = new Error(payload.message || "Request failed.");
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

function formatTime(isoString) {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return isoString || TEXT.syncNever;
  }
  return date.toLocaleString("zh-CN", { hour12: false });
}

function contentToHtml(text) {
  return String(text || "")
    .split("\n")
    .map((line) => linkify(line))
    .join("<br />");
}

function togglePanels(loggedIn) {
  state.loggedIn = loggedIn;
  const loginPanel = document.getElementById("admin-login-panel");
  const dashboard = document.getElementById("admin-dashboard");
  if (loginPanel) loginPanel.hidden = loggedIn;
  if (dashboard) dashboard.hidden = !loggedIn;
}

function getSyncStatusLabel(item) {
  if (!item) return TEXT.syncNever;
  if (item.status === "syncing") return TEXT.syncRunning;
  return TEXT.syncIdle;
}

function getSyncResultLabel(item) {
  if (!item) return TEXT.syncNever;
  if (item.last_result === "triggered") return TEXT.syncTriggered;
  if (item.last_result === "success") return TEXT.syncSuccess;
  if (item.last_result === "failed") return TEXT.syncFailed;
  if (item.last_result === "skipped") return TEXT.syncSkipped;
  return TEXT.syncNever;
}

function updateSyncButton() {
  const button = document.getElementById("admin-sync-trigger");
  if (!button) return;

  const busy = state.syncLoading || state.syncStatus?.status === "syncing";
  button.disabled = busy;
  button.textContent = state.syncLoading ? TEXT.syncButtonBusy : TEXT.syncButtonIdle;

  const autoButton = document.getElementById("admin-sync-toggle-auto");
  if (!autoButton) return;
  autoButton.disabled = state.autoToggleLoading;
  autoButton.textContent = state.autoToggleLoading
    ? TEXT.autoUpdating
    : state.syncStatus?.auto_enabled
      ? TEXT.autoDisableButton
      : TEXT.autoEnableButton;
}

function renderSyncStatus(item) {
  state.syncStatus = item || null;

  const statusEl = document.getElementById("admin-sync-status");
  const resultEl = document.getElementById("admin-sync-result");
  const startedAtEl = document.getElementById("admin-sync-started-at");
  const finishedAtEl = document.getElementById("admin-sync-finished-at");
  const autoStatusEl = document.getElementById("admin-sync-auto-status");
  const checkedAtEl = document.getElementById("admin-sync-checked-at");

  if (statusEl) statusEl.textContent = getSyncStatusLabel(item);
  if (resultEl) resultEl.textContent = getSyncResultLabel(item);
  if (startedAtEl) startedAtEl.textContent = item?.last_started_at ? formatTime(item.last_started_at) : TEXT.syncNever;
  if (finishedAtEl) finishedAtEl.textContent = item?.last_finished_at ? formatTime(item.last_finished_at) : TEXT.syncNever;
  if (autoStatusEl) autoStatusEl.textContent = item?.auto_enabled ? TEXT.autoOn : TEXT.autoOff;
  if (checkedAtEl) checkedAtEl.textContent = item?.last_checked_at ? formatTime(item.last_checked_at) : TEXT.syncNever;

  const detailMessage = item?.last_message || "";
  setSyncFeedback(detailMessage || "", item?.last_result === "failed");
  updateSyncButton();
  syncPollingControl();
}

function syncPollingControl() {
  const shouldPoll = state.loggedIn && state.syncStatus?.status === "syncing";
  if (shouldPoll && !state.syncPollingTimer) {
    state.syncPollingTimer = window.setInterval(() => {
      loadSyncStatus({ silent: true }).catch(() => {});
    }, 5000);
    return;
  }

  if (!shouldPoll && state.syncPollingTimer) {
    window.clearInterval(state.syncPollingTimer);
    state.syncPollingTimer = null;
  }
}

function commentCard(comment) {
  const source = getCommentSourceMeta(comment.page_key);
  const adminBadge = comment.is_admin ? `<span class="admin-badge">${TEXT.bloggerBadge}</span>` : "";
  const notifyText = comment.notify_enabled ? TEXT.notifyEnabled : TEXT.notifyDisabled;
  const recipient = comment.contact_email_resolved ? ` / ${TEXT.recipientLabel}${escapeHtml(comment.contact_email_resolved)}` : "";
  const replyTo =
    comment.parent_id !== null
      ? ` / ${TEXT.replyToLabel} #${comment.parent_id}${comment.parent_nickname ? ` (${escapeHtml(comment.parent_nickname)})` : ""}`
      : "";

  return `
    <article class="admin-comment-card status-${escapeHtml(comment.status)}" data-comment-id="${comment.id}">
      <header class="admin-comment-head">
        <p><strong>${escapeHtml(comment.nickname)}</strong>${adminBadge}</p>
        <p class="subtle"><span class="admin-source-pill">${escapeHtml(source.label)}</span> ${escapeHtml(comment.page_key)} / ${formatTime(comment.created_at)}</p>
      </header>
      <p class="admin-comment-contact subtle">${TEXT.contactLabel}${escapeHtml(comment.contact || "-")}</p>
      <p class="admin-comment-contact subtle">${notifyText}${recipient}</p>
      <p class="admin-comment-content">${contentToHtml(comment.content)}</p>
      <p class="subtle">
        ${TEXT.statusLabel}<span class="status-pill">${escapeHtml(comment.status)}</span>${replyTo}
      </p>
      <div class="admin-comment-actions">
        <button type="button" data-action="status" data-status="approved">${TEXT.approve}</button>
        <button type="button" data-action="status" data-status="pending">${TEXT.pending}</button>
        <button type="button" data-action="status" data-status="spam">${TEXT.spam}</button>
        <button type="button" data-action="delete" class="warn">${TEXT.remove}</button>
        <button type="button" data-action="toggle-reply">${TEXT.reply}</button>
      </div>
      <div class="admin-reply-box" hidden>
        <textarea rows="3" placeholder="${TEXT.replyPlaceholder}"></textarea>
        <button type="button" data-action="send-reply">${TEXT.sendReply}</button>
      </div>
    </article>
  `;
}

function getCommentSourceMeta(pageKey) {
  const key = String(pageKey || "").trim().toLowerCase();
  if (key === "guestbook") {
    return { label: TEXT.sourceGuestbook };
  }
  if (key.startsWith("note:")) {
    return { label: TEXT.sourceNote };
  }
  if (key.startsWith("article:")) {
    return { label: TEXT.sourceArticle };
  }
  return { label: TEXT.sourceOther };
}

async function loadComments() {
  if (state.loading) {
    return;
  }
  state.loading = true;

  const list = document.getElementById("admin-comments-list");
  if (list) {
    list.innerHTML = `<p class="subtle">${TEXT.loadingComments}</p>`;
  }

  try {
    const pageKey = document.getElementById("admin-filter-page-key").value.trim();
    const status = document.getElementById("admin-filter-status").value;
    const params = new URLSearchParams();
    if (pageKey) params.set("page_key", pageKey);
    if (status) params.set("status", status);
    params.set("limit", "200");

    const result = await apiJson(`/api/admin/comments?${params.toString()}`, { method: "GET", headers: {} });
    const items = result.items || [];

    if (!items.length) {
      if (list) {
        list.innerHTML = `<p class="subtle">${TEXT.noComments}</p>`;
      }
      setAdminFeedback(TEXT.totalEmpty);
      return;
    }

    if (list) {
      list.innerHTML = items.map((item) => commentCard(item)).join("");
    }
    setAdminFeedback(TEXT.totalLoaded(items.length, result.total || items.length));
  } catch (error) {
    if (error.status === 401) {
      togglePanels(false);
      setLoginFeedback(TEXT.sessionExpired, true);
      if (list) list.innerHTML = "";
      throw error;
    }
    if (list) list.innerHTML = "";
    setAdminFeedback(error.message || "Load failed.", true);
    throw error;
  } finally {
    state.loading = false;
  }
}

async function loadSyncStatus({ silent = false } = {}) {
  if (state.syncLoading && silent) {
    return;
  }

  if (!silent) {
    setSyncFeedback(TEXT.loadingSync, false);
  }

  try {
    const result = await apiJson("/api/admin/notion-sync", { method: "GET", headers: {} });
    renderSyncStatus(result.item || null);
  } catch (error) {
    if (error.status === 401) {
      togglePanels(false);
      setLoginFeedback(TEXT.sessionExpired, true);
      return;
    }
    if (!silent) {
      setSyncFeedback(error.message || "Failed to load notion sync status.", true);
    }
  }
}

async function triggerNotionSync() {
  if (state.syncLoading || state.syncStatus?.status === "syncing") {
    setSyncFeedback(TEXT.syncConflict, true);
    return;
  }

  state.syncLoading = true;
  updateSyncButton();
  setSyncFeedback(TEXT.loadingSync, false);

  try {
    const result = await apiJson("/api/admin/notion-sync", {
      method: "POST",
      body: "{}",
    });
    renderSyncStatus(result.item || null);
    setSyncFeedback(result.message || TEXT.syncRequested, false);
  } catch (error) {
    const item = error.payload?.item || null;
    if (item) {
      renderSyncStatus(item);
    }
    setSyncFeedback(error.message || "Failed to trigger notion sync.", true);
  } finally {
    state.syncLoading = false;
    updateSyncButton();
  }
}

async function toggleAutoSync() {
  if (state.autoToggleLoading || !state.syncStatus) {
    return;
  }

  state.autoToggleLoading = true;
  updateSyncButton();

  try {
    const result = await apiJson("/api/admin/notion-sync", {
      method: "PATCH",
      body: JSON.stringify({
        auto_enabled: !state.syncStatus.auto_enabled,
      }),
    });
    renderSyncStatus(result.item || null);
    setSyncFeedback(result.message || TEXT.autoUpdated(Boolean(result.item?.auto_enabled)), false);
  } catch (error) {
    setSyncFeedback(error.message || "Failed to update auto sync.", true);
  } finally {
    state.autoToggleLoading = false;
    updateSyncButton();
  }
}

async function doLogin(event) {
  event.preventDefault();
  setLoginFeedback("");

  const username = document.getElementById("admin-username").value.trim();
  const password = document.getElementById("admin-password").value.trim();
  if (!username || !password) {
    setLoginFeedback(TEXT.fillLogin, true);
    return;
  }

  try {
    const result = await apiJson("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    setLoginFeedback(result.message || TEXT.loginSuccess);
    togglePanels(true);
    await Promise.all([loadComments(), loadSyncStatus()]);
  } catch (error) {
    setLoginFeedback(error.message || "Login failed.", true);
  }
}

async function doLogout() {
  try {
    await apiJson("/api/admin/logout", { method: "POST", body: "{}" });
  } catch {
    // ignore
  } finally {
    togglePanels(false);
    setAdminFeedback("");
    setSyncFeedback("");
    setLoginFeedback(TEXT.logoutSuccess);
    state.syncStatus = null;
    syncPollingControl();
  }
}

async function updateStatus(commentId, status) {
  await apiJson("/api/admin/comments", {
    method: "PATCH",
    body: JSON.stringify({ id: Number(commentId), status }),
  });
}

async function deleteComment(commentId) {
  await apiJson("/api/admin/comments", {
    method: "DELETE",
    body: JSON.stringify({ id: Number(commentId) }),
  });
}

async function sendReply(commentId, content) {
  const pageKey = document.getElementById("admin-filter-page-key").value.trim() || "guestbook";
  await apiJson("/api/admin/comments", {
    method: "POST",
    body: JSON.stringify({
      page_key: pageKey,
      parent_id: Number(commentId),
      content,
    }),
  });
}

function bindDashboardEvents() {
  document.getElementById("admin-refresh").addEventListener("click", () => {
    loadComments().catch(() => {});
  });

  document.getElementById("admin-filter-status").addEventListener("change", () => {
    loadComments().catch(() => {});
  });

  document.getElementById("admin-logout").addEventListener("click", () => {
    doLogout();
  });

  document.getElementById("admin-sync-trigger").addEventListener("click", () => {
    triggerNotionSync().catch(() => {});
  });

  document.getElementById("admin-sync-toggle-auto").addEventListener("click", () => {
    toggleAutoSync().catch(() => {});
  });

  const list = document.getElementById("admin-comments-list");
  list.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const action = target.dataset.action;
    if (!action) {
      return;
    }

    const card = target.closest("[data-comment-id]");
    const commentId = card?.getAttribute("data-comment-id");
    if (!card || !commentId) {
      return;
    }

    try {
      if (action === "toggle-reply") {
        const box = card.querySelector(".admin-reply-box");
        box.hidden = !box.hidden;
        if (!box.hidden) {
          box.querySelector("textarea")?.focus();
        }
        return;
      }

      if (action === "send-reply") {
        const textarea = card.querySelector(".admin-reply-box textarea");
        const content = textarea?.value.trim() || "";
        if (!content) {
          setAdminFeedback(TEXT.emptyReply, true);
          return;
        }
        await sendReply(commentId, content);
        setAdminFeedback(TEXT.replySent);
        await loadComments();
        return;
      }

      if (action === "delete") {
        await deleteComment(commentId);
        setAdminFeedback(TEXT.commentDeleted);
        await loadComments();
        return;
      }

      if (action === "status") {
        const status = target.dataset.status;
        await updateStatus(commentId, status);
        setAdminFeedback(TEXT.statusUpdated(status));
        await loadComments();
      }
    } catch (error) {
      setAdminFeedback(error.message || "Operation failed.", true);
    }
  });
}

async function bootstrap() {
  document.getElementById("admin-login-form").addEventListener("submit", doLogin);
  bindDashboardEvents();
  updateSyncButton();

  try {
    await Promise.all([loadComments(), loadSyncStatus()]);
    togglePanels(true);
  } catch (error) {
    if (error.status === 401) {
      togglePanels(false);
      return;
    }
    setLoginFeedback(TEXT.dashboardUnavailable, true);
  }
}

bootstrap();
