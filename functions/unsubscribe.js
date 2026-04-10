import { getDb, nowIso, sanitizeSingleLine } from "./_lib/comments-utils.js";

function pageTemplate({ title, message, muted, linkHref, linkLabel }) {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title} | HoraFeng</title>
    <style>
      :root { color-scheme: light; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: linear-gradient(155deg, #f7f6f3 0%, #ecf3ff 55%, #f5efff 100%);
        font-family: "Noto Serif SC", "Source Han Serif SC", "PingFang SC", serif;
        color: #394456;
      }
      .card {
        width: min(560px, calc(100vw - 28px));
        border-radius: 18px;
        border: 1px solid rgba(89, 104, 126, 0.18);
        background: rgba(255, 255, 255, 0.84);
        backdrop-filter: blur(10px);
        box-shadow: 0 18px 46px rgba(32, 52, 84, 0.14);
        padding: 22px 20px;
      }
      h1 { margin: 0 0 10px; font-size: 1.42rem; }
      p { margin: 0; line-height: 1.78; }
      .muted { margin-top: 10px; color: #728099; font-size: 0.92rem; }
      .actions { margin-top: 16px; }
      a.button {
        text-decoration: none;
        display: inline-block;
        border-radius: 11px;
        padding: 8px 14px;
        background: #657d9f;
        color: #fff;
      }
    </style>
  </head>
  <body>
    <main class="card">
      <h1>${title}</h1>
      <p>${message}</p>
      <p class="muted">${muted}</p>
      <p class="actions"><a class="button" href="${linkHref}">${linkLabel}</a></p>
    </main>
  </body>
</html>`;
}

export async function onRequestGet(context) {
  try {
    const db = getDb(context.env);
    const url = new URL(context.request.url);
    const token = sanitizeSingleLine(url.searchParams.get("token"), 160);
    const origin = url.origin;

    if (!token) {
      return new Response(
        pageTemplate({
          title: "退订失败",
          message: "退订链接无效或已过期。",
          muted: "请确认你点击的是邮件中的完整链接。",
          linkHref: `${origin}/guestbook.html`,
          linkLabel: "返回留言板",
        }),
        { headers: { "content-type": "text/html; charset=utf-8" } },
      );
    }

    const row = await db
      .prepare("SELECT id, page_key, notify_enabled FROM comments WHERE unsubscribe_token = ? LIMIT 1")
      .bind(token)
      .first();

    if (!row) {
      return new Response(
        pageTemplate({
          title: "退订失败",
          message: "没有找到对应评论，链接可能已失效。",
          muted: "如果问题持续，可以直接在留言板联系博主处理。",
          linkHref: `${origin}/guestbook.html`,
          linkLabel: "返回留言板",
        }),
        { headers: { "content-type": "text/html; charset=utf-8" } },
      );
    }

    const pageKey = sanitizeSingleLine(row.page_key, 64) || "guestbook";
    const pageLink = pageKey === "guestbook" ? `${origin}/guestbook.html` : `${origin}/index.html`;
    const notifyEnabled = Number(row.notify_enabled || 0) === 1;

    if (notifyEnabled) {
      await db
        .prepare("UPDATE comments SET notify_enabled = 0, updated_at = ? WHERE id = ?")
        .bind(nowIso(), Number(row.id))
        .run();
    }

    return new Response(
      pageTemplate({
        title: "退订成功",
        message: "这条评论的后续回复邮件提醒已关闭。",
        muted: "你仍然可以正常浏览评论，如需重新开启可再次评论并勾选邮件提醒。",
        linkHref: pageLink,
        linkLabel: "前往查看页面",
      }),
      { headers: { "content-type": "text/html; charset=utf-8" } },
    );
  } catch (error) {
    return new Response(
      pageTemplate({
        title: "退订异常",
        message: "系统暂时无法处理退订请求，请稍后再试。",
        muted: sanitizeSingleLine(error?.message || "", 180),
        linkHref: "/guestbook.html",
        linkLabel: "返回留言板",
      }),
      { status: 500, headers: { "content-type": "text/html; charset=utf-8" } },
    );
  }
}
