import {
  formatLastSeen,
  getStats,
  linkify,
  loadEntries,
  loadSiteConfig,
  renderRecentComments,
  searchEntries,
  setupMobileStage,
  setupSplash,
} from "./common.js";

function renderTimeline(entries) {
  const timeline = document.getElementById("timeline");

  if (!entries.length) {
    timeline.innerHTML = '<p class="subtle">没有匹配结果，换个关键词试试。</p>';
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

  const topTags = [...tags.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  tagPreview.innerHTML = topTags
    .map(([tag, count]) => `<a class="chip" href="index.html?tag=${encodeURIComponent(tag)}">#${tag} (${count})</a>`)
    .join("");

  const monthItems = [...archives.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  archivePreview.innerHTML = monthItems
    .map(([month, count]) => `<li><a href="index.html?archive=${month}">${month} (${count})</a></li>`)
    .join("");
}

function renderProfile(config) {
  const profile = config.profile || {};

  const avatar = document.getElementById("profile-avatar");
  const name = document.getElementById("profile-name");
  const signature = document.getElementById("profile-signature");
  const lastSeen = document.getElementById("profile-last-seen");
  const emailButton = document.getElementById("email-button");
  const imButton = document.getElementById("im-button");

  avatar.src = profile.avatar || avatar.src;
  name.textContent = profile.name || "HoraFeng";
  signature.textContent = profile.signature || "记录生活的呼吸感";
  lastSeen.textContent = formatLastSeen(profile.lastSeenAt);

  emailButton.href = profile.email ? `mailto:${profile.email}` : "mailto:hello@example.com";
  emailButton.textContent = profile.emailLabel || "发送邮件";

  imButton.href = profile.im?.url || "#";
  imButton.textContent = profile.im?.label || "即时消息";
}

function filterByParams(entries) {
  const params = new URLSearchParams(window.location.search);
  const tag = params.get("tag");
  const archive = params.get("archive");
  const heading = document.getElementById("timeline-heading");

  if (tag) {
    heading.textContent = `标签：#${tag}`;
    return entries.filter((entry) => entry.tags.includes(tag));
  }

  if (archive) {
    heading.textContent = `归档：${archive}`;
    return entries.filter((entry) => entry.date.startsWith(archive));
  }

  heading.textContent = "最近日记";
  return entries;
}

function setupSearch(entries) {
  const form = document.getElementById("search-form");
  const input = document.getElementById("search-input");
  const hint = document.getElementById("search-hint");

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const query = input.value;
    const results = searchEntries(entries, query);
    renderTimeline(results);

    if (query.trim()) {
      hint.textContent = `关键词 “${query.trim()}” 匹配到 ${results.length} 条日记`;
    } else {
      hint.textContent = "";
    }
  });

  input.addEventListener("input", () => {
    if (input.value.trim()) {
      return;
    }

    hint.textContent = "";
    renderTimeline(entries);
  });
}

async function main() {
  setupSplash();
  setupMobileStage();

  const [entries, config] = await Promise.all([loadEntries(), loadSiteConfig()]);
  const preFiltered = filterByParams(entries);

  renderProfile(config);
  renderTimeline(preFiltered);
  renderPreview(entries);

  setupSearch(preFiltered);

  await renderRecentComments({
    listEl: document.getElementById("recent-comments"),
    serverURL: config.comments?.serverURL,
    path: "/",
    count: 6,
  });
}

main().catch((error) => {
  const timeline = document.getElementById("timeline");
  timeline.innerHTML = `<p class="subtle">${error.message}</p>`;
});

