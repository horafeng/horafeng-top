# Notion 内容模型规划（note / article 双主线）

## 1. 目标与范围

本文件用于规划“Notion 写内容 -> 同步到当前博客”的统一模型。  
本轮只做规划与代码准备，不改现有业务行为，不推翻现有首页、留言板、评论系统、邮件提醒、头像、后台管理。

核心目标：

- 统一内容类型：`note` / `article`（可选 `notice`）
- 统一 Notion 字段规范
- 让“随笔有图 / 无图”由同步器自动识别，而不是人工打标
- 规划未来 article 的同步与展示路径

---

## 2. 为什么要分 note 和 article

当前前端主数据是 [`content/diaries.json`](/D:/Horafeng.top/content/diaries.json)，结构天然偏向短内容。  
但你已经明确有两类内容：

- `note`：短随笔、小记、日记，适合卡片流/时间流
- `article`：长文、教程、系统说明、技术总结，适合独立详情页

如果继续混在一个“日记结构”里，后续会出现：

- 长文在首页卡片流展示不自然
- 渲染规则越来越多分支
- 同步器与前端耦合加深，后续维护成本高

所以需要先把模型分层定清楚，再逐步接入。

---

## 3. Notion 新数据库字段建议（统一模型）

> 推荐新建一个 Notion 内容数据库，不沿用旧 NotionNext 逻辑。

| 字段 | Notion 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `title` | `Title` | 是 | 标题 |
| `slug` | `Rich text` | 是（发布内容） | 稳定 URL 标识 |
| `type` | `Select` | 是 | `note` / `article` / `notice` |
| `status` | `Status` | 是 | `draft` / `review` / `published` / `archived` |
| `summary` | `Rich text` | `article` 建议必填 | 摘要，列表页与搜索使用 |
| `tags` | `Multi-select` | 否 | 标签列表 |
| `category` | `Select` | 否 | 主分类 |
| `cover` | `Files & media` | 否 | 封面图（优先用于 article） |
| `published_at` | `Date` | 是（发布内容） | 排序与展示时间 |
| `featured` | `Checkbox` | 否 | 精选标记 |
| `pin` | `Checkbox` | 否 | 置顶标记 |

字段使用建议：

- `type` 决定前端渲染路线
- `status` 决定是否导出到线上
- `published_at` 作为统一排序时间，不再依赖 `id` 字符串排序

---

## 4. 你在 Notion 中怎么写 `note`（随笔）

`note` 最小必填：

- `title`
- `slug`
- `type = note`
- `status = published`
- `published_at`

建议同时填写：

- `tags`
- `summary`

图片放置建议（关键）：

- 图片直接插入正文作为 Notion 原生 `image` block
- 不建议只放在 `cover` 属性里

原因：

- 你要求“有图/无图”自动识别
- 自动识别最稳定方式是扫描正文 block，而不是依赖人工字段

---

## 5. 随笔有图/无图自动识别规则

## 5.1 不新增人工字段

不要求在 Notion 手工维护 `has_image` 或 `has_media`。

## 5.2 同步器识别来源

同步器扫描正文 block（含递归子 block）：

- 识别图片：`image`
- 扩展媒体：`image` / `video` / `file` / `pdf` / `embed` / `bookmark`

## 5.3 同步结果字段（供前端消费）

建议在同步产物中生成：

- `has_media`: boolean
- `media`: 媒体数组（含类型、URL、caption、顺序）
- `images`: 仅图片 URL 数组
- `cover`: 卡片封面（优先正文第一张图片，其次属性 cover）

前端判断“有图随笔 / 无图随笔”规则：

- `type === note` 且 `images.length > 0` -> 有图随笔
- `type === note` 且 `images.length === 0` -> 无图随笔

---

## 6. 你在 Notion 中怎么写 `article`（文章）

`article` 最小必填：

- `title`
- `slug`
- `type = article`
- `status = published`
- `summary`
- `published_at`

建议同时填写：

- `tags`
- `category`
- `cover`

正文建议使用 Notion 常规长文写法，后续同步支持：

- 标题层级、段落、引用、列表、代码块
- 图片、视频、链接、嵌入

---

## 7. article 未来接入路线（分阶段）

### 阶段 A（兼容当前站点）

- 同步器继续生成 `content/diaries.json` 兼容输出（仅 note）
- 不动首页/归档现有展示逻辑

### 阶段 B（引入统一索引）

- 新增 `content/content-index.json`（含 note/article/notice）
- 首页逐步切换到统一索引（先仍主要展示 note）

### 阶段 C（文章独立化）

- 新增文章详情数据：`content/articles/{slug}.json`
- 新增/完善文章详情页（推荐 `article.html?slug=...`）
- article 不再复用 note 弹层路线

---

## 8. 同步器建议输出结构

### 8.1 统一索引（建议）

示例：

```json
{
  "items": [
    {
      "id": "notion-page-id",
      "slug": "river-note",
      "type": "note",
      "status": "published",
      "title": "河边慢走，顺手记了三行",
      "summary": "下班后绕到河边...",
      "tags": ["日常", "散步"],
      "category": "生活",
      "cover": "https://...",
      "published_at": "2026-04-12T20:00:00+08:00",
      "featured": false,
      "pin": false,
      "has_media": true,
      "images": ["https://..."],
      "media": [
        {
          "kind": "image",
          "url": "https://...",
          "caption": "",
          "source": "body",
          "order": 0
        }
      ]
    }
  ]
}
```

### 8.2 现有前端兼容输出（建议继续保留）

- `content/diaries.json` 继续作为现有首页/归档/标签页输入
- 由同步器自动把 `note` 映射为旧结构

---

## 9. 这轮已做的代码准备（非破坏性）

已预留骨架目录：`scripts/notion-sync/`

- [content-model.js](/D:/Horafeng.top/scripts/notion-sync/content-model.js)
  - 内容类型常量
  - 状态常量
  - 字段元信息
  - note 展示推导辅助函数
- [notion-transform.js](/D:/Horafeng.top/scripts/notion-sync/notion-transform.js)
  - block 递归遍历
  - 媒体提取
  - note 媒体字段推导
  - 内容索引记录组装骨架

这些文件目前不接入现有运行链路，不影响线上行为。

---

## 10. 风险与约束（后续 AI 必看）

- 不要直接让前端在线请求 Notion 原始 API 作为渲染输入
- 不要跳过 `status` 过滤把 draft 直接发线上
- 不要把 article 强行塞进 note 弹层
- 不要只识别顶层 block，必须递归处理子 block
- 在首页/归档切换到新索引前，`content/diaries.json` 兼容层不要删

---

## 11. 一句话执行指南

如果你要发布一条随笔：填 `type=note`，图片直接放正文 `image` block；同步器自动识别有图/无图。  
如果你要发布一篇文章：填 `type=article`，写完整正文结构；后续走独立 article 列表与详情页。

