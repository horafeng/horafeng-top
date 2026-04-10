import { normalizePageKey, nowIso, parseContact, sanitizeMultiLine, sanitizeSingleLine } from "./comments-utils.js";
import { sendTransactionalMail } from "./mailer.js";

let cachedEntries = { at: 0, map: new Map() };

function boolToInt(value, defaultValue = true) {
  if (value === undefined || value === null) {
    return defaultValue ? 1 : 0;
  }
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return 1;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return 0;
  }
  return defaultValue ? 1 : 0;
}

export function buildUnsubscribeToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return [...bytes].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export function resolveContactEmail(contact) {
  const parsed = parseContact(contact);
  if (!parsed.ok) {
    return "";
  }
  if (parsed.type === "email") {
    return sanitizeSingleLine(parsed.value, 180).toLowerCase();
  }
  if (parsed.type === "qq") {
    return `${sanitizeSingleLine(parsed.value, 16)}@qq.com`;
  }
  return "";
}

export function buildNotifyPreference({ contact, notifyEnabledInput }) {
  const notifyEnabled = boolToInt(notifyEnabledInput, true);
  const resolvedEmail = resolveContactEmail(contact);
  const unsubscribeToken = notifyEnabled && resolvedEmail ? buildUnsubscribeToken() : null;
  return {
    notifyEnabled,
    resolvedEmail,
    unsubscribeToken,
  };
}

function escapeHtml(text) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function shorten(text, maxLen = 320) {
  return sanitizeMultiLine(text || "", maxLen);
}

function getBaseUrl(env, requestUrl) {
  const configured = sanitizeSingleLine(env.SITE_BASE_URL, 300);
  if (configured) {
    return configured.replace(/\/+$/, "");
  }
  return new URL(requestUrl).origin.replace(/\/+$/, "");
}

async function loadEntryMap(baseUrl) {
  const now = Date.now();
  if (now - cachedEntries.at < 5 * 60 * 1000 && cachedEntries.map.size > 0) {
    return cachedEntries.map;
  }

  try {
    const response = await fetch(`${baseUrl}/content/diaries.json`, {
      cf: { cacheEverything: true, cacheTtl: 300 },
    });
    if (!response.ok) {
      return cachedEntries.map;
    }

    const data = await response.json();
    const map = new Map();
    for (const entry of data?.entries || []) {
      const id = sanitizeSingleLine(entry?.id, 120);
      if (!id) {
        continue;
      }
      map.set(id, {
        id,
        title: sanitizeSingleLine(entry?.title || "日记帖子", 160) || "日记帖子",
      });
    }
    cachedEntries = { at: now, map };
    return map;
  } catch {
    return cachedEntries.map;
  }
}

async function resolvePageMeta(pageKey, env, requestUrl) {
  const normalized = normalizePageKey(pageKey || "guestbook");
  const baseUrl = getBaseUrl(env, requestUrl);
  if (normalized === "guestbook") {
    return {
      title: "留言板",
      link: `${baseUrl}/guestbook.html`,
    };
  }

  const entryMap = await loadEntryMap(baseUrl);
  const candidates = [normalized];
  for (const prefix of ["post:", "entry:", "diary:"]) {
    if (normalized.startsWith(prefix)) {
      candidates.push(normalized.slice(prefix.length));
    }
  }

  for (const id of candidates) {
    const hit = entryMap.get(id);
    if (hit) {
      return {
        title: hit.title,
        link: `${baseUrl}/index.html?post=${encodeURIComponent(hit.id)}`,
      };
    }
  }

  return {
    title: "日记帖子",
    link: `${baseUrl}/index.html`,
  };
}

function buildMailContent({ pageTitle, pageLink, unsubscribeLink, replyNickname, replyContent }) {
  const titleForSubject = sanitizeSingleLine(pageTitle || "留言板", 90) || "留言板";
  const nickForDisplay = sanitizeSingleLine(replyNickname || "访客", 40) || "访客";
  const safeTitle = escapeHtml(titleForSubject);
  const safeNick = escapeHtml(nickForDisplay);
  const safeContent = escapeHtml(shorten(replyContent || "", 800)).replaceAll("\n", "<br />");
  const subject = `您在「${titleForSubject}」的评论有了新的回复`;

  const html = `
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', Arial, sans-serif; color:#2f3e54; line-height:1.7; max-width:640px; margin:0 auto;">
    <h2 style="font-size:20px; margin:0 0 14px;">您在「${safeTitle}」的评论有了新的回复</h2>
    <p style="margin:0 0 10px;">@${safeNick} 回复了你：</p>
    <div style="background:#f5f8fc; border:1px solid #d7e1f0; border-radius:12px; padding:12px 14px; margin:0 0 16px;">${safeContent}</div>
    <p style="margin:0 0 14px;">
      <a href="${escapeHtml(pageLink)}" style="display:inline-block; background:#657d9f; color:#fff; text-decoration:none; border-radius:10px; padding:8px 14px;">前往查看</a>
    </p>
    <p style="margin:18px 0 0; font-size:13px; color:#6f7c92;">
      不想再收到这条评论的提醒？
      <a href="${escapeHtml(unsubscribeLink)}" style="color:#5b789f;">点击退订该评论邮件提醒</a>
    </p>
  </div>
  `;

  const text = [
    `您在「${titleForSubject}」的评论有了新的回复`,
    "",
    `@${nickForDisplay} 回复了你：`,
    `${shorten(replyContent || "", 800)}`,
    "",
    `前往查看：${pageLink}`,
    `退订该评论邮件提醒：${unsubscribeLink}`,
  ].join("\n");

  return { subject, html, text };
}

