import { sanitizeSingleLine } from "./comments-utils.js";

function getProvider(env) {
  return sanitizeSingleLine(env.MAIL_PROVIDER || "resend", 24).toLowerCase();
}

function pickFrom(env) {
  return sanitizeSingleLine(env.MAIL_FROM, 180);
}

function pickApiKey(env) {
  return sanitizeSingleLine(env.MAIL_API_KEY, 240);
}

export function isMailConfigured(env) {
  const provider = getProvider(env);
  if (provider !== "resend") {
    return false;
  }
  return Boolean(pickFrom(env) && pickApiKey(env));
}

export async function sendTransactionalMail(env, { to, subject, html, text }) {
  const provider = getProvider(env);
  const from = pickFrom(env);
  const apiKey = pickApiKey(env);
  const replyTo = sanitizeSingleLine(env.MAIL_REPLY_TO, 180);

  if (!to || !subject || !html) {
    return { ok: false, error: "mail_payload_invalid", provider };
  }

  if (!from || !apiKey) {
    return { ok: false, error: "mail_not_configured", provider };
  }

  if (provider !== "resend") {
    return { ok: false, error: "mail_provider_unsupported", provider };
  }

  try {
    const body = {
      from,
      to: [to],
      subject,
      html,
      text: text || "",
    };
    if (replyTo) {
      body.reply_to = replyTo;
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: payload?.message || payload?.error || `mail_provider_error_${response.status}`,
        provider,
      };
    }

    return {
      ok: true,
      provider,
      messageId: sanitizeSingleLine(payload?.id || "", 120),
    };
  } catch (error) {
    return {
      ok: false,
      provider,
      error: sanitizeSingleLine(error?.message || "mail_network_error", 320),
    };
  }
}
