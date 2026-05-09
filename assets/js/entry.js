import { linkify, loadEntries, setupPageTransition, setupSiteChrome, setupSplash } from "./common.js?v=f6e0c5dd3d";
import { mountContentComments } from "./content-comments.js";

function renderEntry(entry) {
  const title = document.getElementById("entry-title");
  const body = document.getElementById("entry-body");
  const comments = document.getElementById("comment-box");

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

  comments.innerHTML = '<section id="entry-comments-host" class="post-comments-host"></section>';
  mountContentComments({
    container: document.getElementById("entry-comments-host"),
    pageKey: `note:${entry.id}`,
    mode: "note",
  });
}

async function main() {
  setupSplash();
  setupPageTransition();
  setupSiteChrome({
    scrollContainerSelector: ".flow-panel",
    useWindowScroll: true,
  });

  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  const entries = await loadEntries();
  const entry = entries.find((item) => item.id === id);

  if (!entry) {
    throw new Error("没有找到这篇日记，可以先回到首页看看最近记录。");
  }

  renderEntry(entry);
}

main().catch((error) => {
  const title = document.getElementById("entry-title");
  const body = document.getElementById("entry-body");
  title.textContent = "内容不可用";
  body.innerHTML = `<p class="subtle">${error.message}</p>`;
});
