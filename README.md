# HoraFeng Diary Blog (Cloudflare Pages + D1 + Turnstile)

本项目是在现有静态博客基础上的增量开发版本，保留首页、帖子、动画与管理能力，新增了可维护留言系统。

技术栈：
- Frontend: 现有 HTML / CSS / JS
- Backend: Cloudflare Pages Functions
- Database: Cloudflare D1
- Human verification: Cloudflare Turnstile

## 1. 当前留言系统架构

### 1.1 Public API
- `GET /api/comments`  
  按 `page_key` 获取公开留言，支持 `limit/offset`，返回父子回复结构。
- `POST /api/comments`  
  访客提交留言，要求昵称/联系方式/内容必填，并执行 Turnstile 校验。
- `GET /api/config`  
  返回前端公开配置（Turnstile Site Key、默认头像 URL 等）。

### 1.2 Admin API
- `POST /api/admin/login` 登录并设置 session cookie
- `POST /api/admin/logout` 退出
- `GET /api/admin/comments` 查看全部留言（含状态与联系方式）
- `PATCH /api/admin/comments` 修改状态（pending / approved / deleted / spam）
- `DELETE /api/admin/comments` 删除（软删除）
- `POST /api/admin/comments` 管理员回复

### 1.3 数据库脚本
- `scripts/init-comments.sql`
- `scripts/seed-comments.sql`（可选）

## 2. D1 表结构

### 2.1 `comments`
- `id`
- `page_key`
- `parent_id`
- `nickname`
- `contact`（仅后台可见）
- `content`
- `status` (`pending|approved|deleted|spam`)
- `is_admin`
- `ip_hash`
- `user_agent`
- `created_at`
- `updated_at`

### 2.2 `admin_sessions`
- `id`
- `token_hash`
- `ip_hash`
- `user_agent`
- `created_at`
- `expires_at`

### 2.3 `comment_rate_limits`
- `limiter_key`
- `window_start`
- `request_count`
- `updated_at`

## 3. 头像方案（方案 A）

头像 URL 统一在后端生成，前端只消费 `avatar_url` 字段。

### 3.1 邮箱联系方式
- 后端识别为邮箱后，生成 Gravatar URL。
- 规则：`https://www.gravatar.com/avatar/<md5(email)>?s=<size>&d=404`
- 如果 Gravatar 头像不存在或加载失败，前端自动回退默认头像。

### 3.2 QQ 联系方式
- 后端识别为 QQ 后，生成 QQ 头像 URL。
- 默认规则：`https://q1.qlogo.cn/g?b=qq&nk=<qq>&s=<size>`
- 若头像源不稳定或加载失败，前端自动回退默认头像。
- QQ 头像源可通过环境变量替换（见 `QQ_AVATAR_BASE_URL`）。

### 3.3 默认头像
- 默认头像资源：`assets/images/avatar-default.svg`
- API 默认返回：`/assets/images/avatar-default.svg`
- 也可通过 `DEFAULT_AVATAR_URL` 覆盖。

### 3.4 隐私保证
- 公开接口 `GET /api/comments` 不返回 `contact`。
- 前端页面不展示联系方式。
- 仅管理员接口返回联系方式用于管理。

## 4. 留言板页面模式（独立长页面）

留言板页面是独立页面：`guestbook.html`。

设计目标：
- 从首页点击“留言板”后，进入完整页面（不是弹层）。
- 页面加载时回到顶部（已在脚本中设置）。
- 布局为：左侧资料栏 + 中间长内容栏（无右栏）。
- 中栏结构：标题引言 -> 留言输入区 -> 留言列表。

这与普通帖子详情不同：
- 帖子详情仍是内容详情交互。
- 留言板是稳定阅读/互动页面，更像博客中的一篇“功能型长文”。

## 5. Cloudflare 面板配置步骤（建议顺序）

1. 创建 D1 数据库（记下 `database_name` / `database_id`）。
2. 在 Pages 项目绑定 D1：binding 名必须为 `COMMENTS_DB`。
3. 创建 Turnstile，获得 Site Key 和 Secret Key。
4. 在 Pages 环境变量配置下列变量。
5. 执行 SQL 初始化。
6. 部署并验证留言板与后台。

## 6. 环境变量 / Secrets

完整变量模板见 `.env.example`，关键项如下：

必填：
- `TURNSTILE_SITE_KEY`
- `TURNSTILE_SECRET_KEY`
- `ADMIN_PASSWORD`

推荐填写：
- `ADMIN_USERNAME`（默认 `admin`）
- `ADMIN_DISPLAY_NAME`
- `IP_HASH_SALT`

可选调优：
- `COMMENTS_AUTO_APPROVE`（默认 `true`）
- `COMMENT_RATE_LIMIT_PER_MINUTE`（默认 `6`）
- `ADMIN_LOGIN_RATE_LIMIT_PER_MINUTE`（默认 `8`）
- `ADMIN_SESSION_TTL_HOURS`（默认 `72`）
- `DEFAULT_AVATAR_URL`（默认 `/assets/images/avatar-default.svg`）
- `QQ_AVATAR_BASE_URL`（默认 `https://q1.qlogo.cn/g`）
- `GRAVATAR_DEFAULT_MODE`（默认 `404`）
- `PUBLIC_AVATAR_SIZE`（默认 `120`）
- `TURNSTILE_BYPASS`（仅本地调试使用，生产不要开启）

## 7. SQL 初始化

```bash
wrangler d1 execute <your-db-name> --file scripts/init-comments.sql
```

可选示例数据：

```bash
wrangler d1 execute <your-db-name> --file scripts/seed-comments.sql
```

## 8. 本地开发

静态页面预览：

```bash
python -m http.server 5173
```

访问：
- `http://localhost:5173/index.html`
- `http://localhost:5173/guestbook.html`
- `http://localhost:5173/admin/comments/`

说明：纯 `python` 静态服务不会运行 `/api/*`，联调 Functions + D1 需要 Wrangler 本地模式。

移动端预览：
1. `F12`
2. `Ctrl + Shift + M` 开启设备模拟
3. 刷新页面查看移动端布局

## 9. 部署上线

推荐：GitHub + Cloudflare Pages（当前架构最匹配）。

原因：
- 现有项目已是静态站结构
- Pages Functions 与 D1 原生集成
- Turnstile 接入简单
- 成本低、维护成本可控

## 10. 页面与文件结构（与本次相关）

- 留言前台页面：`guestbook.html`
- 留言前台脚本：`assets/js/guestbook.js`
- 留言样式：`assets/css/diary.css`
- 管理后台页面：`admin/comments/index.html`
- 管理后台脚本：`assets/js/admin-comments.js`
- 后端 API：`functions/api/*`
- 后端公共逻辑：`functions/_lib/*`
- 默认头像资源：`assets/images/avatar-default.svg`

## 11. 当前已实现与后续扩展

已实现：
- 真实留言写入 D1
- Turnstile 校验
- 审核 / 删除 / 回复 / 状态管理
- 单管理员会话登录
- 公共端不暴露联系方式
- 后端统一头像生成与前端失败回退
- 留言板独立长页面模式

后续可扩展：
- 敏感词库与自动审核策略
- 邮件通知（新留言提醒）
- 帖子评论直接复用同一 API（`page_key=post:<id>`）
- 更细粒度风控与审计日志
