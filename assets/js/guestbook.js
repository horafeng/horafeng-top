import { formatLastSeen, loadSiteConfig, setupPageTransition, setupSiteChrome, setupSplash } from "./common.js";
import { mountContentComments } from "./content-comments.js";

const state = {
  widget: null,
};

function applyProfile(profile = {}) {
  const avatar = String(profile.avatar || "assets/images/Profile.png").trim() || "assets/images/Profile.png";
  const name = String(profile.name || "HoraFeng").trim() || "HoraFeng";
  const handle = String(profile.handle || "@horafeng").trim() || "@horafeng";
  const signature = String(profile.signature || "\u628a\u666e\u901a\u65e5\u5b50\u5199\u6210\u4f1a\u53d1\u5149\u7684\u788e\u7247\u3002").trim();
  const bio = String(profile.bio || "\u8fd9\u91cc\u662f\u6211\u7684\u8f7b\u65e5\u8bb0\u4e0e\u751f\u6d3b\u8bb0\u4e8b\u3002").trim();
  const email = String(profile.email || "horafeng@outlook.com").trim();

  const avatarEl = document.getElementById("guestbook-profile-avatar");
  const nameEl = document.getElementById("guestbook-profile-name");
  const handleEl = document.getElementById("guestbook-profile-handle");
  const signatureEl = document.getElementById("guestbook-profile-signature");
  const bioEl = document.getElementById("guestbook-profile-bio");
  const lastSeenEl = document.getElementById("guestbook-profile-last-seen");
  const coverEl = document.getElementById("guestbook-profile-cover");
  const emailButton = document.getElementById("guestbook-email-button");

  if (avatarEl) {
    avatarEl.src = avatar;
  }
  if (nameEl) {
    nameEl.textContent = name;
  }
  if (handleEl) {
    handleEl.textContent = handle;
  }
  if (signatureEl) {
    signatureEl.textContent = signature;
  }
  if (bioEl) {
    bioEl.textContent = bio;
  }
  if (lastSeenEl) {
    lastSeenEl.textContent = formatLastSeen(profile.lastSeen || profile.last_seen || "");
  }
  if (coverEl && profile.cover) {
    coverEl.style.backgroundImage = `url("${String(profile.cover).trim()}")`;
  }
  if (emailButton && email) {
    emailButton.href = `mailto:${email}`;
  }
}

function mountGuestbookComments() {
  document.getElementById("guestbook-form-wrap")?.remove();
  document.getElementById("guestbook-toast")?.remove();

  const listWrap = document.querySelector(".guestbook-list-wrap");
  if (!(listWrap instanceof HTMLElement)) {
    return;
  }

  const head = listWrap.querySelector(".guestbook-list-head");
  const title = head?.querySelector("h2");
  const subtitle = head?.querySelector(".subtle");
  if (title) {
    title.textContent = "\u6700\u65b0\u4e92\u52a8";
  }
  if (subtitle) {
    subtitle.textContent = "\u9ed8\u8ba4\u5c55\u793a\u4e24\u5c42\u8bc4\u8bba\u7ed3\u6784\uff0c\u56de\u590d\u4ed6\u4eba\u7684\u56de\u590d\u65f6\u4f1a\u6807\u6ce8\u5bf9\u5e94\u697c\u5c42\u3002";
  }

  let host = document.getElementById("guestbook-comments-host");
  if (!(host instanceof HTMLElement)) {
    host = document.createElement("section");
    host.id = "guestbook-comments-host";
    host.className = "guestbook-comments-host";
    const legacyList = document.getElementById("guestbook-list");
    if (legacyList) {
      legacyList.replaceWith(host);
    } else {
      listWrap.appendChild(host);
    }
  }

  state.widget?.destroy?.();
  state.widget = mountContentComments({
    container: host,
    pageKey: "guestbook",
    mode: "guestbook",
  });
}

async function main() {
  setupSplash();
  setupPageTransition();
  setupSiteChrome({
    scrollContainerSelector: ".guestbook-flow-panel",
    useWindowScroll: true,
  });

  const siteConfig = await loadSiteConfig();
  applyProfile(siteConfig?.profile || {});
  mountGuestbookComments();
}

main().catch((error) => {
  const listWrap = document.querySelector(".guestbook-list-wrap");
  if (!listWrap) {
    return;
  }

  const host = document.getElementById("guestbook-comments-host") || document.getElementById("guestbook-list");
  if (host instanceof HTMLElement) {
    host.innerHTML = `<p class="subtle">${String(error?.message || "\u7559\u8a00\u677f\u52a0\u8f7d\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002")}</p>`;
  }
});
