# AI_QUICK_START

## 项目是什么

这是一个部署在 Cloudflare Pages 上的个人日记 / 博客站。

当前形态不是前端框架项目，而是：

- 静态 HTML 页面
- 原生 JS 负责交互
- Cloudflare Pages Functions 提供后端接口
- Cloudflare D1 存评论数据

当前最重要的事实：

- `index.html` 是首页日记流，帖子详情主要走弹层，不是传统详情页
- `guestbook.html` 是独立留言板页面，且它接的是**真实评论系统**
- `entry.html` 和首页帖子详情里的评论区目前仍主要是 mock / 预留，不要误判为全站评论都已接通

---

## 关键文件看哪几个

先看这些：

- `index.html`
  - 首页结构
- `guestbook.html`
  - 留言板结构
- `assets/js/common.js`
  - 顶栏、转场、滚动、站点共用逻辑
- `assets/js/index.js`
  - 首页卡片流和帖子弹层
- `assets/js/guestbook.js`
  - 留言板前端逻辑
- `assets/css/diary.css`
  - 全站核心样式
- `functions/api/comments.js`
  - 前台评论读取与提交
- `functions/api/admin/comments.js`
  - 后台审核、删除、回复
- `functions/_lib/comment-notify.js`
  - 回复邮件提醒、退订、通知去重
- `functions/api/avatar/[id].js`
  - 头像代理，不让前台直接暴露联系方式

如果要看数据库，再补看：

- `scripts/init-comments.sql`
- `scripts/migrate-notify.sql`

---

## 改评论系统先检查什么

先确认你改的是哪一段：

- 留言板前台
- 后台审核 / 回复
- 邮件提醒
- 头像逻辑
- 数据库结构

动评论系统前至少先读：

- `guestbook.html`
- `assets/js/guestbook.js`
- `admin/comments/index.html`
- `assets/js/admin-comments.js`
- `functions/api/comments.js`
- `functions/api/admin/comments.js`
- `functions/_lib/comments-utils.js`
- `functions/_lib/comment-notify.js`
- `functions/unsubscribe.js`
- `functions/api/avatar/[id].js`

一定要记住：

- 当前真实评论系统主要跑在 `guestbook.html`
- 审核状态改动会影响邮件提醒
- 前台公开接口不能把 `contact` 暴露出去
- 头像逻辑和联系方式隐私是联动的，不要只改一半
- `comment_reply_notifications` 负责通知去重，不能随便绕开

---

## 改页面布局先检查什么

动布局前至少先读：

- `index.html`
- `guestbook.html`
- `assets/js/common.js`
- `assets/js/index.js`
- `assets/css/diary.css`

要先知道的几个事实：

- 首页和留言板共享同一套顶部导航和滚动逻辑
- `assets/js/common.js` 控制导航折叠、透明 / 毛玻璃切换、页面转场、主滚动行为和“返回顶部”按钮出现方式
- `assets/css/diary.css` 同时影响首页、留言板、后台，不是单页面样式文件
- 首页桌面端当前是“三栏可见 + 左右栏 sticky + 中栏继续滚动”的结构
- 首页桌面端还依赖“大首屏留白 + 中栏更透明、帖子卡片更显色”的组合效果
- 首页右栏如果内容过长，会自动回退为普通流式展示，避免内容被截断
- `entry.html` / `tags.html` 是另一套较简化的单列页面，不要只改首页后以为全站一致了

---

## 外部配置有哪些

核心依赖：

- Cloudflare Pages
- Cloudflare Pages Functions
- Cloudflare D1
- Cloudflare Turnstile
- Resend

关键环境变量：

- `COMMENTS_DB`
  - D1 绑定名，没配评论系统会直接报错
- `TURNSTILE_SITE_KEY`
- `TURNSTILE_SECRET_KEY`
  - 留言板提交验证码
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
  - 后台登录
- `COMMENTS_AUTO_APPROVE`
- `COMMENT_NOTIFY_DEFAULT`
- `COMMENT_RATE_LIMIT_PER_MINUTE`
- `IP_HASH_SALT`
  - 评论审核、提醒默认值、限流、安全相关
- `MAIL_PROVIDER`
- `MAIL_API_KEY`
- `MAIL_FROM`
- `MAIL_REPLY_TO`
- `SITE_BASE_URL`
  - 回复邮件提醒相关
- `DEFAULT_AVATAR_URL`
- `QQ_AVATAR_BASE_URL`
- `EMAIL_AVATAR_BASE_URL`
- `GRAVATAR_DEFAULT_MODE`
- `PUBLIC_AVATAR_SIZE`
  - 头像相关

外部平台上要配置的还有：

- Cloudflare Turnstile：创建站点并拿到 key
- Resend：创建 API key，并完成发信域名 / 发信地址验证

如果不想把事情搞砸，开始改之前先确认：

- 这是在改真实评论链路，还是 mock 展示
- 当前库是新库还是旧库
- 环境变量和 D1 绑定是不是齐全
