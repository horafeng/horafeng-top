const COMMENT_STATUSES = new Set(["pending", "approved", "deleted", "spam"]);
const textEncoder = new TextEncoder();

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });
}

export function getDb(env) {
  if (!env?.COMMENTS_DB) {
    throw new Error("D1 binding COMMENTS_DB is not configured.");
  }
  return env.COMMENTS_DB;
}

export function clampInt(value, min, max, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
}

export function normalizePageKey(value, fallback = "guestbook") {
  const raw = sanitizeSingleLine(value || fallback, 64);
  const normalized = raw.toLowerCase().replace(/[^a-z0-9:_-]/g, "-");
  return normalized || fallback;
}

export function sanitizeSingleLine(value, maxLength) {
  const compact = String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!maxLength) {
    return compact;
  }

  return compact.slice(0, maxLength);
}

export function sanitizeMultiLine(value, maxLength) {
  const cleaned = String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim();

  if (!maxLength) {
    return cleaned;
  }

  return cleaned.slice(0, maxLength);
}

export function validateContact(contact) {
  const value = sanitizeSingleLine(contact, 120);
  if (!value) {
    return { ok: false, reason: "Contact is required." };
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const qqPattern = /^[1-9][0-9]{4,11}$/;

  if (emailPattern.test(value) || qqPattern.test(value)) {
    return { ok: true, value };
  }

  return { ok: false, reason: "Contact must be a valid email address or QQ number." };
}

export function getRequestIp(request) {
  const direct = request.headers.get("CF-Connecting-IP");
  if (direct) {
    return direct;
  }

  const forwarded = request.headers.get("x-forwarded-for");
  if (!forwarded) {
    return "0.0.0.0";
  }

  return forwarded.split(",")[0].trim() || "0.0.0.0";
}

export function nowIso() {
  return new Date().toISOString();
}

export async function sha256Hex(input) {
  const buffer = await crypto.subtle.digest("SHA-256", textEncoder.encode(String(input)));
  return [...new Uint8Array(buffer)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export async function hashIp(ip, salt) {
  return sha256Hex(`${salt || "hf-ip-salt"}:${ip || "0.0.0.0"}`);
}

export async function parseJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export function isValidStatus(status) {
  return COMMENT_STATUSES.has(String(status || "").toLowerCase());
}

export function boolFromEnv(value, defaultValue = false) {
  if (value === undefined || value === null) {
    return defaultValue;
  }

  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return defaultValue;
}

export async function verifyTurnstile({ secret, token, ip, bypass = false }) {
  if (bypass) {
    return { ok: true, bypass: true };
  }

  if (!secret) {
    return { ok: false, message: "TURNSTILE_SECRET_KEY is missing on the server." };
  }

  if (!token) {
    return { ok: false, message: "Turnstile token is required." };
  }

  const body = new URLSearchParams();
  body.set("secret", secret);
  body.set("response", token);
  if (ip) {
    body.set("remoteip", ip);
  }

  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    return { ok: false, message: "Turnstile verification service is unavailable." };
  }

  const payload = await response.json();
  if (!payload.success) {
    return { ok: false, message: "Turnstile verification failed.", codes: payload["error-codes"] || [] };
  }

  return { ok: true };
}

export async function enforceRateLimit(db, limiterKey, maxPerMinute) {
  const windowStart = new Date().toISOString().slice(0, 16);
  const now = nowIso();

  const row = await db
    .prepare("SELECT window_start, request_count FROM comment_rate_limits WHERE limiter_key = ?")
    .bind(limiterKey)
    .first();

  if (!row) {
    await db
      .prepare("INSERT INTO comment_rate_limits (limiter_key, window_start, request_count, updated_at) VALUES (?, ?, 1, ?)")
      .bind(limiterKey, windowStart, now)
      .run();
    return { allowed: true, count: 1 };
  }

  const currentCount = Number(row.request_count || 0);
  if (row.window_start === windowStart) {
    if (currentCount >= maxPerMinute) {
      await db.prepare("UPDATE comment_rate_limits SET updated_at = ? WHERE limiter_key = ?").bind(now, limiterKey).run();
      return { allowed: false, count: currentCount };
    }

    const nextCount = currentCount + 1;
    await db
      .prepare("UPDATE comment_rate_limits SET request_count = ?, updated_at = ? WHERE limiter_key = ?")
      .bind(nextCount, now, limiterKey)
      .run();
    return { allowed: true, count: nextCount };
  }

  await db
    .prepare("UPDATE comment_rate_limits SET window_start = ?, request_count = 1, updated_at = ? WHERE limiter_key = ?")
    .bind(windowStart, now, limiterKey)
    .run();
  return { allowed: true, count: 1 };
}

function mapCommentRow(row, includeContact) {
  return {
    id: Number(row.id),
    page_key: row.page_key,
    parent_id: row.parent_id === null || row.parent_id === undefined ? null : Number(row.parent_id),
    nickname: row.nickname,
    content: row.content,
    status: row.status,
    is_admin: Number(row.is_admin) === 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
    ...(includeContact ? { contact: row.contact || "" } : {}),
    children: [],
  };
}

export function buildCommentTree(rows, options = {}) {
  const includeContact = options.includeContact === true;
  const map = new Map();
  const roots = [];

  rows.forEach((row) => {
    map.set(Number(row.id), mapCommentRow(row, includeContact));
  });

  map.forEach((node) => {
    if (!node.parent_id) {
      roots.push(node);
      return;
    }

    const parent = map.get(node.parent_id);
    if (!parent) {
      roots.push(node);
      return;
    }

    node.reply_to = parent.nickname;
    parent.children.push(node);
  });

  return roots;
}
