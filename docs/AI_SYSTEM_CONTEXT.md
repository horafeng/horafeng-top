# AI_SYSTEM_CONTEXT

## 文档目的

这份文档面向后续接手本项目的 AI / 开发者，不面向普通访客。

目标：

- 在不推翻现有架构的前提下，快速理解当前项目全貌
- 降低误改、联动漏改、数据库误操作、外部服务配置遗漏
- 在开始新开发前，先知道哪些地方是真实生效、哪些只是预留或 mock

注意：

- 本文基于当前仓库代码实际状态整理
- 如果文档与代码不一致，应以代码为准，并优先记录差异，不要直接重写现有实现

---

## 1. 项目整体定位

### 1.1 这个网站是什么

这是一个轻量个人博客 / 日记站，主要形态是：

- 首页为“日记流”卡片列表
- 点击首页帖子后，通过弹层查看详情，而不是跳转到传统文章详情页
- 站内另有一个独立长页面形式的留言板
- 留言板接入了真实评论系统、管理员审核后台、邮件提醒、退订、头像代理

它不是传统的前后端分离应用，也不是 React / Vue 单页应用，而是：

- 静态 HTML 页面
- 原生 JS 驱动交互
- Cloudflare Pages Functions 提供服务端接口
- Cloudflare D1 存评论数据

### 1.2 当前主要页面

当前仓库里可见的主要页面：

- `index.html`：首页 / 日记流主页面
- `guestbook.html`：留言板独立页面
- `entry.html`：单篇详情页，存在但当前更像备用 / 补充页
- `tags.html`：标签与归档筛选页，存在但不属于主视觉主路径
- `admin/comments/index.html`：后台评论管理页

### 1.3 技术架构

- 前端：原生 `HTML + CSS + JS`
- 样式主入口：`assets/css/diary.css`
- 前端脚本入口：
  - `assets/js/index.js`
  - `assets/js/guestbook.js`
  - `assets/js/entry.js`
  - `assets/js/tags.js`
  - `assets/js/admin-comments.js`
  - `assets/js/common.js`
- 后端：Cloudflare Pages Functions，目录为 `functions/`
- 数据库：Cloudflare D1，绑定名为 `COMMENTS_DB`
- 人机验证：Cloudflare Turnstile
- 邮件：Resend
- 头像外部来源：
  - Cravatar
  - Gravatar
  - QQ 头像源

### 1.4 当前部署方式

当前项目明显是按 Cloudflare Pages 部署设计的：

- `wrangler.toml.example` 中 `pages_build_output_dir = "."`
- 没有构建工具链，也没有前端打包步骤
- 静态文件直接从仓库根目录输出
- `functions/` 由 Cloudflare Pages Functions 自动接管
- D1 在 Cloudflare 侧绑定到 Pages 项目

结论：

- 当前部署方式不是 Node SSR，也不是需要打包的前端工程
- 实际上线依赖 Cloudflare Pages + D1 + Turnstile + Resend

---

## 2. 当前前端页面结构

### 2.1 首页

页面文件：

- `index.html`

依赖脚本：

- `assets/js/index.js`
- `assets/js/common.js`

依赖样式：

- `assets/css/diary.css`

当前作用：

- 展示日记流卡片
- 展示左侧个人信息栏
- 展示右侧标签 / 归档 / mock 评论预览
- 支持搜索
- 支持按 URL 参数筛选标签 / 归档
- 支持帖子弹层详情
- 支持页面转场、开屏动画、移动端抽屉、顶部导航折叠

当前跳转 / 打开方式：

- 顶部导航和左侧软导航可跳到 `guestbook.html`
- 标签 / 归档链接回到 `index.html?tag=...` 或 `index.html?archive=...`
- 帖子卡片默认不是跳转到 `entry.html`，而是在当前页打开弹层
- 如果 URL 上有 `?post=...`，首页会自动打开对应帖子弹层

已实现交互：

- 搜索过滤
- 帖子卡片点击或键盘回车打开详情弹层
- 图片轮播、键盘左右切换、滚轮切换、拖拽切换
- 移动端上滑关闭 / 返回关闭
- 页面切换前后转场
- 顶部导航滚动折叠和“返回顶部”

重要事实：

- 首页帖子详情里的“评论区”目前仍是 mock 数据，来源于 `content/site.json`
- 首页没有接真实评论 API

### 2.2 留言板页

页面文件：

- `guestbook.html`

依赖脚本：

- `assets/js/guestbook.js`
- `assets/js/common.js`

依赖样式：

- `assets/css/diary.css`