async function ensureParentNotifyFields(db, parent, now) {
  const currentEmail = sanitizeSingleLine(parent.parent_contact_email_resolved, 180).toLowerCase();
  const currentToken = sanitizeSingleLine(parent.parent_unsubscribe_token, 120);
  const resolvedEmail = currentEmail || resolveContactEmail(parent.parent_contact || "");
  const unsubscribeToken = currentToken || (resolvedEmail ? buildUnsubscribeToken() : "");

  if (!resolvedEmail) {
    return { email: "", unsubscribeToken: "" };
  }

  if (!currentEmail || !currentToken) {
    await db
      .prepare(
        `
          UPDATE comments
          SET contact_email_resolved = COALESCE(contact_email_resolved, ?),
              unsubscribe_token = COALESCE(unsubscribe_token, ?),
              updated_at = ?
          WHERE id = ?
        `,
      )
      .bind(resolvedEmail, unsubscribeToken, now, parent.parent_comment_id)
      .run();
  }

  return {
    email: resolvedEmail,
    unsubscribeToken,
  };
}

function asInt(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return fallback;
  }
  return Math.trunc(n);
}

export async function triggerReplyNotification({ db, env, request, replyCommentId }) {
  const now = nowIso();
  try {
    const row = await db
      .prepare(
        `
          SELECT
            r.id AS reply_comment_id,
            r.page_key AS reply_page_key,
            r.parent_id AS reply_parent_id,
            r.nickname AS reply_nickname,
            r.content AS reply_content,
            r.status AS reply_status,
            p.id AS parent_comment_id,
            p.contact AS parent_contact,
            p.notify_enabled AS parent_notify_enabled,
            p.contact_email_resolved AS parent_contact_email_resolved,
            p.unsubscribe_token AS parent_unsubscribe_token
          FROM comments r
          LEFT JOIN comments p ON p.id = r.parent_id
          WHERE r.id = ?
          LIMIT 1
        `,
      )
      .bind(replyCommentId)
      .first();

    if (!row) {
      return { ok: true, skipped: "reply_not_found" };
    }
    if (!row.reply_parent_id || !row.parent_comment_id) {
      return { ok: true, skipped: "not_a_reply" };
    }
    if (sanitizeSingleLine(row.reply_status, 16).toLowerCase() !== "approved") {
      return { ok: true, skipped: "reply_not_approved" };
    }
    if (asInt(row.parent_notify_enabled, 1) !== 1) {
      return { ok: true, skipped: "parent_notify_disabled" };
    }

    const parent = {
      parent_comment_id: asInt(row.parent_comment_id),
      parent_contact: row.parent_contact || "",
      parent_contact_email_resolved: row.parent_contact_email_resolved || "",
      parent_unsubscribe_token: row.parent_unsubscribe_token || "",
    };
    const ensured = await ensureParentNotifyFields(db, parent, now);
    if (!ensured.email) {
      return { ok: true, skipped: "no_recipient_email" };
    }

    const inserted = await db
      .prepare(
        `
          INSERT OR IGNORE INTO comment_reply_notifications (
            reply_comment_id,
            parent_comment_id,
            parent_page_key,
            recipient_email,
            status,
            attempt_count,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, 'pending', 0, ?, ?)
        `,
      )
      .bind(asInt(row.reply_comment_id), asInt(row.parent_comment_id), row.reply_page_key || "guestbook", ensured.email, now, now)
      .run();

    if (!inserted.meta?.changes) {
      return { ok: true, skipped: "already_triggered" };
    }

    const baseUrl = getBaseUrl(env, request.url);
    const pageMeta = await resolvePageMeta(row.reply_page_key || "guestbook", env, request.url);
    const unsubscribeLink = `${baseUrl}/unsubscribe?token=${encodeURIComponent(ensured.unsubscribeToken)}`;
    const mail = buildMailContent({
      pageTitle: pageMeta.title,
      pageLink: pageMeta.link,
      unsubscribeLink,
      replyNickname: sanitizeSingleLine(row.reply_nickname || "访客", 40),
      replyContent: row.reply_content || "",
    });

    const sent = await sendTransactionalMail(env, {
      to: ensured.email,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    });

    if (!sent.ok) {
      await db
        .prepare(
          `
            UPDATE comment_reply_notifications
            SET status = 'failed',
                error_message = ?,
                attempt_count = attempt_count + 1,
                updated_at = ?
            WHERE reply_comment_id = ? AND parent_comment_id = ?
          `,
        )
        .bind(sanitizeSingleLine(sent.error || "mail_send_failed", 320), now, asInt(row.reply_comment_id), asInt(row.parent_comment_id))
        .run();

      return { ok: false, skipped: "send_failed", error: sent.error || "mail_send_failed" };
    }

    await db
      .prepare(
        `
          UPDATE comment_reply_notifications
          SET status = 'sent',
              provider = ?,
              provider_message_id = ?,
              sent_at = ?,
              attempt_count = attempt_count + 1,
              updated_at = ?
          WHERE reply_comment_id = ? AND parent_comment_id = ?
        `,
      )
      .bind(
        sanitizeSingleLine(sent.provider || "resend", 24),
        sanitizeSingleLine(sent.messageId || "", 160),
        now,
        now,
        asInt(row.reply_comment_id),
        asInt(row.parent_comment_id),
      )
      .run();

    await db.prepare("UPDATE comments SET last_notified_at = ?, updated_at = ? WHERE id = ?").bind(now, now, asInt(row.parent_comment_id)).run();
    return { ok: true, sent: true };
  } catch (error) {
    console.error("triggerReplyNotification failed:", error);
    return { ok: false, skipped: "internal_error", error: sanitizeSingleLine(error?.message || "internal_error", 320) };
  }
}
