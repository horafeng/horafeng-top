import { escapeHtml, loadSiteConfig, setupPageTransition, setupSiteChrome, setupSplash } from "./common.js";
import { mountContentComments } from "./content-comments.js";

const TEXT = {
  fallbackInitial: "\u53cb",
  fallbackName: "\u672a\u547d\u540d\u53cb\u94fe",
  fallbackIntro: "\u8fd9\u4e2a\u7ad9\u70b9\u8fd8\u6ca1\u6709\u586b\u5199\u4ecb\u7ecd\u3002",
  visitLink: "\u8bbf\u95ee\u7f51\u7ad9",
  loadError: "\u53cb\u94fe\u6570\u636e\u6682\u65f6\u52a0\u8f7d\u5931\u8d25\u3002",
  pageError: "\u53cb\u94fe\u9875\u9762\u52a0\u8f7d\u5931\u8d25\u3002",
  title: "\u53cb\u94fe",
  intro: "\u628a\u559c\u6b22\u7684\u535a\u5ba2\u4e0e\u957f\u671f\u60f3\u56de\u8bbf\u7684\u7f51\u7ad9\u6574\u7406\u5728\u8fd9\u91cc\u3002",
  applyKicker: "\u53cb\u94fe\u8bf4\u660e",
  applyTitle: "\u7533\u8bf7\u53cb\u60c5\u94fe\u63a5",
  siteKicker: "\u672c\u7ad9\u4fe1\u606f",
  siteTitle: "\u52a0\u5165\u672c\u7ad9\u5230\u8d35\u7ad9\u53cb\u94fe",
};