当前作用：

- 独立展示站内留言板
- 真实接入评论列表接口、提交接口、回复流程、Turnstile

当前跳转关系：

- 顶部导航 / 左侧软导航可回到 `index.html`
- 留言板自身是独立长页面，不是首页弹层

已实现交互：

- 折叠 / 展开留言表单
- 懒加载 Turnstile 脚本和验证码控件
- 发表评论
- 回复某条留言
- 评论树展示
- 评论 hover / active 状态
- 成功 toast 提示
- 默认头像回退

真实接口依赖：

- `GET /api/config`
- `GET /api/comments?page_key=guestbook`
- `POST /api/comments`

### 2.3 帖子 / 日记相关页

包括两个页面：

- `entry.html`
- `tags.html`

#### `entry.html`

页面文件：

- `entry.html`

依赖脚本：

- `assets/js/entry.js`
- `assets/js/common.js`

依赖样式：

- `assets/css/diary.css`

当前作用：

- 读取 `?id=...`
- 从 `content/diaries.json` 找到对应日记
- 渲染正文、配图、标签

已实现交互：

- 仅基础渲染
- 评论区仍是 mock 数据，来源于 `content/site.json`

重要事实：

- 该页没有接真实评论 API
- 该页没有启用首页 / 留言板那套顶部导航、页面转场和站点 chrome
- 当前主线路的帖子详情更依赖首页弹层，而不是这个页面

#### `tags.html`

页面文件：

- `tags.html`

依赖脚本：

- `assets/js/tags.js`
- `assets/js/common.js`

依赖样式：

- `assets/css/diary.css`

当前作用：

- 展示标签列表
- 展示归档列表
- 根据 `?tag=` 或 `?archive=` 展示筛选结果

跳转关系：

- 标签 / 归档链接在本页内部继续筛选
- 筛选结果点击后跳转到 `entry.html?id=...`

重要事实：

- 标签页走的是“独立详情页”路线
- 首页走的是“弹层详情页”路线
- 这是一个明显的双路线并存状态，后续改动很容易只改到其中一条

### 2.4 后台评论管理页

页面文件：

- `admin/comments/index.html`

依赖脚本：

- `assets/js/admin-comments.js`

依赖样式：

- `assets/css/diary.css`

当前作用：

- 单管理员登录
- 查看评论列表
- 查看仅后台可见的联系方式
- 审核 / 退回待审 / 标记垃圾 / 软删除
- 管理员回复

真实接口依赖：

- `POST /api/admin/login`
- `POST /api/admin/logout`
- `GET /api/admin/comments`
- `PATCH /api/admin/comments`
- `DELETE /api/admin/comments`
- `POST /api/admin/comments`

重要事实：

- 后台页面默认尝试直接请求评论列表以判断是否已有登录态
- 未登录时才显示登录表单
- 管理员回复会直接写入 `comments` 表，且默认 `approved + is_admin = 1`

---

## 3. 当前全站布局体系

### 3.1 顶栏 / 导航栏结构

只有首页和留言板启用了统一顶栏系统，核心结构在 HTML 中的 `.site-nav`，交互逻辑在：

- `assets/js/common.js` -> `setupSiteChrome()`

顶栏结构包括：

- 左侧品牌链接 `.site-nav-left`
- 中间主导航 `.site-nav-center`
- 内容下拉菜单 `.site-nav-dropdown`
- 搜索按钮 `.site-nav-search`
- 折叠后的居中品牌按钮 `.site-nav-brand-mini`
- 折叠后的返回顶部按钮 `.site-nav-backtop`

行为：

- 桌面端滚动主内容区时，导航会进入 condensed 状态
- condensed 后主导航消失，只留中间品牌按钮
- 再次点击可切到“返回顶部”按钮
- 页面在最顶部时，导航是透明态
- 向下滚动后，导航切换为毛玻璃背景
- 首页桌面端额外有顶栏展开式搜索面板，点击搜索图标后在导航右侧展开

### 3.2 左栏 / 中栏 / 右栏逻辑

#### 首页

首页在大屏下是典型三栏：

- 左栏：个人信息面板 `#desktop-profile-panel`
- 中栏：主内容流 `.flow-panel`
- 右栏：标签 / 归档 / mock 评论侧栏 `#desktop-side-panel`

当前桌面端行为：

- 仍保留三栏结构
- 页面整体使用 `window` 滚动
- 左栏和右栏在滚动到导航下方后会 sticky 停住
- 中栏继续随页面向下展开
- 首页主内容壳层本身更透明，视觉重点放在每一张帖子卡片上
- 首页右栏不直接显示滚动条，而是用内部轨道随页面滚动逐步展示内容

