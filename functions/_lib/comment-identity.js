import { sanitizeSingleLine, sha256Hex } from "./comments-utils.js";

export const COMMENT_IDENTITY_COOKIE = "hf_comment_identity";

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

function getSecret(env) {
  return (
    sanitizeSingleLine(env.COMMENT_IDENTITY_SECRET || "", 200) ||
    sanitizeSingleLine(env.TURNSTILE_SECRET_KEY || "", 200) ||
    sanitizeSingleLine(env.IP_HASH_SALT || "", 200) ||
    "hf-comment-identity"
  );
}

async function signValue(secret, expiresAt) {
  return sha256Hex(`${secret}:${expiresAt}`);
}

export async function buildCommentIdentityCookie(request, env, maxAgeSeconds = 604800) {
  const secure = new URL(request.url).protocol === "https:";
  const expiresAt = Date.now() + Math.max(300, Number(maxAgeSeconds) || 604800) * 1000;
  const signature = await signValue(getSecret(env), expiresAt);
  const value = `${expiresAt}.${signature}`;
  const parts = [
    `${COMMENT_IDENTITY_COOKIE}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.max(300, Number(maxAgeSeconds) || 604800)}`,
  ];

  if (secure) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

export function buildClearCommentIdentityCookie(request) {
  const secure = new URL(request.url).protocol === "https:";
  const parts = [`${COMMENT_IDENTITY_COOKIE}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (secure) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

export async function hasValidCommentIdentityCookie(request, env) {
  const cookie = request.headers.get("cookie") || "";
  const token = parseCookies(cookie).get(COMMENT_IDENTITY_COOKIE);
  if (!token) {
    return false;
  }

  const [rawExp, rawSig] = String(token).split(".");
  const expiresAt = Number(rawExp || 0);
  if (!Number.isFinite(expiresAt) || !rawSig || expiresAt <= Date.now()) {
    return false;
  }

  const expected = await signValue(getSecret(env), expiresAt);
  return expected === rawSig;
}
