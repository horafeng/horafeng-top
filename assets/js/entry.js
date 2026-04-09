import { linkify, loadEntries } from "./common.js";

function renderEntry(entry) {
  const title = document.getElementById("entry-title");
  const body = document.getElementById("entry-body");

  title.textContent = entry.title;
  const tags = entry.tags.map((tag) => `<a class="chip" href="tags.html?tag=${tag}">#${tag}</a>`).join("");

  body.innerHTML = `
    <p class="entry-meta">
      <span>${entry.date}</span>
      <span>${entry.mood}</span>
    </p>
    <div class="chips">${tags}</div>
    ${entry.content.map((line) => `<p>${linkify(line)}</p>`).join("")}
  `;
}

async function main() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");

  const entries = await loadEntries();
  const entry = entries.find((item) => item.id === id);

  if (!entry) {
    throw new Error("没有找到这篇日记。可以先回到日记流看看最近记录。");
  }

  renderEntry(entry);
}

main().catch((error) => {
  const title = document.getElementById("entry-title");
  const body = document.getElementById("entry-body");
  title.textContent = "内容不可用";
  body.innerHTML = `<p class="subtle">${error.message}</p>`;
});