const GUIDE_CONTENT = {
  apply: {
    kicker: TEXT.applyKicker,
    title: TEXT.applyTitle,
    html: `
      <section class="friends-guide-section">
        <h3>\u7533\u8bf7\u6761\u4ef6</h3>
        <ul>
          <li>\u7f51\u7ad9\u5185\u5bb9\u5fc5\u987b\u7b26\u5408\u4e2d\u534e\u4eba\u6c11\u5171\u548c\u56fd\u76f8\u5173\u6cd5\u5f8b\u6cd5\u89c4\uff0c\u4e14\u4e0d\u80fd\u4e0e\u4ee3\u7406\u670d\u52a1\u5668\u3001VPN\u3001\u5e7f\u544a\u7b49\u76f8\u5173\u3002</li>
          <li>\u7f51\u7ad9\u5fc5\u987b\u8981\u6709\u5b9e\u8d28\u6027\u7684\u5185\u5bb9\uff0c\u672c\u7ad9\u4e0d\u63a5\u53d7\u7a7a\u767d\u7684\u6216\u8005\u5168\u662f\u65e0\u610f\u4e49\u5185\u5bb9\u7684\u7f51\u7ad9\u3002</li>
          <li>\u7f51\u7ad9\u53ef\u4ee5\u5728\u4e2d\u56fd\u5927\u9646\u5730\u533a\u6b63\u5e38\u8bbf\u95ee\uff0c\u4e14\u9875\u9762\u663e\u793a\u6b63\u5e38\uff0c\u8bbf\u95ee\u901f\u5ea6\u5728\u53ef\u63a5\u53d7\u7684\u8303\u56f4\u5185\u3002</li>
        </ul>
      </section>
      <section class="friends-guide-section">
        <h3>\u7533\u8bf7\u4e2d \u2014\u2014 \u7533\u8bf7\u65b9\u5f0f</h3>
        <p>\u5728\u672c\u9875\u9762\u7684\u8bc4\u8bba\u533a\u8bc4\u8bba\u5373\u53ef\u7533\u8bf7\u53cb\u60c5\u94fe\u63a5\uff0c\u5efa\u8bae\u60a8\u53c2\u7167\u4ee5\u4e0b\u683c\u5f0f\u8bc4\u8bba\uff1a</p>
        <pre class="friends-code-block"><code>\u7f51\u7ad9\u540d\u79f0\uff1a
\u7f51\u7ad9\u94fe\u63a5\uff1a
\u7f51\u7ad9\u56fe\u6807\uff1a
\u7f51\u7ad9\u63cf\u8ff0\uff1a</code></pre>
        <p>\u535a\u4e3b\u53ef\u80fd\u4f1a\u5728\u5c06\u8d35\u7ad9\u6dfb\u52a0\u5728\u672c\u7ad9\u53cb\u94fe\u65f6\u4fee\u6539\u90e8\u5206\u4fe1\u606f\uff1b\u540c\u65f6\uff0c\u82e5\u60a8\u6ca1\u6709\u7279\u522b\u8bf4\u660e\uff0c\u535a\u4e3b\u4f1a\u5c06\u8d35\u7ad9\u7684\u56fe\u6807\u5b58\u50a8\u5230\u672c\u7ad9\u7684\u670d\u52a1\u5668\u4e0a\u3002</p>
      </section>
      <section class="friends-guide-section">
        <h3>\u901a\u8fc7\u7533\u8bf7\u540e \u2014\u2014 \u53cb\u94fe\u5b9a\u671f\u68c0\u67e5</h3>
        <p>\u535a\u4e3b\u4f1a\u5728\u529b\u6240\u80fd\u53ca\u7684\u8303\u56f4\u5185\u5b9a\u671f\u68c0\u67e5\u60a8\u7684\u7f51\u7ad9\uff1b\u82e5\u8d35\u7ad9\u51fa\u73b0\u95ee\u9898\uff0c\u5305\u62ec\u4f46\u4e0d\u9650\u4e8e\uff1a</p>
        <ul>
          <li>\u9875\u9762\u663e\u793a\u5f02\u5e38\uff0c\u7f51\u7ad9\u65e0\u6cd5\u8bbf\u95ee</li>
          <li>\u53d1\u5e03\u4e0d\u7b26\u5408\u4e2d\u534e\u4eba\u6c11\u5171\u548c\u56fd\u6cd5\u5f8b\u6cd5\u89c4\u7684\u5185\u5bb9</li>
          <li>\u7f51\u7ad9\u88ab\u6076\u610f\u6ce8\u5165\u5185\u5bb9\uff0c\u7f51\u7ad9\u670d\u52a1\u5668\u88ab\u6076\u610f\u653b\u51fb\u3001\u52ab\u6301</li>
          <li>\u57df\u540d\u5230\u671f</li>
        </ul>
        <p>\u90a3\u4e48\uff0c\u53ef\u80fd\u4f1a\u901a\u77e5\u60a8\uff0c\u5e76\u4e14\u4f1a\u5c06\u8d35\u7ad9\u79fb\u81f3\u201c\u65e0\u6cd5\u8bbf\u95ee\u7684\u53cb\u94fe\u201d\u6216\u76f4\u63a5\u79fb\u9664\u53cb\u60c5\u94fe\u63a5\u3002</p>
      </section>
      <section class="friends-guide-section">
        <h3>\u98ce\u9669\u8bf4\u660e</h3>
        <p>\u7531\u4e8e\u90e8\u5206\u7f51\u7ad9\u6ca1\u6709\u5907\u6848\u3001\u57df\u540d\u672a\u5b9e\u540d\u8ba4\u8bc1\u3001\u672a\u52a0\u5f3a\u9632\u62a4\u7b49\uff0c\u65e0\u6cd5\u786e\u4fdd\u53cb\u60c5\u94fe\u63a5\u6ca1\u6709\u4efb\u4f55\u98ce\u9669\u3002</p>
      </section>
    `,
  },
  site: {
    kicker: TEXT.siteKicker,
    title: TEXT.siteTitle,
    yaml: `
      <section class="friends-guide-section">
        <h3>YAML</h3>
        <pre class="friends-code-block"><code>name: HoraFeng
link: https://horafeng.top/
avatar: https://horafeng.top/assets/images/Profile.png
descr: \u628a\u666e\u901a\u65e5\u5b50\u5199\u6210\u4f1a\u53d1\u5149\u7684\u788e\u7247\u3002</code></pre>
      </section>
    `,
  },
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

function getGuideElements() {
  return {
    overlay: document.getElementById("friends-guide-overlay"),
    title: document.getElementById("friends-guide-title"),
    kicker: document.getElementById("friends-guide-kicker"),
    content: document.getElementById("friends-guide-content"),
  };
}

function renderGuideContent(key) {
  if (key === "site") {
    return GUIDE_CONTENT.site.yaml;
  }
  return GUIDE_CONTENT.apply.html;
}

function openGuideModal(key) {
  const guide = GUIDE_CONTENT[key];
  const { overlay, title, kicker, content } = getGuideElements();
  if (!guide || !overlay || !title || !kicker || !content) {
    return;
  }

  overlay.dataset.activeGuide = key;
  title.textContent = guide.title;
  kicker.textContent = guide.kicker;
  content.innerHTML = renderGuideContent(key);
  overlay.hidden = false;
  overlay.classList.add("open");
  document.body.classList.add("no-scroll");
}

function closeGuideModal() {
  const { overlay } = getGuideElements();
  if (!overlay) {
    return;
  }

  overlay.classList.remove("open");
  overlay.hidden = true;
  document.body.classList.remove("no-scroll");
}

function setupGuideModal() {
  const { overlay } = getGuideElements();
  if (!overlay) {
    return;
  }

  document.querySelectorAll("[data-guide-open]").forEach((button) => {
    button.addEventListener("click", () => {
      openGuideModal(button.getAttribute("data-guide-open"));
    });
  });

  document.getElementById("friends-guide-close")?.addEventListener("click", closeGuideModal);
  overlay.addEventListener("click", (event) => {
    const target = event.target;
    if (target instanceof HTMLElement && target.dataset.friendsGuideClose === "1") {
      closeGuideModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !overlay.hidden) {
      closeGuideModal();
    }
  });
}

async function main() {
  setupSplash();
  setupPageTransition();
  setupSiteChrome({ useWindowScroll: true });
  setupGuideModal();

  const title = document.getElementById("friends-title");
  const intro = document.getElementById("friends-intro");
  const count = document.getElementById("friends-count");
  const grid = document.getElementById("friends-grid");
  const empty = document.getElementById("friends-empty");

  const [data, siteConfig] = await Promise.all([loadFriends(), loadSiteConfig()]);
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
    grid.innerHTML = "";
  } else {
    grid.hidden = false;
    empty.hidden = true;
    grid.innerHTML = items.map(renderFriendCard).join("");
  }

  const host = document.getElementById("friends-comments-host");
  if (host) {
    const profile = siteConfig?.profile || {};
    const siteUrl = "https://horafeng.top/";
    const avatarUrl = profile.avatar
      ? new URL(String(profile.avatar).replace(/^\/+/, ""), siteUrl).toString()
      : "https://horafeng.top/assets/images/Profile.png";

    GUIDE_CONTENT.site.yaml = `
      <section class="friends-guide-section">
        <h3>YAML</h3>
        <pre class="friends-code-block"><code>name: ${escapeHtml(profile.name || "HoraFeng")}
link: ${escapeHtml(siteUrl)}
avatar: ${escapeHtml(avatarUrl)}
descr: ${escapeHtml(profile.signature || "")}</code></pre>
      </section>
    `;

    mountContentComments({
      container: host,
      pageKey: "friends",
      mode: "article",
    });
  }
}

main().catch((error) => {
  const grid = document.getElementById("friends-grid");
  if (grid) {
    grid.innerHTML = `<div class="panel-lite friends-error subtle">${escapeHtml(error.message || TEXT.pageError)}</div>`;
  }
});
