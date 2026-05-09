import { formatLastSeen, loadSiteConfig, setupPageTransition, setupSiteChrome, setupSplash } from "./common.js?v=f6e0c5dd3d";
import { mountContentComments } from "./content-comments.js";

const state = {
  widget: null,
};

function applyProfile(profile = {}) {
  const avatar = String(profile.avatar || "assets/images/Profile.png").trim() || "assets/images/Profile.png";
  const name = String(profile.name || "HoraFeng").trim() || "HoraFeng";
  const handle = String(profile.handle || "@horafeng").trim() || "@horafeng";
  const signature = String(profile.signature || "").trim();
  const bio = String(profile.bio || "").trim();
  const email = String(profile.email || "horafeng@outlook.com").trim();

  const avatarEl = document.getElementById("guestbook-profile-avatar");
  const nameEl = document.getElementById("guestbook-profile-name");
  const handleEl = document.getElementById("guestbook-profile-handle");
  const signatureEl = document.getElementById("guestbook-profile-signature");
  const bioEl = document.getElementById("guestbook-profile-bio");
  const lastSeenEl = document.getElementById("guestbook-profile-last-seen");
  const coverEl = document.getElementById("guestbook-profile-cover");
  const emailButton = document.getElementById("guestbook-email-button");
  const githubButton = document.getElementById("guestbook-github-button");

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
  if (githubButton && profile.github) {
    githubButton.href = String(profile.github).trim();
  }
}

function mountGuestbookComments() {
  document.getElementById("guestbook-form-wrap")?.remove();
  document.getElementById("guestbook-toast")?.remove();

  const listWrap = document.querySelector(".guestbook-list-wrap");
  if (!(listWrap instanceof HTMLElement)) {
    return;
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
