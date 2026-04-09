import { linkify, loadEntries, loadSiteConfig, renderMockComments, setupSplash } from "./common.js";

function renderEntry(entry, config) {
  const title = document.getElementById("entry-title");
  const body = document.getElementById("entry-body");
  const comments = document.getElementById("comment-box");
  const hint = document.getElementById("comment-setup-hint");

  title.textContent = entry.title;

  const images = entry.images.length
    ? `<div class="post-media">${entry.images.map((url) => `<img src="${url}" alt="${entry.title}" loading="lazy" />`).join("")}</div>`
    : "";

  body.innerHTML = `
    <p class="entry-meta"><span>${entry.date}</span><span>${entry.mood}</span></p>
    ${images}
    <div class="chips">${entry.tags.map((tag) => `<a class="chip" href="tags.html?tag=${encodeURIComponent(tag)}">#${tag}</a>`).join("")}</div>
    ${entry.content.map((line) => `<p>${linkify(line)}</p>`).join("")}
  `;

  comments.innerHTML = '<ul id="entry-mock-comments" class="comment-list compact"></ul>';
  renderMockComments(document.getElementById("entry-mock-comments"), config.comments?.entryMock || [], 10);

  hint.textContent = "当前评论功能暂未真实启用，这里仅保留评论区展示空间。";
}

async function main() {
  setupSplash();

  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");

  const [entries, config] = await Promise.all([loadEntries(), loadSiteConfig()]);
  const entry = entries.find((item) => item.id === id);

  if (!entry) {
    throw new Error("没有找到这篇日记，可以先回到首页看看最近记录。");
  }

  renderEntry(entry, config);
}

main().catch((error) => {
  const title = document.getElementById("entry-title");
  const body = document.getElementById("entry-body");
  title.textContent = "内容不可用";
  body.innerHTML = `<p class="subtle">${error.message}</p>`;
});
