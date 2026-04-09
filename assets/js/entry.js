import { linkify, loadEntries, loadSiteConfig, setupSplash } from "./common.js";

function renderEntry(entry) {
  const title = document.getElementById("entry-title");
  const body = document.getElementById("entry-body");

  title.textContent = entry.title;
  const tags = entry.tags
    .map((tag) => `<a class="chip" href="tags.html?tag=${encodeURIComponent(tag)}">#${tag}</a>`)
    .join("");

  body.innerHTML = `
    <p class="entry-meta">
      <span>${entry.date}</span>
      <span>${entry.mood}</span>
    </p>
    <div class="chips">${tags}</div>
    ${entry.content.map((line) => `<p>${linkify(line)}</p>`).join("")}
  `;
}

async function mountComments({ entry, config }) {
  const setupHint = document.getElementById("comment-setup-hint");
  const serverURL = config.comments?.serverURL;

  if (!serverURL) {
    setupHint.textContent = "评论服务未配置，请先在 content/site.json 中填写 comments.serverURL。";
    return;
  }

  const cssUrl = "https://unpkg.com/@waline/client@v3/dist/waline.css";
  if (!document.querySelector(`link[href='${cssUrl}']`)) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = cssUrl;
    document.head.append(link);
  }

  const { init } = await import("https://unpkg.com/@waline/client@v3/dist/waline.mjs");

  init({
    el: "#comment-box",
    serverURL,
    path: `/entry/${entry.id}`,
    lang: "zh-CN",
    dark: false,
    requiredMeta: ["nick", "mail"],
    meta: ["nick", "mail", "link"],
    pageview: false,
    search: false,
    wordLimit: 500,
    uploadImage: false,
  });

  setupHint.textContent = "";
}

async function main() {
  setupSplash();

  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");

  const [entries, config] = await Promise.all([loadEntries(), loadSiteConfig()]);
  const entry = entries.find((item) => item.id === id);

  if (!entry) {
    throw new Error("没有找到这篇日记，可以先回到首页看看最近记录。 ");
  }

  renderEntry(entry);
  await mountComments({ entry, config });
}

main().catch((error) => {
  const title = document.getElementById("entry-title");
  const body = document.getElementById("entry-body");
  title.textContent = "内容不可用";
  body.innerHTML = `<p class="subtle">${error.message}</p>`;
});