#### 留言板

留言板在大屏下是两栏：

- 左栏：个人信息面板 `.guestbook-profile-panel`
- 主栏：留言板内容 `.guestbook-flow-panel`

留言板没有右栏。

#### 其他页面

- `entry.html`
- `tags.html`
- `admin/comments/index.html`

这三页都走 `.app-shell.single-column` 单列布局。

### 3.3 哪些页面使用相同布局

共享同一站点壳层逻辑的页面：

- `index.html`
- `guestbook.html`

共享单列简化布局的页面：

- `entry.html`
- `tags.html`
- `admin/comments/index.html`

### 3.4 哪些页面是独立长页面

独立长页面：

- `guestbook.html`
- `entry.html`
- `tags.html`
- `admin/comments/index.html`

首页 `index.html` 不是传统长文章页，而是流式卡片页 + 弹层详情。

### 3.5 固定栏、滚动逻辑、转场逻辑

固定 / 滚动逻辑关键点：

- 桌面端首页和留言板都保留较大的首屏上方留白（`--site-hero-gap`）
- 页面使用 `window` 滚动，而不是把桌面主滚动锁进 `.flow-panel`
- 首页左栏 / 右栏、留言板左栏在滚动时会 sticky 到导航栏下方
- 中栏继续跟随页面滚动展开后续内容
- 侧栏本身仍允许在高度不足时内部滚动
- 移动端仍保持普通页面滚动

页面转场逻辑：

- `assets/js/common.js` -> `setupPageTransition()`
- 只要是普通站内 `<a href>` 链接，默认会拦截并加离场 / 入场动画
- 该逻辑主要服务首页和留言板

开屏逻辑：

- `assets/js/common.js` -> `setupSplash()`
- 通过 `sessionStorage` 控制只在会话内首进时播放

### 3.6 当前视觉体系共用 CSS 入口

全站几乎所有页面都共用：

- `assets/css/diary.css`

这一个文件同时承载：

- 全局变量
- 首页卡片
- 首页弹层
- 留言板
- 后台评论管理
- 顶部导航
- 移动端抽屉
- Toast
- 动画与转场

结论：

- `assets/css/diary.css` 是高耦合核心文件
- 任何大改样式都可能同时影响首页、留言板、后台

---

## 4. 评论 / 留言系统结构

### 4.1 留言提交流程

真实前台入口只有留言板：

- 页面：`guestbook.html`
- 脚本：`assets/js/guestbook.js`

流程：

1. 前端先请求 `GET /api/config`
2. 获取 `turnstileSiteKey`、默认头像、默认提醒开关等配置
3. 用户展开表单时才加载 Turnstile 脚本
4. 提交时发送到 `POST /api/comments`
5. 服务端校验：
   - `nickname`
   - `contact`
   - `content`
   - `parent_id`
   - 频率限制
   - Turnstile
6. 服务端写入 `comments`
7. 根据 `COMMENTS_AUTO_APPROVE` 决定是 `approved` 还是 `pending`
8. 如果是“已通过的回复评论”，再触发邮件提醒逻辑

### 4.2 回复流程

前台回复：

- 在留言列表点击“回复”
- `guestbook.js` 会把目标评论 ID 写入隐藏字段 `guestbook-parent-id`
- 提交时把 `parent_id` 一并发给 `POST /api/comments`

后台回复：

- 后台评论卡片展开回复框
- `POST /api/admin/comments`
- 服务端自动以管理员身份写入：
  - `is_admin = 1`
  - `status = approved`
  - `contact = 'admin'`

### 4.3 审核流程

审核入口：

- 后台页面 `admin/comments/index.html`
- 接口 `PATCH /api/admin/comments`

支持状态：

- `pending`
- `approved`
- `deleted`
- `spam`

审核联动点：

- 如果一条“回复评论”从非 `approved` 状态改成 `approved`
- 会触发 `triggerReplyNotification()`

因此：

- 审核不仅仅是改状态
- 审核会影响邮件通知是否发送

### 4.4 邮件提醒流程

核心文件：

- `functions/_lib/comment-notify.js`
- `functions/_lib/mailer.js`

逻辑：

- 只有“回复评论”才可能触发邮件提醒
- 通知目标是父评论作者，不是整页订阅
- 联系方式是邮箱则直接发送
- 联系方式是 QQ 则转成 `${qq}@qq.com`
- 插入 `comment_reply_notifications` 作为去重和发送记录
- 发送失败不会阻断评论主流程

