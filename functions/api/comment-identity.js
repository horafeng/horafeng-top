import { buildCommentIdentityCookie } from "../_lib/comment-identity.js";
import {
  boolFromEnv,
  json,
  parseJson,
  sanitizeSingleLine,
  validateContact,
  verifyTurnstile,
} from "../_lib/comments-utils.js";

export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const payload = await parseJson(request);
    if (!payload) {
      return json({ ok: false, message: "Invalid JSON body." }, 400);
    }

    const nickname = sanitizeSingleLine(payload.nickname, 24);
    const contactResult = validateContact(payload.contact);
    const notifyEnabled = boolFromEnv(payload.notify_enabled, true);
    const turnstileToken = sanitizeSingleLine(payload.turnstileToken || payload.turnstile_token, 2048);

    if (!nickname) {
      return json({ ok: false, message: "Nickname is required." }, 400);
    }
    if (!contactResult.ok) {
      return json({ ok: false, message: contactResult.reason }, 400);
    }

    const turnstileCheck = await verifyTurnstile({
      secret: env.TURNSTILE_SECRET_KEY,
      token: turnstileToken,
      ip: request.headers.get("CF-Connecting-IP") || request.headers.get("x-forwarded-for") || "0.0.0.0",
      bypass: boolFromEnv(env.TURNSTILE_BYPASS, false),
    });

    if (!turnstileCheck.ok) {
      return json({ ok: false, message: turnstileCheck.message || "Turnstile verification failed." }, 400);
    }

    const cookie = await buildCommentIdentityCookie(request, env, 7 * 24 * 60 * 60);
    return json(
      {
        ok: true,
        identity: {
          nickname,
          contact: contactResult.value,
          notify_enabled: notifyEnabled,
          verified_at: new Date().toISOString(),
        },
      },
      200,
      {
        "set-cookie": cookie,
      },
    );
  } catch (error) {
    return json({ ok: false, message: error.message || "Failed to verify comment identity." }, 500);
  }
}
