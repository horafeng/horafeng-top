# HoraFeng Diary Blog（Cloudflare Pages + D1 + Turnstile）

本项目是一个轻量个人博客/日记站，前端为静态页面（HTML/CSS/JS），后端能力通过 Cloudflare Pages Functions 提供。

当前已实现：
- 日记流首页、详情弹层、响应式布局
- 归档时间轴页面（`archive.html`）
- 留言板独立页面（`guestbook.html`）
- 游客留言、管理员审核/删除/回复
- D1 存储、Turnstile 校验
- 头像后端生成与代理回源
- 评论“回复邮件通知 + 单条评论退订”

---

## 1. 技术架构

- Frontend：原生 `HTML/CSS/JS`
- Backend：Cloudflare Pages Functions（`functions/`）
- Database：Cloudflare D1（绑定名：`COMMENTS_DB`）
- Human Check：Cloudflare Turnstile
- Mail（可选）：默认按 Resend 适配

---

## 2. 目录说明（核心）

- 页面
  - `index.html`：首页
  - `archive.html`：归档时间轴页
  - `guestbook.html`：留言板
  - `admin/comments/index.html`：后台评论管理
- 前端脚本
  - `assets/js/index.js`
  - `assets/js/archive.js`
  - `assets/js/guestbook.js`
  - `assets/js/admin-comments.js`
  - `assets/js/common.js`
- 后端接口
  - `functions/api/comments.js`
  - `functions/api/admin/comments.js`
  - `functions/api/admin/login.js`
  - `functions/api/admin/logout.js`
  - `functions/api/avatar/[id].js`
  - `functions/unsubscribe.js`
- 后端公共模块
  - `functions/_lib/comments-utils.js`
  - `functions/_lib/comment-notify.js`
  - `functions/_lib/mailer.js`
  - `functions/_lib/admin-auth.js`
- 数据脚本
  - `scripts/init-comments.sql`
  - `scripts/migrate-notify.sql`
  - `scripts/seed-comments.sql`
  - `scripts/add-diary.ps1`
- Notion 内容规划与同步骨架
  - `docs/NOTION_CONTENT_MODEL.md`
  - `scripts/notion-sync/content-model.js`
  - `scripts/notion-sync/notion-transform.js`
  - `scripts/notion-sync/sync-notion.js`
  - `scripts/notion-sync/notion-client.js`
  - `scripts/notion-sync/fetch-database.js`
  - `scripts/notion-sync/fetch-page-blocks.js`

---

## 3. 评论系统能力

### 3.1 公共接口

- `GET /api/comments?page_key=...`
  - 获取公开评论（树结构）
  - 不返回联系方式
- `POST /api/comments`
  - 提交评论/回复
  - 必填：昵称、联系方式、内容、Turnstile token（按配置）
  - 可选：`notify_enabled`（是否开启邮件提醒）

### 3.2 管理接口

- `POST /api/admin/login`：管理员登录
- `POST /api/admin/logout`：退出登录
- `GET /api/admin/comments`：获取后台评论列表（含联系方式）
- `PATCH /api/admin/comments`：改状态（pending/approved/deleted/spam）
- `DELETE /api/admin/comments`：删除（软删）
- `POST /api/admin/comments`：管理员回复

---

## 4. 头像规则（前台不暴露联系方式）

前端只显示后端返回的 `avatar_url`，不解析联系方式。

公共评论列表中的 `avatar_url` 采用同站代理路径：
- `/api/avatar/{commentId}`

头像回源逻辑在后端执行：
- QQ 号：先尝试转换为 `qq@qq.com` 走 Cravatar，再尝试 QQ 头像源，再回退默认头像
- 邮箱：先 Cravatar，再 Gravatar(SHA256)，再回退默认头像
- 博主/管理员：优先站内配置头像

调试（临时）：
- `GET /api/avatar/{id}?debug=1` 返回命中路径信息

---

## 5. 回复邮件通知（本次重点）

### 5.1 触发条件

仅在“回复评论”进入 `approved` 时触发通知：
- 回复创建即 `approved`：触发
- 回复从 `pending` 改为 `approved`：触发
- `pending/deleted/spam`：不触发
- 原评论关闭提醒：不触发
- 同一条回复只触发一次（数据库去重）

### 5.2 收件邮箱解析

- 原评论联系方式是邮箱：直接发该邮箱
- 原评论联系方式是 QQ 号：转换为 `${qq}@qq.com` 发送
- 无法解析有效邮箱：跳过发送（不影响主流程）