当前实现重点：

- 发送前会先 `INSERT OR IGNORE` 到通知记录表
- 利用唯一键 `(reply_comment_id, parent_comment_id)` 保证同一回复只触发一次

### 4.5 退订流程

入口：

- `functions/unsubscribe.js`
- 页面路径：`/unsubscribe?token=...`

逻辑：

- 查 `comments.unsubscribe_token`
- 找到对应原评论后，把该评论的 `notify_enabled` 改为 `0`
- 仅关闭这一条原评论的后续提醒
- 不影响用户其他评论的提醒状态

### 4.6 头像逻辑

前台公开评论头像：

- 前端不直接解析 `contact`
- 前台列表只使用 `/api/avatar/{commentId}`

后端头像代理：

- 文件：`functions/api/avatar/[id].js`
- 管理员评论：优先返回站内头像
- QQ：优先尝试 QQ 邮箱走 Cravatar，再尝试 QQ 头像源
- 邮箱：先 Cravatar，再 Gravatar SHA256
- 最终回退到站内默认头像池

前台默认头像回退：

- `guestbook.js` 也做了前端兜底
- 即便代理失败，仍可回退到默认 SVG

### 4.7 前台如何隐藏 contact

关键点：

- `GET /api/comments` 查询时虽然从数据库读了 `contact`
- 但返回前经过 `buildCommentTree(... includeContact: false)`
- 最终公开 JSON 不带联系方式
- 同时头像也通过代理路径暴露，不直接让前端拿到 contact 算头像

### 4.8 后台如何查看和管理评论

后台使用：

- `GET /api/admin/comments`

该接口会返回：

- `contact`
- `notify_enabled`
- `contact_email_resolved`
- `parent_nickname`
- `last_notified_at`

因此后台可以看到：

- 留言内容
- 联系方式
- 是否开启提醒
- 实际解析后的收件邮箱
- 是否是回复
- 当前状态

### 4.9 负责这些逻辑的 API / 文件

前台评论：

- `functions/api/comments.js`

后台评论管理：

- `functions/api/admin/comments.js`

后台登录登出：

- `functions/api/admin/login.js`
- `functions/api/admin/logout.js`

配置下发：

- `functions/api/config.js`

头像代理：

- `functions/api/avatar/[id].js`

退订：

- `functions/unsubscribe.js`

共用工具：

- `functions/_lib/comments-utils.js`
- `functions/_lib/comment-notify.js`
- `functions/_lib/mailer.js`
- `functions/_lib/admin-auth.js`

### 4.10 最容易误改的点

- 把留言板评论系统误认为“全站评论系统”
- 误以为首页 / `entry.html` 已接真实评论，实际它们仍是 mock / 预留
- 审核状态改动会联动邮件通知，不能只把它当普通字段更新
- 头像既有前端默认回退，也有后端代理链路，不能只改其中一层
- `contact` 不能直接在公开接口中放出去
- 评论树结构依赖 `parent_id + page_key + status`

---

## 5. 数据库结构（D1）

### 5.1 当前核心表

当前初始化脚本 `scripts/init-comments.sql` 建立了四张核心表：

- `comments`
- `admin_sessions`
- `comment_rate_limits`
- `comment_reply_notifications`

### 5.2 comments 表重要字段

核心字段：

- `id`
- `page_key`
- `parent_id`
- `nickname`
- `contact`
- `content`
- `status`
- `is_admin`
- `created_at`
- `updated_at`

评论系统扩展字段：

- `notify_enabled`
- `contact_email_resolved`
- `unsubscribe_token`
- `last_notified_at`
- `ip_hash`
- `user_agent`

字段含义要点：

- `page_key`：评论属于哪个页面 / 逻辑区域，当前真实使用值主要是 `guestbook`
- `parent_id`：树状回复关系
- `contact`：原始联系方式，只允许后台和服务端使用
- `status`：审核状态，不是物理删除
- `is_admin`：是否为管理员 / 博主回复
- `notify_enabled`：是否允许继续收到这条原评论的回复提醒
- `contact_email_resolved`：把邮箱或 QQ 统一解析为可发信地址
- `unsubscribe_token`：单条评论退订令牌
- `last_notified_at`：最后一次成功提醒时间

### 5.3 新增的通知相关字段

相比旧评论库，通知相关扩展字段是：

- `notify_enabled`
- `contact_email_resolved`
- `unsubscribe_token`
- `last_notified_at`

### 5.4 comment_reply_notifications 的作用

这张表不是评论表，而是“回复通知发送记录表”，作用有三层：

