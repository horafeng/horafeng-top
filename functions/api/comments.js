import {
  boolFromEnv,
  buildCommentTree,
  clampInt,
  enforceRateLimit,
  getDb,
  getRequestIp,
  hashIp,
  json,
  normalizePageKey,
  nowIso,
  parseJson,
  sanitizeMultiLine,
  sanitizeSingleLine,
  validateContact,
  verifyTurnstile,
} from "../_lib/comments-utils.js";

function queryInt(params, key, fallback, min, max) {
  return clampInt(params.get(key), min, max, fallback);
}

export async function onRequestGet(context) {
  try {
    const { request, env } = context;
    const db = getDb(env);
    const url = new URL(request.url);
    const pageKey = normalizePageKey(url.searchParams.get("page_key") || "guestbook");
    const limit = queryInt(url.searchParams, "limit", 50, 1, 100);
    const offset = queryInt(url.searchParams, "offset", 0, 0, 5000);

    const [list, totalRow] = await Promise.all([
      db
        .prepare(
          `
            SELECT id, page_key, parent_id, nickname, content, status, is_admin, created_at, updated_at
            FROM comments
            WHERE page_key = ? AND status = 'approved'
            ORDER BY datetime(created_at) ASC
            LIMIT ? OFFSET ?
          `,
        )
        .bind(pageKey, limit, offset)
        .all(),
      db
        .prepare("SELECT COUNT(*) AS total FROM comments WHERE page_key = ? AND status = 'approved'")
        .bind(pageKey)
        .first(),
    ]);

    const rows = list.results || [];
    const items = buildCommentTree(rows, { includeContact: false });

    return json({
      ok: true,
      page_key: pageKey,
      limit,
      offset,
      total: Number(totalRow?.total || 0),
      items,
    });
  } catch (error) {
    return json({ ok: false, message: error.message || "Failed to fetch comments." }, 500);
  }
}

export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const db = getDb(env);
    const payload = await parseJson(request);
    if (!payload) {
      return json({ ok: false, message: "Invalid JSON body." }, 400);
    }

    const nickname = sanitizeSingleLine(payload.nickname, 24);
    const contactResult = validateContact(payload.contact);
    const content = sanitizeMultiLine(payload.content, 2000);
    const pageKey = normalizePageKey(payload.page_key || "guestbook");
    const parentIdRaw = payload.parent_id;
    const turnstileToken = sanitizeSingleLine(payload.turnstileToken || payload.turnstile_token, 2048);

    if (!nickname) {
      return json({ ok: false, message: "Nickname is required." }, 400);
    }
    if (!contactResult.ok) {
      return json({ ok: false, message: contactResult.reason }, 400);
    }
    if (!content) {
      return json({ ok: false, message: "Content is required." }, 400);
    }

    const parentId =
      parentIdRaw === null || parentIdRaw === undefined || parentIdRaw === ""
        ? null
        : clampInt(parentIdRaw, 1, Number.MAX_SAFE_INTEGER, -1);

    if (parentId === -1) {
      return json({ ok: false, message: "Invalid parent_id." }, 400);
    }

    if (parentId) {
      const parent = await db
        .prepare("SELECT id FROM comments WHERE id = ? AND page_key = ? LIMIT 1")
        .bind(parentId, pageKey)
        .first();
      if (!parent) {
        return json({ ok: false, message: "Parent comment does not exist." }, 400);
      }
    }

    const ip = getRequestIp(request);
    const ipHash = await hashIp(ip, env.IP_HASH_SALT || "hf-ip-salt");
    const limitPerMinute = clampInt(env.COMMENT_RATE_LIMIT_PER_MINUTE, 1, 60, 6);
    const limiter = await enforceRateLimit(db, `${pageKey}:${ipHash}`, limitPerMinute);
    if (!limiter.allowed) {
      return json({ ok: false, message: "Too many requests, please try later." }, 429);
    }

    const turnstileCheck = await verifyTurnstile({
      secret: env.TURNSTILE_SECRET_KEY,
      token: turnstileToken,
      ip,
      bypass: boolFromEnv(env.TURNSTILE_BYPASS, false),
    });
    if (!turnstileCheck.ok) {
      return json({ ok: false, message: turnstileCheck.message || "Turnstile verification failed." }, 400);
    }

    const autoApprove = boolFromEnv(env.COMMENTS_AUTO_APPROVE, true);
    const status = autoApprove ? "approved" : "pending";
    const now = nowIso();

    const result = await db
      .prepare(
        `
          INSERT INTO comments (
            page_key,
            parent_id,
            nickname,
            contact,
            content,
            status,
            is_admin,
            ip_hash,
            user_agent,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
        `,
      )
      .bind(
        pageKey,
        parentId,
        nickname,
        contactResult.value,
        content,
        status,
        ipHash,
        sanitizeSingleLine(request.headers.get("user-agent") || "", 280),
        now,
        now,
      )
      .run();

    return json(
      {
        ok: true,
        id: Number(result.meta?.last_row_id || 0),
        status,
        pending: status !== "approved",
        message: status === "approved" ? "Comment published." : "Comment submitted and waiting for moderation.",
      },
      201,
    );
  } catch (error) {
    return json({ ok: false, message: error.message || "Failed to submit comment." }, 500);
  }
}
