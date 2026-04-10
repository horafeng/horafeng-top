import { clampInt, getDb, md5Hex, parseContact, sanitizeSingleLine } from "../../_lib/comments-utils.js";

const DEFAULT_AVATAR_POOL = [
  "/assets/images/avatar-default-1.svg",
  "/assets/images/avatar-default-2.svg",
  "/assets/images/avatar-default-3.svg",
  "/assets/images/avatar-default-4.svg",
  "/assets/images/avatar-default-5.svg",
  "/assets/images/avatar-default-6.svg",
];

const REMOTE_TIMEOUT_MS = 2800;
const CACHE_SECONDS = 60 * 60 * 24 * 7;

function parseCommentId(raw) {
  const value = Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isInteger(value) || value <= 0) {
    return null;
  }
  return value;
}

function pickDefaultAvatar(seed) {
  const hash = md5Hex(String(seed || "guest"));
  const slot = Number.parseInt(hash.slice(0, 8), 16);
  return DEFAULT_AVATAR_POOL[slot % DEFAULT_AVATAR_POOL.length];
}

function buildEmailCandidates(contact, env, size) {
  const normalized = sanitizeSingleLine(contact, 160).toLowerCase();
  if (!normalized) {
    return [];
  }

  const hash = md5Hex(normalized);
  const d = encodeURIComponent("404");
  const preferredBase = (
    sanitizeSingleLine(env.EMAIL_AVATAR_BASE_URL || "https://cravatar.cn/avatar", 220) || "https://cravatar.cn/avatar"
  ).replace(/\/+$/, "");

  const list = [];
  if (preferredBase.includes("{hash}")) {
    list.push(`${preferredBase.replace("{hash}", hash)}?s=${size}&d=${d}`);
  } else {
    list.push(`${preferredBase}/${hash}?s=${size}&d=${d}`);
  }

  list.push(`https://cravatar.cn/avatar/${hash}?s=${size}&d=${d}`);
  list.push(`https://www.gravatar.com/avatar/${hash}?s=${size}&d=${d}`);
  list.push(`https://secure.gravatar.com/avatar/${hash}?s=${size}&d=${d}`);

  // QQ mailbox like 123456@qq.com can often map to QQ avatar directly.
  const qqMailbox = normalized.match(/^([1-9][0-9]{4,11})@qq\.com$/);
  if (qqMailbox?.[1]) {
    const qq = qqMailbox[1];
    list.unshift(`https://q1.qlogo.cn/g?b=qq&nk=${encodeURIComponent(qq)}&s=${size}`);
    list.unshift(`https://q.qlogo.cn/headimg_dl?dst_uin=${encodeURIComponent(qq)}&spec=${size}&img_type=jpg`);
  }

  return [...new Set(list)];
}

function buildQqCandidates(contact, env, size) {
  const qq = sanitizeSingleLine(contact, 20).replace(/\D/g, "");
  if (!/^[1-9][0-9]{4,11}$/.test(qq)) {
    return [];
  }

  const configuredBase = sanitizeSingleLine(env.QQ_AVATAR_BASE_URL || "https://q1.qlogo.cn/g", 220) || "https://q1.qlogo.cn/g";
  const urls = [];

  if (configuredBase.includes("{qq}")) {
    urls.push(configuredBase.replace("{qq}", encodeURIComponent(qq)).replace("{size}", String(size)));
  } else if (configuredBase.includes("headimg_dl")) {
    urls.push(`${configuredBase}?dst_uin=${encodeURIComponent(qq)}&spec=${size}&img_type=jpg`);
  } else {
    urls.push(`${configuredBase}?b=qq&nk=${encodeURIComponent(qq)}&s=${size}`);
  }

  urls.push(`https://q1.qlogo.cn/g?b=qq&nk=${encodeURIComponent(qq)}&s=${size}`);
  urls.push(`https://q.qlogo.cn/headimg_dl?dst_uin=${encodeURIComponent(qq)}&spec=${size}&img_type=jpg`);
  return [...new Set(urls)];
}

async function fetchImageFromUrl(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("timeout"), REMOTE_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      cf: { cacheEverything: true, cacheTtl: CACHE_SECONDS },
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; HoraFengAvatarBot/1.0)",
      },
    });

    if (!response.ok) {
      return null;
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.toLowerCase().startsWith("image/")) {
      return null;
    }

    return new Response(response.body, {
      status: 200,
      headers: {
        "content-type": contentType,
        "cache-control": `public, max-age=${CACHE_SECONDS}, s-maxage=${CACHE_SECONDS}`,
      },
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchLocalImage(request, path) {
  const target = new URL(path, request.url).toString();
  const response = await fetch(target, { cf: { cacheEverything: true, cacheTtl: CACHE_SECONDS } });
  if (!response.ok) {
    return new Response("", { status: 404 });
  }

  return new Response(response.body, {
    status: 200,
    headers: {
      "content-type": response.headers.get("content-type") || "image/svg+xml; charset=utf-8",
      "cache-control": `public, max-age=${CACHE_SECONDS}, s-maxage=${CACHE_SECONDS}`,
    },
  });
}

export async function onRequestGet(context) {
  const commentId = parseCommentId(context.params?.id);
  if (!commentId) {
    return new Response("Invalid avatar id.", { status: 400 });
  }

  const db = getDb(context.env);
  const row = await db
    .prepare("SELECT id, nickname, contact, is_admin, status, created_at, updated_at FROM comments WHERE id = ? LIMIT 1")
    .bind(commentId)
    .first();

  if (!row || row.status !== "approved") {
    return fetchLocalImage(context.request, pickDefaultAvatar(`missing:${commentId}`));
  }

  const isAdmin = Number(row.is_admin) === 1;
  if (isAdmin) {
    const adminAvatar = sanitizeSingleLine(context.env.ADMIN_AVATAR_URL || "/assets/images/Profile.png", 300) || "/assets/images/Profile.png";
    return fetchLocalImage(context.request, adminAvatar);
  }

  const size = clampInt(context.env.PUBLIC_AVATAR_SIZE, 40, 512, 120);
  const parsed = parseContact(row.contact || "");
  let candidates = [];

  if (parsed.ok && parsed.type === "qq") {
    candidates = buildQqCandidates(parsed.value, context.env, size);
  } else if (parsed.ok && parsed.type === "email") {
    candidates = buildEmailCandidates(parsed.value, context.env, size);
  }

  for (const url of candidates) {
    const image = await fetchImageFromUrl(url);
    if (image) {
      return image;
    }
  }

  const fallbackPath = pickDefaultAvatar(`${row.nickname || "guest"}:${row.id}:${row.updated_at || row.created_at || ""}`);
  return fetchLocalImage(context.request, fallbackPath);
}