### 5.3 邮件内容

主题：
- `您在「页面标题」的评论有了新的回复`

正文包含：
- `您在「页面标题」的评论有了新的回复`
- `@回复人昵称 回复了你：`
- 回复内容
- 前往查看链接
- 退订该评论邮件提醒链接

页面标题解析：
- `guestbook` -> `留言板`
- 其他 `page_key`：尝试匹配 `content/diaries.json` 标题
- 匹配失败回退：`日记帖子`

### 5.4 退订

邮件中退订链接：
- `/unsubscribe?token=...`

行为：
- 仅关闭该条“原评论”的提醒（`notify_enabled = 0`）
- 不影响其他评论

---

## 6. 数据库结构（评论相关）

`comments`（核心字段）：
- `id`
- `page_key`
- `parent_id`
- `nickname`
- `contact`（仅后台可见）
- `content`
- `status`
- `is_admin`
- `notify_enabled`
- `contact_email_resolved`
- `unsubscribe_token`
- `last_notified_at`
- `ip_hash`
- `user_agent`
- `created_at`
- `updated_at`

`comment_reply_notifications`（防重复与发送记录）：
- `id`
- `reply_comment_id`
- `parent_comment_id`
- `parent_page_key`
- `recipient_email`
- `status`（pending/sent/failed）
- `provider`
- `provider_message_id`
- `error_message`
- `attempt_count`
- `created_at`
- `sent_at`
- `updated_at`
- 唯一约束：`(reply_comment_id, parent_comment_id)`

---

## 7. 环境变量（`.env.example`）

评论与安全：
- `TURNSTILE_SITE_KEY`
- `TURNSTILE_SECRET_KEY`
- `TURNSTILE_BYPASS`
- `COMMENTS_AUTO_APPROVE`
- `COMMENT_NOTIFY_DEFAULT`
- `COMMENT_RATE_LIMIT_PER_MINUTE`
- `IP_HASH_SALT`

管理员：
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `ADMIN_DISPLAY_NAME`
- `ADMIN_AVATAR_URL`
- `ADMIN_SESSION_TTL_HOURS`
- `ADMIN_LOGIN_RATE_LIMIT_PER_MINUTE`

头像：
- `DEFAULT_AVATAR_URL`
- `QQ_AVATAR_BASE_URL`
- `EMAIL_AVATAR_BASE_URL`
- `GRAVATAR_DEFAULT_MODE`
- `PUBLIC_AVATAR_SIZE`

邮件通知：
- `SITE_BASE_URL`（建议必填）
- `MAIL_PROVIDER`（默认 `resend`）
- `MAIL_API_KEY`（启用邮件必填）
- `MAIL_FROM`（启用邮件必填）
- `MAIL_REPLY_TO`（可选）
- `ADMIN_REVIEW_NOTIFY_TO`（可选，默认 `horafeng@outlook.com`，用于新评论审核提醒）
- `ADMIN_EMAIL_NAME`（可选）

---

## 8. D1 初始化与迁移

新建数据库：
```bash
wrangler d1 execute <your-db-name> --file scripts/init-comments.sql
```

已有旧库升级到“邮件通知版”：
```bash
wrangler d1 execute <your-db-name> --file scripts/migrate-notify.sql
```
> 说明：迁移脚本按“新增列 + 新建唯一索引”设计，适配 D1/SQLite 限制；请在同一数据库中执行一次即可。

示例数据（可选）：
```bash
wrangler d1 execute <your-db-name> --file scripts/seed-comments.sql
```

---

## 8.1 Cloudflare 外部配置顺序（推荐）

1. 在 Cloudflare Turnstile 创建站点并拿到 `SITE_KEY` / `SECRET_KEY`
2. 在 D1 创建数据库，并绑定到 Pages（绑定名 `COMMENTS_DB`）
3. 执行 SQL：新库跑 `init-comments.sql`，旧库跑 `migrate-notify.sql`
4. 在邮件服务商（如 Resend）完成发信域名验证并获取 `MAIL_API_KEY`
5. 在 Pages 项目里配置环境变量（含 `SITE_BASE_URL`、`MAIL_FROM` 等）
6. 重新部署站点，进入留言板与后台做一次“评论 -> 回复 -> 审核”联调

---

## 9. 本地开发

静态预览：
```bash
python -m http.server 5173
```

访问：
- `http://localhost:5173/index.html`
- `http://localhost:5173/archive.html`
- `http://localhost:5173/guestbook.html`
- `http://localhost:5173/admin/comments/`

