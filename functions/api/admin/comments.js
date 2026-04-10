import { requireAdminSession } from "../../_lib/admin-auth.js";
import {
  buildAvatarUrl,
  clampInt,
  getDb,
  isValidStatus,
  json,
  normalizePageKey,
  nowIso,
  parseJson,
  sanitizeMultiLine,
  sanitizeSingleLine,
} from "../../_lib/comments-utils.js";

function parseCommentId(value) {
  const id = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }
  return id;
}

async function ensureAdmin(context) {
  const db = getDb(context.env);
  const auth = await requireAdminSession({ db, request: context.request });
  if (!auth.ok) {
    return { db, failedResponse: auth.response };
  }
  return { db, failedResponse: null };
}

export async function onRequestGet(context) {
  try {
    const { request } = context;
    const { db, failedResponse } = await ensureAdmin(context);
    if (failedResponse) {
      return failedResponse;
    }

    const url = new URL(request.url);
    const status = sanitizeSingleLine(url.searchParams.get("status") || "all", 16).toLowerCase();
    const pageKeyInput = sanitizeSingleLine(url.searchParams.get("page_key") || "", 64);
    const pageKey = pageKeyInput ? normalizePageKey(pageKeyInput) : "";
    const limit = clampInt(url.searchParams.get("limit"), 1, 200, 80);
    const offset = clampInt(url.searchParams.get("offset"), 0, 10000, 0);

    const where = [];
    const binds = [];
    if (status !== "all") {
      if (!isValidStatus(status)) {
        return json({ ok: false, message: "Invalid status parameter." }, 400);
      }
      where.push("c.status = ?");
      binds.push(status);
    }
    if (pageKey) {
      where.push("c.page_key = ?");
      binds.push(pageKey);
    }

    const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const sql = `
      SELECT
        c.id,
        c.page_key,
        c.parent_id,
        c.nickname,
        c.contact,
        c.content,
        c.status,
        c.is_admin,
        c.created_at,
        c.updated_at,
        p.nickname AS parent_nickname
      FROM comments c
      LEFT JOIN comments p ON p.id = c.parent_id
      ${whereClause}
      ORDER BY datetime(c.created_at) DESC
      LIMIT ? OFFSET ?
    `;

    const list = await db
      .prepare(sql)
      .bind(...binds, limit, offset)
      .all();

    const countRow = await db.prepare(`SELECT COUNT(*) AS total FROM comments c ${whereClause}`).bind(...binds).first();

    return json({
      ok: true,
      total: Number(countRow?.total || 0),
      items: (list.results || []).map((row) => ({
        ...row,
        id: Number(row.id),
        parent_id: row.parent_id === null ? null : Number(row.parent_id),
        is_admin: Number(row.is_admin) === 1,
        avatar_url:
          Number(row.is_admin) === 1
            ? context.env.ADMIN_AVATAR_URL || "/assets/images/Profile.png"
            : buildAvatarUrl(row.contact || "", {
                defaultAvatarUrl: context.env.DEFAULT_AVATAR_URL || "/assets/images/avatar-default.svg",
                qqAvatarBaseUrl: context.env.QQ_AVATAR_BASE_URL || "https://q1.qlogo.cn/g",
                emailAvatarBaseUrl: context.env.EMAIL_AVATAR_BASE_URL || "https://cravatar.cn/avatar",
                gravatarDefault: context.env.GRAVATAR_DEFAULT_MODE || "identicon",
                avatarSize: clampInt(context.env.PUBLIC_AVATAR_SIZE, 40, 512, 120),
              }),
      })),
    });
  } catch (error) {
    return json({ ok: false, message: error.message || "Failed to load comments." }, 500);
  }
}

export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const { db, failedResponse } = await ensureAdmin(context);
    if (failedResponse) {
      return failedResponse;
    }

    const payload = await parseJson(request);
    if (!payload) {
      return json({ ok: false, message: "Invalid JSON body." }, 400);
    }

    const parentId = parseCommentId(payload.parent_id);
    const content = sanitizeMultiLine(payload.content, 2000);
    const nickname = sanitizeSingleLine(payload.nickname || env.ADMIN_DISPLAY_NAME || "Admin", 24);

    if (!parentId) {
      return json({ ok: false, message: "parent_id is required for reply." }, 400);
    }
    if (!content) {
      return json({ ok: false, message: "Reply content is required." }, 400);
    }

    const parent = await db
      .prepare("SELECT id, page_key FROM comments WHERE id = ? LIMIT 1")
      .bind(parentId)
      .first();
    if (!parent) {
      return json({ ok: false, message: "Parent comment not found." }, 404);
    }

    const pageKey = normalizePageKey(payload.page_key || parent.page_key || "guestbook");
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
          VALUES (?, ?, ?, 'admin', ?, 'approved', 1, NULL, ?, ?, ?)
        `,
      )
      .bind(pageKey, parentId, nickname, content, sanitizeSingleLine(request.headers.get("user-agent") || "", 280), now, now)
      .run();

    return json(
      {
        ok: true,
        id: Number(result.meta?.last_row_id || 0),
        message: "Admin reply has been published.",
      },
      201,
    );
  } catch (error) {
    return json({ ok: false, message: error.message || "Failed to send admin reply." }, 500);
  }
}

export async function onRequestPatch(context) {
  try {
    const { request } = context;
    const { db, failedResponse } = await ensureAdmin(context);
    if (failedResponse) {
      return failedResponse;
    }

    const payload = await parseJson(request);
    if (!payload) {
      return json({ ok: false, message: "Invalid JSON body." }, 400);
    }

    const commentId = parseCommentId(payload.id);
    const status = sanitizeSingleLine(payload.status, 16).toLowerCase();
    if (!commentId) {
      return json({ ok: false, message: "Valid comment id is required." }, 400);
    }
    if (!isValidStatus(status)) {
      return json({ ok: false, message: "Invalid status value." }, 400);
    }

    const now = nowIso();
    const result = await db
      .prepare("UPDATE comments SET status = ?, updated_at = ? WHERE id = ?")
      .bind(status, now, commentId)
      .run();

    if (!result.meta?.changes) {
      return json({ ok: false, message: "Comment not found or unchanged." }, 404);
    }

    return json({ ok: true, message: "Status updated." });
  } catch (error) {
    return json({ ok: false, message: error.message || "Failed to update status." }, 500);
  }
}

export async function onRequestDelete(context) {
  try {
    const { request } = context;
    const { db, failedResponse } = await ensureAdmin(context);
    if (failedResponse) {
      return failedResponse;
    }

    const url = new URL(request.url);
    let commentId = parseCommentId(url.searchParams.get("id"));
    if (!commentId) {
      const payload = await parseJson(request);
      commentId = parseCommentId(payload?.id);
    }

    if (!commentId) {
      return json({ ok: false, message: "Valid comment id is required." }, 400);
    }

    const now = nowIso();
    const result = await db
      .prepare("UPDATE comments SET status = 'deleted', updated_at = ? WHERE id = ?")
      .bind(now, commentId)
      .run();

    if (!result.meta?.changes) {
      return json({ ok: false, message: "Comment not found or already deleted." }, 404);
    }

    return json({ ok: true, message: "Comment deleted." });
  } catch (error) {
    return json({ ok: false, message: error.message || "Failed to delete comment." }, 500);
  }
}
