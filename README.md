# HoraFeng 日记专区（当前迭代版）

本项目继续基于原有结构迭代，没有推翻重做，仍是轻量静态维护方案。

## 1. 本地运行

```bash
python -m http.server 5173
```

打开：`http://localhost:5173/index.html`

## 2. 本轮重点升级

- Splash Screen 触发逻辑修正
- 右侧边栏压紧为连续信息流样式
- 左侧资料卡升级为更完整的个人主页卡片
- 手机端改为左侧抽屉，不再做整页横向轮播
- 右侧功能页在手机端取消，整合进主页面折叠区
- 帖子改为“小红书风格”详情弹层打开
- 日记数据结构支持图片（无图 / 单图 / 多图）
- 评论功能降级为本地占位展示（暂不接入 Waline）

## 3. Splash Screen 触发规则

当前逻辑：

- 第一次进入网站：播放 Splash
- 同一次访问内，点击界面、切换页面、打开帖子详情：不重复播放
- 只有刷新网页（reload）后：再次播放

实现方式：

- 通过 `sessionStorage` 记录是否播放过
- 仅在导航类型为 `reload` 时清理该标记

## 4. 评论状态（本轮暂缓真实接入）

当前评论功能 **未真实启用**。

现在仅保留：

- 帖子详情中的评论区域布局
- 右侧近期评论模块布局
- 本地模拟评论数据展示

后续若要接入 Waline 或其他评论服务，再单独开启。

## 5. 帖子打开方式（新）

### 桌面端

- 点击日记卡片后，打开居中详情弹层（非普通页面跳转）
- 背景列表弱化（遮罩 + 模糊）
- 详情层包含：图片区 + 文案 + 评论占位区
- 支持关闭方式：右上角关闭按钮 / 点击遮罩 / `Esc`

### 移动端

- 仍是一列日记流
- 点击后打开全屏底部弹出式详情层
- 单列纵向滚动阅读
- 支持右滑关闭（近似手势退出）

## 6. 手机端结构（新）

- 默认主视图：中间日记流
- 左侧资料区：改为覆盖式抽屉（类似 QQ 侧栏）
- 右侧功能页：取消独立侧页
- 标签、归档、近期评论：在手机端整合到主页面底部折叠区

## 7. 日记数据结构（支持图片）

数据源：`content/diaries.json`

每条日记新增字段 `images`：

- 无图：`"images": []`
- 单图：`"images": ["https://..."]`
- 多图：`"images": ["https://...", "https://..."]`

示例模板见：`content/diary-entry.template.json`

模板示例：

```json
{
  "id": "YYYY-MM-DD-your-slug",
  "date": "YYYY-MM-DD",
  "mood": "🙂",
  "title": "今天的标题",
  "tags": ["标签1", "标签2"],
  "images": [
    "https://example.com/image-1.jpg",
    "https://example.com/image-2.jpg"
  ],
  "content": [
    "第一段文字。",
    "第二段文字。",
    "可以放链接：https://example.com"
  ]
}
```

## 8. 如何新增一条带图日记

### 手动方式

1. 打开 `content/diaries.json`
2. 复制一条对象并修改字段
3. `images` 按需填 0~N 张图链接
4. 保证 `id` 唯一
5. 保存并刷新页面

### 脚本方式（轻量）

脚本：`scripts/add-diary.ps1`

```powershell
.\scripts\add-diary.ps1 -Title "雨后散步" -Mood "🙂" -Tags "日常,夜晚" -Content "第一段|第二段|链接 https://example.com" -Images "https://img1.jpg,https://img2.jpg"
```

说明：

- `Tags` 用英文逗号分隔
- `Content` 用 `|` 分段
- `Images` 用英文逗号分隔，可留空

## 9. 关键配置

配置文件：`content/site.json`

你可以在这里修改：

- 头像、头图、名称、@标识、签名、简介
- 最近来过时间
- 邮件按钮
- 即时消息按钮（标签和链接，可替换为 GitHub/X 等）
- 本地模拟评论内容

## 10. 目录结构（保持原项目形态）

```text
assets/
  css/diary.css
  js/common.js
  js/index.js
  js/entry.js
  js/tags.js
content/
  diaries.json
  diary-entry.template.json
  site.json
scripts/
  add-diary.ps1
index.html
entry.html
tags.html
README.md
```
