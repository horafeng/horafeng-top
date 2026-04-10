import { hashIp, json, nowIso, sha256Hex } from "./comments-utils.js";

export const ADMIN_COOKIE_NAME = "hf_admin_session";

function parseCookies(cookieHeader) {
  const cookies = new Map();
  if (!cookieHeader) {
    return cookies;
  }

  cookieHeader.split(";").forEach((chunk) => {
    const [rawName, ...rawValue] = chunk.trim().split("=");
    if (!rawName) {
      return;
    }
    try {
      cookies.set(rawName, decodeURIComponent(rawValue.join("=") || ""));
    } catch {
      cookies.set(rawName, rawValue.join("=") || "");
    }
  });

  return cookies;
}

function randomToken(size = 32) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return [...bytes].map((item) => item.toString(16).padStart(2, "0")).join("");
}

export function buildSessionCookie(request, token, maxAgeSeconds) {
  const secure = new URL(request.url).protocol === "https:";
  const parts = [
    `${ADMIN_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.max(60, maxAgeSeconds)}`,
  ];

  if (secure) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

export function buildClearCookie(request) {
  const secure = new URL(request.url).protocol === "https:";
  const parts = [`${ADMIN_COOKIE_NAME}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (secure) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

export async function cleanupExpiredSessions(db) {
  await db.prepare("DELETE FROM admin_sessions WHERE expires_at <= ?").bind(nowIso()).run();
}

export async function createAdminSession({ db, request, env, ttlHours = 72 }) {
  const token = randomToken(36);
  const tokenHash = await sha256Hex(token);
  const ttl = Math.max(1, ttlHours);
  const expiresAt = new Date(Date.now() + ttl * 60 * 60 * 1000).toISOString();
  const ipHash = await hashIp(
    request.headers.get("CF-Connecting-IP") || request.headers.get("x-forwarded-for") || "0.0.0.0",
    env.IP_HASH_SALT || "hf-ip-salt",
  );

  await db
    .prepare(
      "INSERT INTO admin_sessions (token_hash, ip_hash, user_agent, created_at, expires_at) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(
      tokenHash,
      ipHash,
      (request.headers.get("user-agent") || "").slice(0, 280),
      nowIso(),
      expiresAt,
    )
    .run();

  return {
    token,
    maxAgeSeconds: ttl * 60 * 60,
    expiresAt,
  };
}

export async function deleteAdminSession({ db, request }) {
  const cookie = request.headers.get("cookie") || "";
  const token = parseCookies(cookie).get(ADMIN_COOKIE_NAME);
  if (!token) {
    return;
  }

  const tokenHash = await sha256Hex(token);
  await db.prepare("DELETE FROM admin_sessions WHERE token_hash = ?").bind(tokenHash).run();
}

export async function getAdminSession({ db, request }) {
  const cookie = request.headers.get("cookie") || "";
  const token = parseCookies(cookie).get(ADMIN_COOKIE_NAME);
  if (!token) {
    return null;
  }

  const tokenHash = await sha256Hex(token);
  const session = await db
    .prepare("SELECT id, token_hash, created_at, expires_at FROM admin_sessions WHERE token_hash = ? LIMIT 1")
    .bind(tokenHash)
    .first();

  if (!session) {
    return null;
  }

  if (new Date(session.expires_at).getTime() <= Date.now()) {
    await db.prepare("DELETE FROM admin_sessions WHERE token_hash = ?").bind(tokenHash).run();
    return null;
  }

  return session;
}

export async function requireAdminSession({ db, request }) {
  const session = await getAdminSession({ db, request });
  if (!session) {
    return {
      ok: false,
      response: json({ ok: false, error: "UNAUTHORIZED", message: "管理员会话已失效，请重新登录。" }, 401),
    };
  }

  return { ok: true, session };
}
