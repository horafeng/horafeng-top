# HoraFeng 日记专区（第二阶段增强版）

本项目已在第一阶段基础上完成第二阶段迭代，保留原目录结构并做最小侵入升级。

## 1. 本地运行

```bash
python -m http.server 5173
```

打开：`http://localhost:5173/index.html`

## 2. 第二阶段已实现内容

- 移动端中部优先：默认先看到日记流
- 移动端左右侧栏改为侧页：可按钮切换，也可左右滑动切换
- 桌面端保留三栏：左资料 / 中日记 / 右功能
- 平板端过渡布局：主栏 + 右栏并行，左资料卡上置
- 首页搜索：按标题、正文、标签模糊匹配
- 右栏顺序：标签预览 -> 归档预览 -> 近期评论
- 左栏升级为可配置个人资料卡
- 详情页接入真实可维护评论系统入口（Waline）
- 全站 Splash Screen（HoraFeng 文本标志，淡入淡出 + 轻缩放）

## 3. 如何查看手机端效果

以 Chrome 为例：

1. 打开 `http://localhost:5173/index.html`
2. 按 `F12`
3. 点击设备切换按钮（或按 `Ctrl + Shift + M`）
4. 选择手机型号（如 iPhone 14 Pro）
5. 刷新页面，观察移动端默认中栏体验

移动端首页交互：

- 默认停留在“日记”中栏
- 顶部按钮可切换：`资料 / 日记 / 功能`
- 可在首页左右滑动进入左右侧页

## 4. 如何手动新增日记

当前数据源：`content/diaries.json`

### 4.1 标准手动流程

1. 打开 `content/diaries.json`
2. 复制一条已有条目并修改字段
3. 确保 `id` 全局唯一（建议格式：`YYYY-MM-DD-your-slug`）
4. 保存后刷新页面

### 4.2 数据结构模板

模板文件：`content/diary-entry.template.json`

```json
{
  "id": "YYYY-MM-DD-your-slug",
  "date": "YYYY-MM-DD",
  "mood": "🙂",
  "title": "今天的标题",
  "tags": ["标签1", "标签2"],
  "content": [
    "第一段文字。",
    "第二段文字。",
    "可以放链接：https://example.com"
  ]
}
```

### 4.3 轻量维护方案（无需后端）

已提供脚本：`scripts/add-diary.ps1`

示例：

```powershell
.\scripts\add-diary.ps1 -Title "散步后的晚风" -Mood "🙂" -Tags "日常,夜晚" -Content "第一段|第二段|链接 https://example.com"
```

说明：

- `Tags` 用英文逗号 `,` 分隔
- `Content` 用 `|` 分段
- 脚本会自动生成 `id` 并写回 `content/diaries.json`

## 5. 评论系统技术路线（真实可维护）

### 5.1 当前采用方案

采用 **Waline** 评论系统（静态博客友好、成本低、可持续维护）。

选择原因：

- 适合个人博客，不需要一开始自建重后台
- 与静态站点集成轻量
- 部署门槛低（可配合 Vercel/Netlify + Waline Server）
- 支持后续扩展，便于长期维护
- 支持评论管理、删除、回复等运营能力

### 5.2 访客如何发表评论

在 `entry.html` 详情页下方留言区发表评论。

当前前端要求：

- 必填：昵称（nick）
- 必填：联系方式（mail）

未填写这两项将不能提交（由 Waline `requiredMeta` 约束）。

### 5.3 博主如何删除评论、回复评论

部署并配置 Waline 管理后：

- 查看评论：Waline 管理界面
- 删除违规评论：Waline 管理界面删除
- 回复评论：在 Waline 评论交互中回复

### 5.4 你需要补的配置项

编辑：`content/site.json`

```json
{
  "comments": {
    "provider": "waline",
    "serverURL": "https://your-waline-server.example.com"
  }
}
```

同时可配置左栏个人信息：

- `profile.avatar`
- `profile.name`
- `profile.signature`
- `profile.lastSeenAt`
- `profile.email`
- `profile.im.label`
- `profile.im.url`

### 5.5 上线部署注意事项（评论相关）

1. 先部署 Waline Server
2. 配置 Waline 的存储（MongoDB/LeanCloud 等）
3. 配置 Waline 管理员身份
4. 将 `content/site.json` 的 `comments.serverURL` 填为线上地址
5. 重新部署静态站点

如果 `serverURL` 为空，前端会显示“评论服务未配置”提示，不会报错中断。

## 6. 目录结构（保持原结构升级）

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
.gitignore
README.md
```
