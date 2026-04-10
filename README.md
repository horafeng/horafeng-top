# HoraFeng 日记专区（Cloudflare Pages + D1 留言系统）

本项目在原有静态博客基础上做了**增量升级**：保留现有首页与样式，新增了“真实可维护留言系统”。

技术栈：

- 前端：现有静态页面（HTML/CSS/JS）
- 后端：Cloudflare Pages Functions
- 数据库：Cloudflare D1
- 人机验证：Cloudflare Turnstile

## 1. 本次新增了什么

### 1.1 后端 API（Pages Functions）

- `GET /api/comments`  
  公开留言列表（按 `page_key`，支持 `limit/offset`，返回父子回复结构，不暴露联系方式）
- `POST /api/comments`  
  提交留言（昵称/联系方式/内容必填，Turnstile 校验，写入 D1，支持 `parent_id`）
- `GET /api/config`  
  提供前端可公开配置（如 Turnstile Site Key）
- `POST /api/admin/login`  
  单管理员登录，发放 HttpOnly Session Cookie
- `POST /api/admin/logout`  
  管理员退出
- `GET /api/admin/comments`  
  后台查看全部留言（含 pending/deleted/spam，含联系方式）
- `PATCH /api/admin/comments`  
  修改留言状态（`pending/approved/deleted/spam`）
- `DELETE /api/admin/comments`  
  软删除留言（状态改为 `deleted`）
- `POST /api/admin/comments`  
  管理员回复（写入 `is_admin=1`，默认 `approved`）

### 1.2 数据库脚本

- `scripts/init-comments.sql`：初始化表结构和索引
- `scripts/seed-comments.sql`：可选示例数据

### 1.3 前端页面

- `guestbook.html`：真实留言板页面（接 API）
- `admin/comments/index.html`：后台留言管理页（登录 + 审核/删除/回复）
- `index.html` 左侧导航新增 “留言板” 入口

## 2. 数据结构（D1）

### 2.1 comments

字段：

- `id`：主键
- `page_key`：留言归属页（如 `guestbook`、`post:2026-04-07-evening`）
- `parent_id`：回复目标（可空）
- `nickname`：昵称（公开）
- `contact`：联系方式（仅后台可见）
- `content`：留言正文（公开）
- `status`：`pending | approved | deleted | spam`
- `is_admin`：是否管理员留言（0/1）
- `ip_hash`：IP 哈希（防滥用）
- `user_agent`：请求 UA
- `created_at` / `updated_at`

### 2.2 admin_sessions

字段：

- `id`：主键
- `token_hash`：会话 token 哈希（不存明文）
- `ip_hash`
- `user_agent`
- `created_at`
- `expires_at`

### 2.3 comment_rate_limits

字段：

- `limiter_key`：限流键（如 `page_key:ip_hash`）
- `window_start`：分钟窗口
- `request_count`：窗口内请求数
- `updated_at`

## 3. Cloudflare 面板需要手动做的事（按顺序）

### 第一步：创建 D1 数据库

1. Cloudflare Dashboard -> D1 -> Create database  
2. 记下 `database_name` 和 `database_id`

### 第二步：在 Pages 项目绑定 D1

1. Cloudflare Dashboard -> Pages -> 你的项目 -> Settings -> Functions  
2. 找到 D1 bindings，新增：
   - Binding name: `COMMENTS_DB`
   - Database: 选择你刚创建的 D1

### 第三步：创建 Turnstile

1. Cloudflare Dashboard -> Turnstile -> Add site
2. 记下：
   - Site Key（前端公开）
   - Secret Key（服务端 secret）

### 第四步：配置环境变量 / Secrets（Pages 项目）

在 Pages -> Settings -> Environment variables 中配置：

- `TURNSTILE_SITE_KEY`（普通变量）
- `TURNSTILE_SECRET_KEY`（Secret）
- `ADMIN_USERNAME`（普通变量，建议 `admin`）
- `ADMIN_PASSWORD`（Secret，必填）
- `ADMIN_DISPLAY_NAME`（普通变量，可选，默认“博主”）
- `ADMIN_SESSION_TTL_HOURS`（可选，默认 `72`）
- `COMMENTS_AUTO_APPROVE`（可选，默认 `true`）
- `COMMENT_RATE_LIMIT_PER_MINUTE`（可选，默认 `6`）
- `ADMIN_LOGIN_RATE_LIMIT_PER_MINUTE`（可选，默认 `8`）
- `IP_HASH_SALT`（建议 Secret）
- `TURNSTILE_BYPASS`（仅本地调试可设 `true`，生产必须关闭）

变量名清单也提供在 `.env.example` 中，方便对照。

### 第五步：执行 SQL 初始化

使用 Wrangler（推荐）：

```bash
wrangler d1 execute <你的数据库名> --file scripts/init-comments.sql
```

可选导入示例：

```bash
wrangler d1 execute <你的数据库名> --file scripts/seed-comments.sql
```

### 第六步：部署 Pages

1. 推送代码到 GitHub  
2. Pages 自动构建/发布  
3. 打开 `https://你的域名/guestbook.html` 验证留言功能  
4. 打开 `https://你的域名/admin/comments/` 验证后台登录与管理

## 4. 本地开发

你现在仍可用静态方式预览页面样式：

```bash
python -m http.server 5173
```

但这只能看静态界面，`/api/*` 不会生效。  
要联调 Functions + D1，请用 Wrangler 本地模式（按你的 Cloudflare 绑定配置执行）。

可选：复制 `wrangler.toml.example` 为 `wrangler.toml` 并填入你的 D1 信息，便于本地联调。

手机端预览：

1. 打开浏览器 DevTools (`F12`)
2. 切换设备模拟 (`Ctrl + Shift + M`)
3. 刷新页面观察移动端布局与交互

## 5. 游客如何留言

入口：`/guestbook.html`

1. 填写昵称
2. 填写联系方式（邮箱或 QQ）
3. 填写留言内容
4. 完成 Turnstile
5. 点击发送

前台公开仅展示：

- 昵称
- 留言内容
- 时间
- 回复关系（含管理员回复标识）

联系方式不会对普通访客公开。

## 6. 博主如何管理留言

入口：`/admin/comments/`

1. 用 `ADMIN_USERNAME` + `ADMIN_PASSWORD` 登录
2. 查看全部留言与状态
3. 可执行：
   - 审核通过（approved）
   - 退回待审（pending）
   - 标记垃圾（spam）
   - 删除（deleted）
   - 回复（管理员回复）

## 7. 当前已实现能力 vs 后续扩展

### 已实现（当前基础版）

- 真实数据库留言存储（D1）
- Turnstile 人机验证
- 公开留言展示（不暴露联系方式）
- 单管理员会话登录
- 审核/删除/回复/状态管理
- 基础限流（按 page_key + IP 哈希）

### 后续可扩展

- 敏感词表与自动审查（D1 增表）
- 更细粒度风控（UA 信誉、频次黑名单）
- 邮件通知（新留言提醒）
- 帖子详情页接入同一 API（`page_key=post:<id>`）
- 审核操作日志（审计表）

## 8. 内容与素材维护（现有结构）

- 日记文案：`content/diaries.json`
- 站点资料：`content/site.json`
- 日记图片：`assets/images/diary/`
- 留言系统后端：`functions/api/*`
- 留言系统页面：
  - `guestbook.html`
  - `admin/comments/index.html`

建议工作流：

1. 继续按原方式维护日记内容（不受本次改动影响）
2. 留言系统参数走 Cloudflare 环境变量，不写死在前端
3. 日常管理通过 `/admin/comments/` 完成