- 去重：避免同一条回复给同一父评论重复发邮件
- 留痕：记录发送成功 / 失败状态
- 排障：保留 provider、message id、error_message、attempt_count

关键约束：

- `UNIQUE(reply_comment_id, parent_comment_id)`

这意味着：

- 后续 AI 不要绕开这张表自己补发，否则很容易破坏当前“一次回复只通知一次”的设计

### 5.5 迁移脚本有哪些

- `scripts/init-comments.sql`
- `scripts/migrate-notify.sql`
- `scripts/seed-comments.sql`

### 5.6 初始化脚本有哪些

新库初始化：

- `scripts/init-comments.sql`

示例数据：

- `scripts/seed-comments.sql`

旧库升级邮件通知能力：

- `scripts/migrate-notify.sql`

### 5.7 新库和旧库的区别

新库：

- 已包含完整评论系统字段
- 已包含管理员会话表
- 已包含频率限制表
- 已包含回复通知表

旧库：

- 至少缺少邮件通知相关字段和通知记录表
- 需要跑 `migrate-notify.sql`

非常重要：

- `migrate-notify.sql` 只适合“已有旧评论库，补通知能力”
- 它不是全量初始化脚本
- 它使用 `ALTER TABLE ... ADD COLUMN`
- 一般只能对未迁移过的旧库执行一次

### 5.8 以后改数据库最容易踩的坑

- 把新库误当旧库去跑 `migrate-notify.sql`
- 修改 `comments` 表字段后忘记同步：
  - `functions/api/comments.js`
  - `functions/api/admin/comments.js`
  - `functions/_lib/comment-notify.js`
  - SQL 初始化脚本
  - 迁移脚本
- 忘记维护 `status` 枚举合法值
- 误删 / 绕过 `comment_reply_notifications` 唯一约束，导致重复发信
- 误以为 `deleted` 是硬删除，实际当前是软删除
- 更改 `page_key` 规则后没有同步前端和邮件跳转逻辑

---

## 6. Cloudflare / 外部服务配置

### 6.1 当前依赖的外部服务

必须或核心依赖：

- Cloudflare Pages
- Cloudflare Pages Functions
- Cloudflare D1
- Cloudflare Turnstile

按功能需要启用的依赖：

- Resend

运行时外部头像源：

- Cravatar
- Gravatar
- QQ 头像接口

### 6.2 哪些是必须配置的

评论系统要工作，至少必须有：

- Cloudflare Pages Functions 可用
- D1 已绑定到 `COMMENTS_DB`
- D1 表结构已初始化

留言提交在默认安全模式下要工作，还必须有：

- `TURNSTILE_SITE_KEY`
- `TURNSTILE_SECRET_KEY`

邮件提醒要工作，还必须有：

- `MAIL_PROVIDER=resend`
- `MAIL_API_KEY`
- `MAIL_FROM`
- 建议配置 `SITE_BASE_URL`

后台登录要工作，还必须有：

- `ADMIN_PASSWORD`

### 6.3 核心环境变量

评论 / 安全：

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

邮件：

- `SITE_BASE_URL`
- `MAIL_PROVIDER`
- `MAIL_API_KEY`
- `MAIL_FROM`
- `MAIL_REPLY_TO`

额外说明：

- `.env.example` 里有 `ADMIN_EMAIL_NAME`
- 当前代码中基本未实际使用这个变量
- 这是一个命名存在但实现未消费的点，后续 AI 不要默认它已经接入

### 6.4 变量缺失会导致什么问题

- 缺 `COMMENTS_DB`：所有评论 / 管理接口都会报错
- 缺 `ADMIN_PASSWORD`：后台无法登录
- 缺 `TURNSTILE_SECRET_KEY` 且未开启 bypass：评论提交失败
- 缺 `TURNSTILE_SITE_KEY`：前端拿不到验证码控件，用户无法正常完成验证
- `TURNSTILE_SITE_KEY` 和 `TURNSTILE_SECRET_KEY` 只配一半：前后端会失配，留言提交会异常
- 缺 `MAIL_API_KEY` 或 `MAIL_FROM`：评论和回复仍可成功，但邮件通知会失败并写入失败记录
- 缺 `SITE_BASE_URL`：邮件链接会退回用当前请求 origin 组装，线上通常可用，但不利于稳定和明确

### 6.5 D1 绑定名是什么

- `COMMENTS_DB`

### 6.6 Turnstile 用在什么位置

只看到真实使用在：

- `guestbook.html` 的留言表单
- 前端脚本：`assets/js/guestbook.js`
- 服务端校验：`functions/api/comments.js`

