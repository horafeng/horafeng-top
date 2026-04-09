# HoraFeng 日记专区（迭代版）

本项目保持轻量静态结构，在原有基础上持续迭代，不做重后台。

## 一、当前目录与职责

- 日记文案数据：`content/diaries.json`
- 站点资料配置：`content/site.json`
- 日记图片素材目录：`assets/images/diary/`
- 页面样式：`assets/css/diary.css`
- 页面脚本：`assets/js/*.js`

推荐你后续长期遵循：

- 文案只改 `content/diaries.json`
- 站点名片只改 `content/site.json`
- 图片只放 `assets/images/diary/`

## 二、日记数据结构（支持无图 / 单图 / 多图）

每条日记核心字段：

```json
{
  "id": "YYYY-MM-DD-your-slug",
  "date": "YYYY-MM-DD",
  "mood": "🙂",
  "title": "标题",
  "tags": ["标签1", "标签2"],
  "images": [
    "assets/images/diary/cover-01.jpg",
    "assets/images/diary/cover-02.jpg"
  ],
  "content": [
    "第一段文案",
    "第二段文案",
    "链接：https://example.com"
  ]
}
```

写法说明：

- 无图：`"images": []`
- 单图：`"images": ["assets/images/diary/xxx.jpg"]`
- 多图：`"images": ["assets/images/diary/a.jpg", "assets/images/diary/b.jpg"]`

模板文件：`content/diary-entry.template.json`

## 三、你最简单的维护工作流

1. 把新图片放入 `assets/images/diary/`
2. 打开 `content/diaries.json`
3. 复制一条旧日记，改 `id/date/title/tags/content/images`
4. 刷新页面检查展示

你也可以用脚本快速新增：

```powershell
.\scripts\add-diary.ps1 -Title "雨后散步" -Mood "🙂" -Tags "日常,夜晚" -Content "第一段|第二段|链接 https://example.com" -Images "assets/images/diary/a.jpg,assets/images/diary/b.jpg"
```

## 四、本地运行与手机预览

### 本地运行

```bash
python -m http.server 5173
```

打开：`http://localhost:5173/index.html`

### 手机端预览

1. 按 `F12`
2. 按 `Ctrl + Shift + M` 开启设备模拟
3. 选择 iPhone/Android 设备
4. 刷新页面后测试帖子打开动画与滑动

## 五、当前评论状态

当前评论功能仍是**前端占位**：

- 右侧“近期评论”展示本地模拟数据
- 帖子详情评论区展示本地模拟评论
- 未接 Waline、未接数据库、未接后端

## 六、推荐部署方式（适合当前项目）

因为当前是纯静态站，最适合：

1. GitHub + Cloudflare Pages
2. Vercel
3. Netlify

这些方案都适合原因：

- 零后端依赖
- 部署快
- 成本低
- 回滚和持续更新方便

建议你优先 Cloudflare Pages 或 Vercel，后续如恢复真实评论，再补服务端即可。
