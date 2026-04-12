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
- `archive.html` 是正式归档页，走“单中轴时间线 + 左右交错卡片”布局，数据来自 `content/diaries.json`
- `guestbook.html` 是独立留言板页面，且它接的是**真实评论系统**
- `entry.html` 和首页帖子详情里的评论区目前仍主要是 mock / 预留，不要误判为全站评论都已接通
- Notion 新内容模型（`note`/`article`）规划见 `docs/NOTION_CONTENT_MODEL.md`，后续接 Notion 前先读它

---

## 关键文件看哪几个

先看这些：

- `index.html`
  - 首页结构
- `archive.html`
  - 归档页结构
- `guestbook.html`
  - 留言板结构
- `assets/js/common.js`
  - 顶栏、转场、滚动、站点共用逻辑
- `assets/js/index.js`
  - 首页卡片流和帖子弹层
- `assets/js/archive.js`
  - 归档时间线、搜索、标签筛选
- `assets/js/guestbook.js`
  - 留言板前端逻辑
- `assets/css/diary.css`
  - 全站核心样式
- `docs/NOTION_CONTENT_MODEL.md`
  - Notion 内容字段规范、自动识图规则、article 接入路线
- `scripts/notion-sync/content-model.js`
  - 内容类型/字段常量与基础推导函数骨架
- `scripts/notion-sync/notion-transform.js`
  - Notion block 递归扫描、媒体提取、内容记录转换骨架
- `scripts/notion-sync/sync-notion.js`
  - 第一版 Notion 同步入口，负责拉数据库、抓正文、写生成文件
- `scripts/notion-sync/notion-client.js`
  - Notion API 请求封装
- `scripts/notion-sync/fetch-database.js`
  - 数据库属性提取与字段标准化
- `scripts/notion-sync/fetch-page-blocks.js`
  - block 递归获取、标准化、正文文本提取
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
- `archive.html`
- `guestbook.html`
- `assets/js/common.js`
- `assets/js/index.js`
- `assets/js/archive.js`
- `assets/css/diary.css`

要先知道的几个事实：

- 首页和留言板共享同一套顶部导航和滚动逻辑
- 归档页也接入了同一套顶部导航、转场和 `window` 滚动逻辑
- `assets/js/common.js` 控制导航折叠、透明 / 毛玻璃切换、页面转场、主滚动行为和“返回顶部”按钮出现方式
- `assets/css/diary.css` 同时影响首页、留言板、后台，不是单页面样式文件
- 手机端首页现在额外有一套专用顶部栏；它只作用于 `index.html` 手机端，不要误以为全站手机端都改成了这一套
- 这条首页手机顶栏会在下滑浏览时隐藏、上滑时再次出现
- 手机端首页帖子弹层打开时会隐藏手机顶栏，并支持从左侧边缘向右滑动退出
- 归档页背景照片当前直接写在 `assets/css/diary.css` 的 `body[data-page="archive"] .bg-layer` 里；如果以后要换整体背景，优先改这里的背景 `url(...)`
- 归档页卡片点击后现在是在当前页直接弹出详情层，不再跳回首页
- 归档卡片封面优先取 `content/diaries.json` 的 `images[0]`；如果该条目本身无图，就直接渲染为纯文字卡片，不再补默认封面
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