首页、`entry.html`、后台登录都没有用 Turnstile。

### 6.7 邮件服务如何接入

当前邮件发送实现只适配：

- Resend

发送入口：

- `functions/_lib/mailer.js`

评论回复通知调用链：

- `triggerReplyNotification()` -> `sendTransactionalMail()`

### 6.8 Resend 的角色

Resend 的角色是：

- 负责真正发出“评论回复提醒邮件”
- 返回 provider message id，写入 `comment_reply_notifications`

它不负责：

- 评论存储
- 用户管理
- 订阅列表管理

### 6.9 哪些配置在 Cloudflare Pages 上填

需要在 Cloudflare Pages / Pages Functions 环境里配置：

- 所有环境变量
- D1 绑定
- Functions 部署

### 6.10 哪些配置在外部平台上做

需要在外部平台配置：

- Turnstile：创建站点并获取 site key / secret key
- Resend：创建 API key，配置并验证发信域名 / 发信地址

---

## 7. 当前已经实现的重要能力

以下能力已经完成，不应轻易破坏：

- 首页日记流卡片展示与帖子详情弹层
- 首页帖子多图轮播、拖拽、键盘控制、移动端关闭手势
- 首页与留言板共用的顶部导航折叠逻辑
- 页面切换转场与开屏动画
- 留言板独立页面，不是首页弹层
- 留言板真实评论加载
- 留言提交
- 留言回复
- 评论树展示
- 管理员后台登录
- 管理员审核、待审、垃圾标记、软删除
- 管理员回复并以博主身份显示
- 前台不暴露联系方式
- QQ / 邮箱联系方式统一支持
- QQ / 邮箱头像逻辑
- 站内默认头像池回退
- 管理员头像优先站内头像
- Turnstile 接入留言提交链路
- 评论限流
- 回复邮件提醒
- 单条评论退订
- 回复提醒去重记录

需要特别强调的“不能误判”为未实现的能力：

- 留言板评论系统是真实可用的
- 后台审核与回复是真实可用的
- 邮件提醒与退订链路是真实可用的

需要特别强调的“目前仍不是全站真实启用”的能力：

- 首页帖子评论区仍是 mock
- `entry.html` 评论区仍是 mock
- `content/site.json` 中 `comments.enabled = false` 只反映首页 / 详情 mock 区，不代表留言板已关闭

---

## 8. 当前系统中的高风险区域

### 8.1 高风险文件

- `assets/css/diary.css`
- `assets/js/common.js`
- `assets/js/index.js`
- `assets/js/guestbook.js`
- `functions/api/comments.js`
- `functions/api/admin/comments.js`
- `functions/_lib/comments-utils.js`
- `functions/_lib/comment-notify.js`
- `functions/api/avatar/[id].js`
- `scripts/init-comments.sql`
- `scripts/migrate-notify.sql`

### 8.2 哪些逻辑是联动的

评论系统联动链：

- `guestbook.html`
- `assets/js/guestbook.js`
- `functions/api/config.js`
- `functions/api/comments.js`
- `functions/_lib/comments-utils.js`
- `functions/api/avatar/[id].js`

审核与通知联动链：

- `admin/comments/index.html`
- `assets/js/admin-comments.js`
- `functions/api/admin/comments.js`
- `functions/_lib/comment-notify.js`
- `functions/_lib/mailer.js`
- `scripts/init-comments.sql`
- `scripts/migrate-notify.sql`

布局与滚动联动链：

- `index.html`
- `guestbook.html`
- `assets/js/common.js`
- `assets/css/diary.css`
- `window` 滚动与 sticky 侧栏是联动的，改其中一处要一起看

首页帖子详情联动链：

- `index.html`
- `assets/js/index.js`
- `content/diaries.json`
- `content/site.json`

### 8.3 哪些功能看似独立，实际会互相影响

- 评论审核状态和邮件提醒不是独立功能，审核通过会触发提醒
- 头像展示和 contact 隐私不是独立功能，头像来源依赖 contact，但前台不能暴露 contact
- 顶部导航折叠、`window` 滚动、sticky 侧栏是联动的，改滚动容易把导航逻辑改坏
- 首页帖子详情弹层和 `entry.html` 虽然表面是两套详情页，但都依赖 `content/diaries.json`
- `content/site.json.comments.*` 只影响 mock 展示，不等于真实评论系统开关

### 8.4 哪些代码不能随便重写

- `functions/_lib/comment-notify.js`
  - 它负责通知触发条件、退订 token、页面标题解析、发送去重
