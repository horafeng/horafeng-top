import { escapeHtml } from "./common.js?v=f6e0c5dd3d";

const STORAGE_KEY = "hf-pending-comments-v1";
const IDENTITY_KEY = "hf-comment-identity-v1";

function readAllPending() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = JSON.parse(raw || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeAllPending(data) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore storage failures
  }
}

export function getPendingComments(pageKey) {
  const all = readAllPending();
  const list = Array.isArray(all[pageKey]) ? all[pageKey] : [];
  return list
    .filter((item) => item && typeof item === "object" && String(item.id || "").trim())
    .sort((a, b) => (Date.parse(b.created_at || "") || 0) - (Date.parse(a.created_at || "") || 0));
}

export function savePendingComment(pageKey, comment) {
  const key = String(pageKey || "").trim();
  if (!key || !comment?.id) {
    return;
  }

  const all = readAllPending();
  const current = Array.isArray(all[key]) ? all[key] : [];
  const next = [
    comment,
    ...current.filter((item) => String(item.id) !== String(comment.id)),
  ].slice(0, 20);
  all[key] = next;
  writeAllPending(all);
}

export function removePendingComments(pageKey, ids = []) {
  const key = String(pageKey || "").trim();
  if (!key) {
    return;
  }

  const idSet = new Set(ids.map((item) => String(item)));
  const all = readAllPending();
  const current = Array.isArray(all[key]) ? all[key] : [];
  all[key] = current.filter((item) => !idSet.has(String(item.id)));
  writeAllPending(all);
}

function collectIds(nodes = [], bucket = new Set()) {
  nodes.forEach((node) => {
    if (!node) {
      return;
    }
    if (node.id !== undefined && node.id !== null) {
      bucket.add(String(node.id));
    }
    if (Array.isArray(node.children) && node.children.length) {
      collectIds(node.children, bucket);
    }
  });
  return bucket;
}

export function reconcilePendingComments(pageKey, approvedItems = []) {
  const approvedIds = [...collectIds(approvedItems)];
  if (!approvedIds.length) {
    return;
  }
  removePendingComments(pageKey, approvedIds);
}

function ensureToast() {
  let toast = document.getElementById("global-comment-toast");
  if (toast) {
    return toast;
  }

  toast = document.createElement("div");
  toast.id = "global-comment-toast";
  toast.className = "global-comment-toast";
  toast.hidden = true;
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");
  toast.innerHTML = `
    <div class="global-comment-toast-card">
      <span class="global-comment-toast-check" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M5 12.5L10 17L19 7.5"></path>
        </svg>
      </span>
      <p id="global-comment-toast-text"></p>
    </div>
  `;
  document.body.appendChild(toast);
  return toast;
}

let toastHideTimer = null;
let toastDoneTimer = null;

export function showCommentSuccessToast(message = "\u8bc4\u8bba\u6210\u529f\uff01\u5ba1\u6838\u540e\u5c55\u73b0") {
  const toast = ensureToast();
  const text = toast.querySelector("#global-comment-toast-text");
  if (text) {
    text.textContent = message;
  }

  if (toastHideTimer) {
    window.clearTimeout(toastHideTimer);
  }
  if (toastDoneTimer) {
    window.clearTimeout(toastDoneTimer);
  }

  toast.hidden = false;
  toast.classList.remove("show", "hide", "done");
  void toast.offsetWidth;
  toast.classList.add("show");

  toastDoneTimer = window.setTimeout(() => {
    toast.classList.add("done");
  }, 60);

  toastHideTimer = window.setTimeout(() => {
    toast.classList.add("hide");
    toast.classList.remove("show");
  }, 1500);

  window.setTimeout(() => {
    toast.hidden = true;
    toast.classList.remove("hide", "done");
  }, 2050);
}

export function normalizePendingComment(comment = {}) {
  return {
    id: String(comment.id || ""),
    page_key: String(comment.page_key || ""),
    parent_id: comment.parent_id === null || comment.parent_id === undefined ? null : Number(comment.parent_id),
    nickname: String(comment.nickname || "\u8bbf\u5ba2"),
    content: String(comment.content || ""),
    status: "pending",
    is_admin: false,
    avatar_url: String(comment.avatar_url || "/assets/images/avatar-default.svg"),
    created_at: comment.created_at || new Date().toISOString(),
    updated_at: comment.updated_at || new Date().toISOString(),
    children: [],
    is_pending_local: true,
    pending_label: "\u5f85\u5ba1\u6838\uff0c\u4ec5\u81ea\u5df1\u53ef\u89c1",
  };
}

export function renderPendingBadge(label = "\u5f85\u5ba1\u6838\uff0c\u4ec5\u81ea\u5df1\u53ef\u89c1") {
  return `<span class="comment-pending-badge">${escapeHtml(label)}</span>`;
}

export function getStoredCommentIdentity() {
  try {
    const raw = window.localStorage.getItem(IDENTITY_KEY);
    const parsed = JSON.parse(raw || "{}");
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const nickname = String(parsed.nickname || "").trim();
    const contact = String(parsed.contact || "").trim();
    if (!nickname || !contact) {
      return null;
    }

    return {
      nickname,
      contact,
      notify_enabled: parsed.notify_enabled !== false,
      verified_at: String(parsed.verified_at || ""),
    };
  } catch {
    return null;
  }
}

export function saveCommentIdentity(identity = {}) {
  const nickname = String(identity.nickname || "").trim();
  const contact = String(identity.contact || "").trim();
  if (!nickname || !contact) {
    return;
  }

  try {
    window.localStorage.setItem(
      IDENTITY_KEY,
      JSON.stringify({
        nickname,
        contact,
        notify_enabled: identity.notify_enabled !== false,
        verified_at: identity.verified_at || new Date().toISOString(),
      }),
    );
  } catch {
    // ignore storage failures
  }
}

export function clearCommentIdentity() {
  try {
    window.localStorage.removeItem(IDENTITY_KEY);
  } catch {
    // ignore storage failures
  }
}
