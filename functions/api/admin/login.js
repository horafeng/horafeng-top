import { buildSessionCookie, cleanupExpiredSessions, createAdminSession } from "../../_lib/admin-auth.js";
import {
  clampInt,
  enforceRateLimit,
  getDb,
  getRequestIp,
  hashIp,
  json,
  parseJson,
  sanitizeSingleLine,
} from "../../_lib/comments-utils.js";

export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const db = getDb(env);
    const payload = await parseJson(request);
    if (!payload) {
      return json({ ok: false, message: "Invalid JSON body." }, 400);
    }

    const username = sanitizeSingleLine(payload.username, 48);
    const password = sanitizeSingleLine(payload.password, 128);
    const expectedUser = sanitizeSingleLine(env.ADMIN_USERNAME || "admin", 48);
    const expectedPassword = env.ADMIN_PASSWORD || "";

    if (!expectedPassword) {
      return json({ ok: false, message: "ADMIN_PASSWORD is not configured." }, 500);
    }

    const ip = getRequestIp(request);
    const ipHash = await hashIp(ip, env.IP_HASH_SALT || "hf-ip-salt");
    const limiter = await enforceRateLimit(
      db,
      `admin-login:${ipHash}`,
      clampInt(env.ADMIN_LOGIN_RATE_LIMIT_PER_MINUTE, 1, 50, 8),
    );
    if (!limiter.allowed) {
      return json({ ok: false, message: "Too many login attempts, please try later." }, 429);
    }

    if (!username || !password || username !== expectedUser || password !== expectedPassword) {
      return json({ ok: false, message: "Invalid username or password." }, 401);
    }

    await cleanupExpiredSessions(db);
    const session = await createAdminSession({
      db,
      request,
      env,
      ttlHours: clampInt(env.ADMIN_SESSION_TTL_HOURS, 1, 24 * 30, 72),
    });

    return json(
      {
        ok: true,
        message: "Login successful.",
        username: expectedUser,
        expires_at: session.expiresAt,
      },
      200,
      {
        "set-cookie": buildSessionCookie(request, session.token, session.maxAgeSeconds),
      },
    );
  } catch (error) {
    return json({ ok: false, message: error.message || "Login failed." }, 500);
  }
}