- `functions/api/comments.js`
  - 它是前台留言提交主入口，校验、限流、审核、通知都在这里串起来
- `functions/api/admin/comments.js`
  - 审核和管理员回复都在这里，改错会影响后台和通知链路
- `functions/api/avatar/[id].js`
  - 这是“前台不暴露 contact”策略的一部分，不是普通图片接口
- `assets/js/common.js`
  - 控制顶部导航、页面转场、开屏动画、滚动目标，影响首页和留言板
- `assets/css/diary.css`
  - 既管首页也管留言板也管后台，是明显的大一统样式文件

### 8.5 如果要改，应该先检查哪些文件

如果要改留言 / 评论：

- `guestbook.html`
- `assets/js/guestbook.js`
- `functions/api/comments.js`
- `functions/_lib/comments-utils.js`
- `functions/api/avatar/[id].js`

如果要改后台审核 / 回复：

- `admin/comments/index.html`
- `assets/js/admin-comments.js`
- `functions/api/admin/comments.js`
- `functions/_lib/admin-auth.js`
- `functions/_lib/comment-notify.js`

如果要改页面布局 / 导航 / 滚动：

- `index.html`
- `guestbook.html`
- `assets/js/common.js`
- `assets/css/diary.css`

如果要改数据库：

- `scripts/init-comments.sql`
- `scripts/migrate-notify.sql`
- 以及所有读写该表的 Functions

### 8.6 当前已观察到的不一致 / 潜在问题

以下问题目前先记录，不主动修：

- 首页 / `entry.html` 的评论区仍是 mock，但项目又已经有真实评论系统，容易让后续 AI 误判哪些页面已经接通
- `tags.html` -> `entry.html` 走独立详情页，而首页走弹层详情页，内容入口路线不统一
- `content/site.json.comments.enabled = false` 与留言板真实评论系统并存，语义容易误导后续维护者
- `entry.html` 和 `tags.html` 没有接入首页 / 留言板的站点顶栏体系，体验与主线路不一致
- 首页桌面端目前依赖“大首屏留白 + sticky 左右栏 + 中栏透明壳层”的组合效果，后续不要单独删掉其中一环
- `.env.example` 中存在 `ADMIN_EMAIL_NAME`，但当前代码里基本未实际使用
- `migrate-notify.sql` 是一次性迁移脚本，不适合重复执行，后续如果不了解现状容易误跑
- 退订成功页对非留言板评论只回到 `index.html`，不是特定帖子链接

---

## 9. 后续 AI 必读规则

### 9.1 架构规则

- 不要推翻现有架构
- 不要把原生静态页强行整体改成 SPA / 框架化
- 不要在没有明确要求时重构 `assets/css/diary.css` 为多文件体系
- 不要在没有明确要求时重写评论系统

### 9.2 修改策略

- 优先增量修改
- 尽量沿用现有页面结构、命名、接口路径和数据流
- 先确认“当前真实生效路径”再改，不要只看文件名猜测

### 9.3 修改前先读哪些文件

做任何页面改动前，至少先读：

- `index.html`
- `guestbook.html`
- `assets/js/common.js`
- `assets/css/diary.css`

做任何评论系统改动前，至少先读：

- `assets/js/guestbook.js`
- `functions/api/comments.js`
- `functions/api/admin/comments.js`
- `functions/_lib/comments-utils.js`
- `functions/_lib/comment-notify.js`
- `functions/api/avatar/[id].js`

### 9.4 涉及评论系统必须检查哪些文件

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

### 9.5 涉及页面布局必须检查哪些文件

- `index.html`
- `guestbook.html`
- `assets/js/common.js`
- `assets/js/index.js`
- `assets/css/diary.css`

### 9.6 涉及数据库必须先确认是 init 还是 migrate

必须先判断：

- 这是新建库，还是已有旧库升级

规则：

- 新建库：看 `scripts/init-comments.sql`
- 旧库升级：看 `scripts/migrate-notify.sql`

不要：

- 对新库误跑 migrate
- 对旧库只改代码不补 migration

### 9.7 涉及外部服务必须检查环境变量与绑定

必须检查：

- `COMMENTS_DB` 是否已绑定
- Turnstile 前后端 key 是否成对配置
- `ADMIN_PASSWORD` 是否存在
- Resend 所需变量是否齐全
- `SITE_BASE_URL` 是否正确

### 9.8 改完后应该做哪些自检

至少自检：