说明：
- 仅 `python` 静态服务不会运行 `functions`
- 需要联调 API/D1/Turnstile 时，请使用 Wrangler 本地模式

---

## 9.1 Notion 同步器（第一版）

当前已实现一个“最小可用”的 Notion 同步器，目标是：

- 从 Notion 数据库读取已发布内容
- 区分 `note` / `article` / `notice`
- 读取正文 block
- 自动识别 `note` 是否含图片
- 输出为当前项目可继续消费的结构化 JSON

运行前需要本地提供：

- `NOTION_TOKEN`
- `NOTION_DATABASE_ID`

也支持：

- `NOTION_DATABASE_URL`

环境变量读取顺序：

- 进程环境变量
- 项目根目录 `.env`
- 项目根目录 `.env.local`
- 项目根目录 `.env.notion`

运行方式：

```bash
npm run notion:sync
```

或者：

```bash
node scripts/notion-sync/sync-notion.js
```

输出文件位置：

- `content/generated/notion-index.json`
- `content/generated/notion-notes.json`
- `content/generated/notion-articles.json`
- `content/generated/notion-notices.json`
- `content/generated/notion-diaries-compat.json`
- `content/generated/articles/{slug}.json`

当前已支持字段：

- `title`
- `slug`
- `type`
- `status`
- `summary`
- `tags`
- `category`
- `cover`
- `published_at`
- `featured`
- `pin`

`note` 有图/无图识别方式：

- 同步器递归扫描正文 block
- 命中 Notion 原生 `image` block 时，自动生成：
  - `has_media`
  - `media`
  - `images`
- `images.length > 0` 即可视为“有图 note”

`article` 当前同步程度：

- 已同步基础字段
- 已同步正文 block
- 已输出为独立详情 JSON
- 这一轮还没有接入现有前端文章页

下一阶段如果要接前端，最建议先看：

- `content/generated/notion-index.json`
- `content/generated/notion-notes.json`
- `content/generated/notion-diaries-compat.json`
- `content/generated/articles/{slug}.json`
- `assets/js/index.js`
- `assets/js/archive.js`

---

## 10. 部署建议

推荐：GitHub + Cloudflare Pages

原因：
- 与当前静态站结构完全匹配
- Functions + D1 + Turnstile 原生集成
- 成本低、维护轻、扩展方便

---

## 11. 兼容性与保留能力

本次改造为增量开发，保留并兼容：
- 首页/帖子详情与动画逻辑
- 留言板展示与提交流程
- 管理后台审核/删除/回复
- Turnstile 校验
- D1 存储结构（在原表上增量扩展）

邮件发送失败不会阻断评论主流程（审核/回复依旧成功）。

---

## 12. Homepage Feed + Article Entry (Incremental)

- `assets/js/common.js`
  - `loadEntries()` still returns note/diary entries only
  - `loadHomeFeed()` now merges:
    - `content/diaries.json`
    - `content/generated/notion-diaries-compat.json`
    - `content/generated/notion-articles.json`
- `assets/js/index.js`
  - homepage timeline can render both note cards and article teaser cards
  - note cards still open the existing modal
  - article cards now jump to `article.html?slug=...`
- `article.html` + `assets/js/article.js`
  - first minimal frontend path for Notion `article`
  - detail data comes from `content/generated/articles/{slug}.json`
  - current renderer supports headings, paragraph, bulleted/numbered list, quote, callout, divider, image, bookmark, embed, code

## 13. Notion Media Cache (Incremental)

- The syncer now also writes local cached copies of Notion-hosted signed files/images into:
  - `content/generated/media/notion/...`
- This avoids homepage note covers and article body images breaking after Notion temporary signed URLs expire.
- If newly synced Notion images are still missing on the site, rerun:
  - `npm run notion:sync`

## 14. Note / Article Comments

- Notes and articles now reuse the same public comment API: `GET/POST /api/comments`
- Page key mapping:
  - note modal: `note:{entry.id}`
  - article detail: `article:{slug}`
- Article comments render after the article body in `article.html`
- Note comments render inside the existing post modal, with a compact mobile dock entry for quick commenting
- The existing guestbook, admin moderation flow, D1 storage, avatar proxy, Turnstile validation, and email reply notification pipeline are unchanged

## 15. Homepage Recent Comments

- The homepage sidebar and mobile preview no longer use `content/site.json` mock comment rows
- They now load real approved comments from `GET /api/comments?recent=1&limit=10`
- The recent list includes comments from:
  - `guestbook`
  - `note:{entry.id}`
  - `article:{slug}`
