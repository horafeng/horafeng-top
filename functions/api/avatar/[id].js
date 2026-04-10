import { clampInt, getDb, md5Hex, parseContact, sanitizeSingleLine, sha256Hex } from "../../_lib/comments-utils.js";

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

function addDebugHeaders(headers, debugInfo) {
  headers.set("x-avatar-contact-type", debugInfo.contact_type || "unknown");
  headers.set("x-avatar-qq-as-email", debugInfo.qq_as_email ? "1" : "0");
  headers.set("x-avatar-source", debugInfo.source || "default");
  headers.set("x-avatar-url", debugInfo.avatar_url || "");
}

function responseWithHeaders(response, debugInfo) {
  const headers = new Headers(response.headers);
  addDebugHeaders(headers, debugInfo);
  return new Response(response.body, { status: response.status, headers });
}

async function fetchImageFromUrl(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("timeout"), REMOTE_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      cf: { cacheEverything: true, cacheTtl: CACHE_SECONDS },
      headers: { "user-agent": "Mozilla/5.0 (compatible; HoraFengAvatarBot/1.1)" },
    });

    if (!response.ok) {
      return null;
    }

    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    if (!contentType.startsWith("image/")) {
      return null;
    }

    return new Response(response.body, {
      status: 200,
      headers: {
        "content-type": response.headers.get("content-type") || "image/jpeg",
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

function buildCravatarUrl(hash, size, env) {
  const rawBase = sanitizeSingleLine(env.EMAIL_AVATAR_BASE_URL || "https://cravatar.cn/avatar", 220) || "https://cravatar.cn/avatar";
  const base = rawBase.replace(/\/+$/, "");
  if (base.includes("{hash}")) {
    return `${base.replace("{hash}", hash)}?s=${size}&d=404`;
  }
  return `${base}/${hash}?s=${size}&d=404`;
}

function buildGravatarSha256Url(hash, size) {
  return `https://www.gravatar.com/avatar/${hash}?s=${size}&d=404`;
}

function buildQqFallbackUrls(qq, size, env) {
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

async function resolveAvatar(row, env) {
  const size = clampInt(env.PUBLIC_AVATAR_SIZE, 40, 512, 120);
  const parsed = parseContact(row.contact || "");
  const debugInfo = {
    contact_type: parsed.ok ? parsed.type : "unknown",
    qq_as_email: false,
    source: "default",
    avatar_url: "",
  };

  if (!parsed.ok) {
    return { debugInfo };
  }

  const attempts = [];
  if (parsed.type === "qq") {
    const qq = parsed.value.replace(/\D/g, "");
    const qqEmail = `${qq}@qq.com`;
    const qqEmailMd5 = md5Hex(qqEmail);
    debugInfo.qq_as_email = true;
    attempts.push({ source: "qq_email_cravatar", url: buildCravatarUrl(qqEmailMd5, size, env) });

    const qqFallbacks = buildQqFallbackUrls(qq, size, env);
    qqFallbacks.forEach((url) => attempts.push({ source: "qq_fallback_source", url }));
  } else if (parsed.type === "email") {
    const email = parsed.value.toLowerCase();
    const emailMd5 = md5Hex(email);
    const emailSha256 = await sha256Hex(email);
    attempts.push({ source: "email_cravatar", url: buildCravatarUrl(emailMd5, size, env) });
    attempts.push({ source: "email_gravatar", url: buildGravatarSha256Url(emailSha256, size) });
  }

  for (const attempt of attempts) {
    const image = await fetchImageFromUrl(attempt.url);
    if (image) {
      debugInfo.source = attempt.source;
      debugInfo.avatar_url = attempt.url;
      return { response: image, debugInfo };
    }
  }

  return { debugInfo };
}

export async function onRequestGet(context) {
  const commentId = parseCommentId(context.params?.id);
  if (!commentId) {
    return new Response("Invalid avatar id.", { status: 400 });
  }

  const debugMode = context.request.url.includes("debug=1");
  const db = getDb(context.env);
  const row = await db
    .prepare("SELECT id, nickname, contact, is_admin, status, created_at, updated_at FROM comments WHERE id = ? LIMIT 1")
    .bind(commentId)
    .first();

  const defaultPath = pickDefaultAvatar(`missing:${commentId}`);
  const defaultDebug = {
    contact_type: "unknown",
    qq_as_email: false,
    source: "default",
    avatar_url: new URL(defaultPath, context.request.url).toString(),
  };

  if (!row || row.status !== "approved") {
    if (debugMode) {
      return new Response(JSON.stringify({ ok: true, ...defaultDebug }, null, 2), {
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
      });
    }
    const fallback = await fetchLocalImage(context.request, defaultPath);
    return responseWithHeaders(fallback, defaultDebug);
  }

  if (Number(row.is_admin) === 1) {
    const adminPath = sanitizeSingleLine(context.env.ADMIN_AVATAR_URL || "/assets/images/Profile.png", 300) || "/assets/images/Profile.png";
    const debugInfo = {
      contact_type: "admin",
      qq_as_email: false,
      source: "admin_profile",
      avatar_url: new URL(adminPath, context.request.url).toString(),
    };

    if (debugMode) {
      return new Response(JSON.stringify({ ok: true, ...debugInfo }, null, 2), {
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
      });
    }

    const adminAvatar = await fetchLocalImage(context.request, adminPath);
    return responseWithHeaders(adminAvatar, debugInfo);
  }

  const resolved = await resolveAvatar(row, context.env);
  if (resolved.response) {
    if (debugMode) {
      return new Response(JSON.stringify({ ok: true, ...resolved.debugInfo }, null, 2), {
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
      });
    }
    return responseWithHeaders(resolved.response, resolved.debugInfo);
  }

  const fallbackPath = pickDefaultAvatar(`${row.nickname || "guest"}:${row.id}:${row.updated_at || row.created_at || ""}`);
  const fallbackDebug = {
    ...resolved.debugInfo,
    source: "default",
    avatar_url: new URL(fallbackPath, context.request.url).toString(),
  };

  if (debugMode) {
    return new Response(JSON.stringify({ ok: true, ...fallbackDebug }, null, 2), {
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  }

  const fallback = await fetchLocalImage(context.request, fallbackPath);
  return responseWithHeaders(fallback, fallbackDebug);
}
