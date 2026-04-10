import { escapeHtml, linkify } from "./common.js";

const state = {
  loggedIn: false,
  loading: false,
};

function setLoginFeedback(message, isError = false) {
  const el = document.getElementById("admin-login-feedback");
  el.textContent = message || "";
  el.classList.toggle("feedback-error", Boolean(isError));
}

function setAdminFeedback(message, isError = false) {
  const el = document.getElementById("admin-feedback");
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
    throw error;
  }

  return payload;
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

function togglePanels(loggedIn) {
  state.loggedIn = loggedIn;
  document.getElementById("admin-login-panel").hidden = loggedIn;
  document.getElementById("admin-dashboard").hidden = !loggedIn;
}

function commentCard(comment) {
  const adminBadge = comment.is_admin ? '<span class="admin-badge">博主</span>' : "";

  return `
    <article class="admin-comment-card status-${escapeHtml(comment.status)}" data-comment-id="${comment.id}">
      <header class="admin-comment-head">
        <p><strong>${escapeHtml(comment.nickname)}</strong>${adminBadge}</p>
        <p class="subtle">${escapeHtml(comment.page_key)} · ${formatTime(comment.created_at)}</p>
      </header>
      <p class="admin-comment-contact subtle">联系方式（仅后台可见）：${escapeHtml(comment.contact || "-")}</p>
      <p class="admin-comment-content">${contentToHtml(comment.content)}</p>
      <p class="subtle">
        状态：<span class="status-pill">${escapeHtml(comment.status)}</span>
        ${comment.parent_id ? ` · 回复 #${comment.parent_id}${comment.parent_nickname ? ` (${escapeHtml(comment.parent_nickname)})` : ""}` : ""}
      </p>
      <div class="admin-comment-actions">
        <button type="button" data-action="status" data-status="approved">通过</button>
        <button type="button" data-action="status" data-status="pending">待审</button>
        <button type="button" data-action="status" data-status="spam">标记垃圾</button>
        <button type="button" data-action="delete" class="warn">删除</button>
        <button type="button" data-action="toggle-reply">回复</button>
      </div>
      <div class="admin-reply-box" hidden>
        <textarea rows="3" placeholder="输入回复内容"></textarea>
        <button type="button" data-action="send-reply">发送回复</button>
      </div>
    </article>
  `;
}

async function loadComments() {
  if (state.loading) {
    return;
  }
  state.loading = true;

  const list = document.getElementById("admin-comments-list");
  list.innerHTML = '<p class="subtle">正在加载留言…</p>';

  try {
    const pageKey = document.getElementById("admin-filter-page-key").value.trim();
    const status = document.getElementById("admin-filter-status").value;
    const params = new URLSearchParams();
    if (pageKey) {
      params.set("page_key", pageKey);
    }
    if (status) {
      params.set("status", status);
    }
    params.set("limit", "200");

    const result = await apiJson(`/api/admin/comments?${params.toString()}`, { method: "GET", headers: {} });
    const items = result.items || [];

    if (!items.length) {
      list.innerHTML = '<p class="subtle">当前筛选条件下没有留言。</p>';
      setAdminFeedback("共 0 条留言。");
      return;
    }

    list.innerHTML = items.map((item) => commentCard(item)).join("");
    setAdminFeedback(`已加载 ${items.length} 条留言（总计 ${result.total || items.length} 条）。`);
  } catch (error) {
    if (error.status === 401) {
      togglePanels(false);
      setLoginFeedback("登录已失效，请重新登录。", true);
      list.innerHTML = "";
      throw error;
    }
    list.innerHTML = "";
    setAdminFeedback(error.message || "加载失败。", true);
    throw error;
  } finally {
    state.loading = false;
  }
}

async function doLogin(event) {
  event.preventDefault();
  setLoginFeedback("");

  const username = document.getElementById("admin-username").value.trim();
  const password = document.getElementById("admin-password").value.trim();
  if (!username || !password) {
    setLoginFeedback("请填写账号和密码。", true);
    return;
  }

  try {
    const result = await apiJson("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    setLoginFeedback(result.message || "登录成功。");
    togglePanels(true);
    await loadComments();
  } catch (error) {
    setLoginFeedback(error.message || "登录失败。", true);
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
    setLoginFeedback("已退出登录。");
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
          setAdminFeedback("回复内容不能为空。", true);
          return;
        }
        await sendReply(commentId, content);
        setAdminFeedback("回复已发送。");
        await loadComments();
        return;
      }

      if (action === "delete") {
        await deleteComment(commentId);
        setAdminFeedback("留言已删除。");
        await loadComments();
        return;
      }

      if (action === "status") {
        const status = target.dataset.status;
        await updateStatus(commentId, status);
        setAdminFeedback(`已更新状态为 ${status}。`);
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

  try {
    await loadComments();
    togglePanels(true);
  } catch (error) {
    if (error.status === 401) {
      togglePanels(false);
      return;
    }
    setLoginFeedback("后台暂不可用，请稍后重试。", true);
  }
}

bootstrap();
