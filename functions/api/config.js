import { boolFromEnv, json } from "../_lib/comments-utils.js";

export async function onRequestGet(context) {
  const { env } = context;

  return json({
    ok: true,
    turnstileSiteKey: env.TURNSTILE_SITE_KEY || "",
    turnstileEnabled: Boolean(env.TURNSTILE_SITE_KEY),
    commentsAutoApprove: boolFromEnv(env.COMMENTS_AUTO_APPROVE, true),
    defaultAvatarUrl: env.DEFAULT_AVATAR_URL || "/assets/images/avatar-default.svg",
    adminAvatarUrl: env.ADMIN_AVATAR_URL || "/assets/images/Profile.png",
  });
}