- Each recent comment card shows avatar, timestamp, comment excerpt, and the source target it links back to

## 16. Moderation UX

- The admin comments dashboard now defaults to showing all page comments instead of only `guestbook`
- `entry.html` now also mounts real comments via `mountContentComments`
- `content/site.json.comments.recentMock` / `entryMock` are deprecated compatibility fields and should stay empty
- Public comment submission now returns the created comment payload
- When a visitor submits a comment that is still pending moderation:
  - the comment is shown immediately to that same visitor only
  - it carries a visible pending badge
  - once approved and returned by the public API, the local pending marker is removed automatically
- After comment submission on guestbook, note, and article pages, the site now shows a centered success toast with a check animation:
  - `评论成功！审核后展现`

## 17. Lightweight Comment Identity Flow

- Note and article pages no longer keep a large always-open comment form on screen
- Default interaction:
  - show `写评论`
  - show `回复` under public comments
- First-time visitor flow on note/article pages:
  - click `写评论` or `回复`
  - open an identity modal
  - fill nickname, contact, reply-notify preference, and Turnstile
  - continue back to a lightweight content-only composer
- The visitor identity is stored in `localStorage`, so later interactions on the same browser open the lightweight composer directly
- A `修改信息 / 切换身份` path is available from the composer area
- Minimal backend compatibility:
  - `POST /api/comment-identity` verifies Turnstile and sets a short-lived comment identity cookie
  - `POST /api/comments` accepts either a fresh Turnstile token or a valid verified comment identity cookie

## 18. Guestbook + Two-Level Replies + Archive Feed

- `guestbook.html` now reuses the same lightweight comment identity flow as note/article comments
- The legacy always-open guestbook form is removed at runtime and replaced by the shared comment widget
- Public comment rendering is now flattened into two visual levels:
  - root comments
  - a single reply stream under each root
- Replies to replies are no longer deeply nested; instead they stay in the second level and show a prefix like `回复 #123 @昵称`
- The public comment tree payload now includes `reply_to_id` for reply labeling
- `archive.html` now loads the merged home feed, so both `note` and published `article` entries appear in the archive timeline
- Clicking an archive note still opens the existing modal; clicking an archive article goes to `article.html?slug=...`

## 19. Global Footer

- A site-wide footer is injected from `assets/js/common.js`, so all public pages share the same bottom bar
- Footer content includes:
  - linked `萌ICP备20250315号` -> `https://icp.gov.moe/?keyword=20250315`
  - auto-updating copyright years: `© 2026 HoraFeng All Rights Reserved.` and later `© 2026-YYYY ...`
  - `文章总数`
  - `访问量`
  - live site uptime (`小站已运行 ...`) updating every second
- The default uptime start point is `2025-01-14T00:00:00+09:24`
- `访问量` comes from `GET /api/site-stats?increment=1`, backed by D1 and auto-creating the `site_metrics` table on first use
## Friends Page

## 20. Notion Profile / Notice / SEO Sync Rules (2026-04)

- Profile source is now the Notion database page itself:
  - `profile.avatar` <- database page `icon` (Page Icon)
  - `profile.signature` <- database page `description`
- Sync writes both values into `content/site.json.profile.*` each run.
- Notice behavior:
  - `?content=notice` can render full notice body directly
  - popup priority prefers latest `pin=true` notice, then latest published notice
- SEO output:
  - generated file `content/generated/notion-seo.json`
  - runtime pages maintain `og:title`, `og:description`, `og:image`, `twitter:card`, `twitter:image`
- AI article cleanup:
  - sync skips AI-marked/generated article rows
  - stale detail files are removed from `content/generated/articles/`

## 21. 2026-04 Mobile + Comment Notify Update

- homepage mobile topbar now keeps only the left drawer trigger and the right search button
- homepage mobile drawer now contains notice, profile, and a vertical page navigation list
- mobile notice popup now keeps a visible close button and uses a smaller dialog footprint
- `POST /api/comments` now also sends an admin review reminder email for every public comment
- configure `ADMIN_REVIEW_NOTIFY_TO` to override the default recipient `horafeng@outlook.com`

- 新增 `/friends/` 友链页，页面文件为 `friends/index.html`
- 友链数据维护在 `content/friends.json`
- 友链前端渲染逻辑在 `assets/js/friends.js`
- 顶栏已补充 `友链` 入口
