const COMMENT_STATUSES = new Set(["pending", "approved", "deleted", "spam"]);
const textEncoder = new TextEncoder();

const DEFAULT_AVATAR_URL = "/assets/images/avatar-default.svg";
const DEFAULT_QQ_AVATAR_BASE_URL = "https://q1.qlogo.cn/g";

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

export function parseContact(contact) {
  const value = sanitizeSingleLine(contact, 120);
  if (!value) {
    return { ok: false, reason: "Contact is required.", type: "unknown", value: "" };
  }

  const normalizedEmail = value.toLowerCase();
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (emailPattern.test(normalizedEmail)) {
    return { ok: true, type: "email", value: normalizedEmail };
  }

  const qqPattern = /^[1-9][0-9]{4,11}$/;
  if (qqPattern.test(value)) {
    return { ok: true, type: "qq", value };
  }

  return { ok: false, reason: "Contact must be a valid email address or QQ number.", type: "unknown", value };
}

export function validateContact(contact) {
  const parsed = parseContact(contact);
  if (!parsed.ok) {
    return parsed;
  }
  return { ok: true, value: parsed.value, type: parsed.type };
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

function getDefaultAvatarUrl(options = {}) {
  const fallback = sanitizeSingleLine(options.defaultAvatarUrl || DEFAULT_AVATAR_URL, 300);
  return fallback || DEFAULT_AVATAR_URL;
}

function leftRotate(x, c) {
  return (x << c) | (x >>> (32 - c));
}

function toHexLE(num) {
  let output = "";
  for (let i = 0; i < 4; i += 1) {
    output += ((num >>> (8 * i)) & 0xff).toString(16).padStart(2, "0");
  }
  return output;
}

function md5Hex(input) {
  const bytes = textEncoder.encode(input);
  const originalBitLen = bytes.length * 8;
  const withPaddingLen = (((bytes.length + 8) >> 6) + 1) << 6;
  const buffer = new Uint8Array(withPaddingLen);
  buffer.set(bytes);
  buffer[bytes.length] = 0x80;

  const bitLenLow = originalBitLen >>> 0;
  const bitLenHigh = Math.floor(originalBitLen / 0x100000000);
  const dataView = new DataView(buffer.buffer);
  dataView.setUint32(withPaddingLen - 8, bitLenLow, true);
  dataView.setUint32(withPaddingLen - 4, bitLenHigh, true);

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  const s = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9,
    14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15,
    21, 6, 10, 15, 21,
  ];

  const k = new Array(64).fill(0).map((_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0);

  for (let offset = 0; offset < withPaddingLen; offset += 64) {
    const m = new Array(16);
    for (let i = 0; i < 16; i += 1) {
      m[i] = dataView.getUint32(offset + i * 4, true);
    }

    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;

    for (let i = 0; i < 64; i += 1) {
      let f;
      let g;

      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) % 16;
      }

      const temp = d;
      d = c;
      c = b;
      const sum = (a + f + k[i] + m[g]) >>> 0;
      b = (b + leftRotate(sum, s[i])) >>> 0;
      a = temp;
    }

    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }

  return `${toHexLE(a0)}${toHexLE(b0)}${toHexLE(c0)}${toHexLE(d0)}`;
}

function buildGravatarUrl(email, options = {}) {
  const normalized = sanitizeSingleLine(email, 160).toLowerCase();
  if (!normalized) {
    return getDefaultAvatarUrl(options);
  }

  const hash = md5Hex(normalized);
  const size = clampInt(options.avatarSize, 40, 512, 120);
  const defaultMode = sanitizeSingleLine(options.gravatarDefault || "404", 80) || "404";
  return `https://www.gravatar.com/avatar/${hash}?s=${size}&d=${encodeURIComponent(defaultMode)}`;
}

function buildQqAvatarUrl(qq, options = {}) {
  const value = sanitizeSingleLine(qq, 20);
  if (!/^[1-9][0-9]{4,11}$/.test(value)) {
    return getDefaultAvatarUrl(options);
  }

  const base = sanitizeSingleLine(options.qqAvatarBaseUrl || DEFAULT_QQ_AVATAR_BASE_URL, 180) || DEFAULT_QQ_AVATAR_BASE_URL;
  const size = clampInt(options.avatarSize, 40, 640, 140);
  return `${base}?b=qq&nk=${encodeURIComponent(value)}&s=${size}`;
}

export function buildAvatarUrl(contact, options = {}) {
  const parsed = parseContact(contact);
  if (!parsed.ok) {
    return getDefaultAvatarUrl(options);
  }

  if (parsed.type === "email") {
    return buildGravatarUrl(parsed.value, options);
  }

  if (parsed.type === "qq") {
    return buildQqAvatarUrl(parsed.value, options);
  }

  return getDefaultAvatarUrl(options);
}

function mapCommentRow(row, options = {}) {
  const includeContact = options.includeContact === true;
  const avatarOptions = {
    defaultAvatarUrl: options.defaultAvatarUrl,
    qqAvatarBaseUrl: options.qqAvatarBaseUrl,
    gravatarDefault: options.gravatarDefault,
    avatarSize: options.avatarSize,
  };

  const avatarUrl =
    sanitizeSingleLine(row.avatar_url, 320) ||
    buildAvatarUrl(row.contact || "", avatarOptions) ||
    getDefaultAvatarUrl(avatarOptions);

  return {
    id: Number(row.id),
    page_key: row.page_key,
    parent_id: row.parent_id === null || row.parent_id === undefined ? null : Number(row.parent_id),
    nickname: row.nickname,
    content: row.content,
    status: row.status,
    is_admin: Number(row.is_admin) === 1,
    avatar_url: avatarUrl,
    created_at: row.created_at,
    updated_at: row.updated_at,
    ...(includeContact ? { contact: row.contact || "" } : {}),
    children: [],
  };
}

export function buildCommentTree(rows, options = {}) {
  const map = new Map();
  const roots = [];

  rows.forEach((row) => {
    map.set(Number(row.id), mapCommentRow(row, options));
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
