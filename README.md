# HoraFeng Diary Blog（Cloudflare Pages + D1 + Turnstile）

本项目是一个轻量个人博客/日记站，前端为静态页面（HTML/CSS/JS），后端能力通过 Cloudflare Pages Functions 提供。

当前已实现：
- 日记流首页、详情弹层、响应式布局
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
  - `guestbook.html`：留言板
  - `admin/comments/index.html`：后台评论管理
- 前端脚本
  - `assets/js/index.js`
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
- `http://localhost:5173/guestbook.html`
- `http://localhost:5173/admin/comments/`

说明：
- 仅 `python` 静态服务不会运行 `functions`
- 需要联调 API/D1/Turnstile 时，请使用 Wrangler 本地模式

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