- 首页是否还能正常打开帖子弹层
- 首页导航折叠 / 返回顶部是否仍工作
- 留言板是否还能加载评论
- 留言提交是否仍可成功 / 正确报错
- 回复按钮是否仍能写入 `parent_id`
- 后台是否仍能登录
- 后台审核 / 删除 / 回复是否仍工作
- 前台是否仍然不暴露 `contact`
- 头像是否仍能正常回退
- 如果动了数据库或通知逻辑，是否仍然避免重复发信

---

## 10. 项目文件索引

### 10.1 页面入口

- `index.html`
  - 首页 / 日记流 / 帖子弹层入口
- `guestbook.html`
  - 留言板真实前台入口
- `entry.html`
  - 单篇详情页，当前更像补充路线
- `tags.html`
  - 标签与归档筛选页
- `admin/comments/index.html`
  - 后台评论管理页

### 10.2 前端核心脚本

- `assets/js/common.js`
  - 站点公共逻辑：内容加载、转义、搜索、开屏、页面转场、顶部导航、滚动行为
- `assets/js/index.js`
  - 首页卡片流、弹层详情、多图查看、移动端手势、左侧资料抽屉
- `assets/js/guestbook.js`
  - 留言板前端：加载配置、加载评论、表单提交、回复、Turnstile、toast、头像回退
- `assets/js/entry.js`
  - 独立详情页渲染，当前评论仍是 mock
- `assets/js/tags.js`
  - 标签与归档页渲染，并跳转到独立详情页
- `assets/js/admin-comments.js`
  - 后台登录、评论列表、审核、删除、回复

### 10.3 样式核心文件

- `assets/css/diary.css`
  - 全站视觉主入口，也是高风险样式文件

### 10.4 内容数据

- `content/site.json`
  - 站点资料、首页 mock 评论、详情页 mock 评论
- `content/diaries.json`
  - 日记内容主数据源
- `content/diary-entry.template.json`
  - 新日记模板

### 10.5 后端 API

- `functions/api/config.js`
  - 给前端下发 Turnstile key、头像默认值、默认提醒开关
- `functions/api/comments.js`
  - 前台评论读取与提交主接口
- `functions/api/admin/comments.js`
  - 后台评论管理主接口
- `functions/api/admin/login.js`
  - 管理员登录
- `functions/api/admin/logout.js`
  - 管理员退出
- `functions/api/avatar/[id].js`
  - 头像代理和头像回退
- `functions/unsubscribe.js`
  - 单条评论邮件退订页面

### 10.6 后端公共模块

- `functions/_lib/comments-utils.js`
  - 输入清洗、状态校验、Turnstile 校验、限流、头像 URL 生成、评论树构建等基础能力
- `functions/_lib/comment-notify.js`
  - 回复提醒、退订 token、页面标题解析、通知记录写入
- `functions/_lib/mailer.js`
  - Resend 发送封装
- `functions/_lib/admin-auth.js`
  - 管理员 cookie session

### 10.7 数据库与脚本

- `scripts/init-comments.sql`
  - 新库初始化
- `scripts/migrate-notify.sql`
  - 旧库迁移到通知版
- `scripts/seed-comments.sql`
  - 示例评论数据
- `scripts/add-diary.ps1`
  - 追加日记内容到 `content/diaries.json`

### 10.8 环境与部署说明

- `.env.example`
  - 环境变量参考
- `wrangler.toml.example`
  - D1 绑定和 Pages 输出目录示例
- `README.md`
  - 当前项目说明，内容和本文件有较高重叠

---

## 11. 后续接手本项目的 AI，开始写代码前必须先完成的检查清单

- [ ] 先确认这次要改的是首页、留言板、独立详情页、标签页，还是后台页
- [ ] 先确认相关功能是真实链路还是 mock / 预留链路
- [ ] 先读对应入口 HTML、对应 JS、`assets/js/common.js`、`assets/css/diary.css`
- [ ] 如果涉及评论，先读 `functions/api/comments.js`、`functions/api/admin/comments.js`、`functions/_lib/comment-notify.js`
- [ ] 如果涉及数据库，先确认这是新库初始化问题还是旧库迁移问题
- [ ] 如果涉及外部服务，先检查 `COMMENTS_DB`、Turnstile、Resend、`SITE_BASE_URL`
- [ ] 如果涉及公开评论数据，确认没有把 `contact` 暴露到前台
- [ ] 如果涉及审核状态，确认是否会连带影响邮件提醒
- [ ] 如果涉及头像，确认前端回退和后端代理两层都没有被破坏
- [ ] 修改完成后至少手动检查：首页弹层、留言加载、留言提交、后台登录、后台审核 / 回复
