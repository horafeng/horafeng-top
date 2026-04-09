import { getStats, linkify, loadEntries } from "./common.js";

function renderTags(tagsMap) {
  const tagList = document.getElementById("tag-list");
  const sorted = [...tagsMap.entries()].sort((a, b) => b[1] - a[1]);

  tagList.innerHTML = sorted
    .map(([tag, count]) => `<a class="chip" href="tags.html?tag=${encodeURIComponent(tag)}">#${tag} (${count})</a>`)
    .join("");
}

function renderArchives(archiveMap) {
  const archiveList = document.getElementById("archive-list");
  const sorted = [...archiveMap.entries()].sort((a, b) => b[0].localeCompare(a[0]));

  archiveList.innerHTML = sorted
    .map(([month, count]) => `<li><a href="tags.html?archive=${month}">${month} (${count})</a></li>`)
    .join("");
}

function renderFilterResults(entries) {
  const params = new URLSearchParams(window.location.search);
  const tag = params.get("tag");
  const archive = params.get("archive");

  const title = document.getElementById("filter-title");
  const results = document.getElementById("filter-results");

  let list = entries;

  if (tag) {
    title.textContent = `筛选结果：#${tag}`;
    list = entries.filter((entry) => entry.tags.includes(tag));
  } else if (archive) {
    title.textContent = `筛选结果：${archive}`;
    list = entries.filter((entry) => entry.date.startsWith(archive));
  } else {
    title.textContent = "筛选结果：最近 5 条";
    list = entries.slice(0, 5);
  }

  if (!list.length) {
    results.innerHTML = '<p class="subtle">这个分类下还没有内容。</p>';
    return;
  }

  results.innerHTML = list
    .map(
      (entry) => `
        <article class="entry-card">
          <a href="entry.html?id=${entry.id}">
            <p class="entry-meta"><span>${entry.date}</span><span>${entry.mood}</span></p>
            <h4 class="entry-title">${entry.title}</h4>
            <p class="entry-snippet">${linkify(entry.content[0])}</p>
          </a>
        </article>
      `,
    )
    .join("");
}

async function main() {
  const entries = await loadEntries();
  const { tags, archives } = getStats(entries);

  renderTags(tags);
  renderArchives(archives);
  renderFilterResults(entries);
}

main().catch((error) => {
  const tagList = document.getElementById("tag-list");
  tagList.innerHTML = `<p class="subtle">${error.message}</p>`;
});
