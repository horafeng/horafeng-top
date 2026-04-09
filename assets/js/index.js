import { getStats, linkify, loadEntries } from "./common.js";

function renderTimeline(entries) {
  const timeline = document.getElementById("timeline");

  if (!entries.length) {
    timeline.innerHTML = '<p class="subtle">当前筛选条件下还没有日记。</p>';
    return;
  }

  timeline.innerHTML = entries
    .map((entry) => {
      const preview = entry.content.slice(0, 2).join(" ");
      const tags = entry.tags.map((tag) => `#${tag}`).join(" ");

      return `
        <article class="entry-card">
          <a href="entry.html?id=${entry.id}">
            <div class="entry-meta">
              <span>${entry.date}</span>
              <span>${entry.mood}</span>
            </div>
            <h3 class="entry-title">${entry.title}</h3>
            <p class="entry-snippet">${linkify(preview)}</p>
            <p class="entry-meta">${tags}</p>
          </a>
        </article>
      `;
    })
    .join("");
}

function renderPreview(entries) {
  const { tags, archives } = getStats(entries);
  const tagPreview = document.getElementById("tag-preview");
  const archivePreview = document.getElementById("archive-preview");

  const topTags = [...tags.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  tagPreview.innerHTML = topTags
    .map(([tag, count]) => `<a class="chip" href="index.html?tag=${encodeURIComponent(tag)}">#${tag} (${count})</a>`)
    .join("");

  const monthItems = [...archives.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  archivePreview.innerHTML = monthItems
    .map(([month, count]) => `<li><a href="index.html?archive=${month}">${month} (${count})</a></li>`)
    .join("");
}

function filterEntries(entries) {
  const params = new URLSearchParams(window.location.search);
  const tag = params.get("tag");
  const archive = params.get("archive");
  const heading = document.querySelector(".section-head h2");

  let list = entries;

  if (tag) {
    list = list.filter((entry) => entry.tags.includes(tag));
    heading.textContent = `标签：#${tag}`;
  } else if (archive) {
    list = list.filter((entry) => entry.date.startsWith(archive));
    heading.textContent = `归档：${archive}`;
  }

  return list;
}

async function main() {
  const entries = await loadEntries();
  const filtered = filterEntries(entries);

  renderTimeline(filtered);
  renderPreview(entries);
}

main().catch((error) => {
  const timeline = document.getElementById("timeline");
  timeline.innerHTML = `<p class="subtle">${error.message}</p>`;
});
