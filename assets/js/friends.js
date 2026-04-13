import { escapeHtml, setupPageTransition, setupSiteChrome, setupSplash } from "./common.js";

const TEXT = {
  fallbackInitial: "\u53cb",
  fallbackName: "\u672a\u547d\u540d\u53cb\u94fe",
  fallbackIntro: "\u8fd9\u4e2a\u7ad9\u70b9\u8fd8\u6ca1\u6709\u586b\u5199\u4ecb\u7ecd\u3002",
  visitLink: "\u8bbf\u95ee\u7f51\u7ad9",
  loadError: "\u53cb\u94fe\u6570\u636e\u6682\u65f6\u52a0\u8f7d\u5931\u8d25\u3002",
  pageError: "\u53cb\u94fe\u9875\u9762\u52a0\u8f7d\u5931\u8d25\u3002",
  title: "\u53cb\u94fe",
  intro: "\u628a\u559c\u6b22\u7684\u535a\u5ba2\u4e0e\u957f\u671f\u60f3\u56de\u8bbf\u7684\u7f51\u7ad9\u6574\u7406\u5728\u8fd9\u91cc\u3002",
};

function formatDomain(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return url.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  }
}

function getInitial(name) {
  const value = String(name || "").trim();
  return value ? value.slice(0, 1).toUpperCase() : TEXT.fallbackInitial;
}

function renderFriendCard(item) {
  const name = String(item?.name || "").trim() || TEXT.fallbackName;
  const url = String(item?.url || "").trim();
  const intro = String(item?.intro || item?.description || "").trim();
  const avatar = String(item?.avatar || "").trim();
  const domain = formatDomain(url);
  const signature = String(item?.signature || "").trim();

  const avatarMarkup = avatar
    ? `<img class="friend-avatar" src="${escapeHtml(avatar)}" alt="${escapeHtml(name)} \u7684\u5934\u50cf" loading="lazy" />`
    : `<div class="friend-avatar friend-avatar-fallback" aria-hidden="true">${escapeHtml(getInitial(name))}</div>`;

  return `
    <article class="panel-lite friend-card">
      <div class="friend-card-head">
        ${avatarMarkup}
        <div class="friend-card-meta">
          <h2>${escapeHtml(name)}</h2>
          <a class="friend-domain" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(domain)}</a>
        </div>
      </div>
      ${signature ? `<p class="friend-signature">${escapeHtml(signature)}</p>` : ""}
      <p class="friend-intro">${escapeHtml(intro || TEXT.fallbackIntro)}</p>
      <div class="friend-card-foot">
        <a class="friend-visit-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${TEXT.visitLink}</a>
      </div>
    </article>
  `;
}

async function loadFriends() {
  const response = await fetch("/content/friends.json");
  if (!response.ok) {
    throw new Error(TEXT.loadError);
  }
  return response.json();
}

async function main() {
  setupSplash();
  setupPageTransition();
  setupSiteChrome({ useWindowScroll: true });

  const title = document.getElementById("friends-title");
  const intro = document.getElementById("friends-intro");
  const count = document.getElementById("friends-count");
  const grid = document.getElementById("friends-grid");
  const empty = document.getElementById("friends-empty");

  const data = await loadFriends();
  const items = Array.isArray(data?.items) ? data.items.filter((item) => item?.url) : [];

  if (title) {
    title.textContent = String(data?.title || TEXT.title).trim() || TEXT.title;
  }
  if (intro) {
    intro.textContent = String(data?.intro || TEXT.intro).trim();
  }
  if (count) {
    count.textContent = String(items.length);
  }

  if (!items.length) {
    grid.hidden = true;
    empty.hidden = false;
    return;
  }

  grid.hidden = false;
  empty.hidden = true;
  grid.innerHTML = items.map(renderFriendCard).join("");
}

main().catch((error) => {
  const grid = document.getElementById("friends-grid");
  if (grid) {
    grid.innerHTML = `<div class="panel-lite friends-error subtle">${escapeHtml(error.message || TEXT.pageError)}</div>`;
  }
});
