export async function loadEntries() {
  const response = await fetch("content/diaries.json");
  if (!response.ok) {
    throw new Error("Failed to load local diary content.");
  }

  const data = await response.json();
  return data.entries
    .slice()
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .map((entry) => ({ ...entry, images: Array.isArray(entry.images) ? entry.images : [] }));
}

export async function loadSiteConfig() {
  const response = await fetch("content/site.json");
  if (!response.ok) {
    throw new Error("Failed to load site config.");
  }

  return response.json();
}

export function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function linkify(text) {
  const safe = escapeHtml(text);
  const urlPattern = /(https?:\/\/[^\s]+)/g;

  return safe.replace(urlPattern, (url) => {
    const trimmed = url.replace(/[),.;!?]+$/g, "");
    const tail = url.slice(trimmed.length);
    return `<a href="${trimmed}" target="_blank" rel="noopener noreferrer">${trimmed}</a>${tail}`;
  });
}

export function getStats(entries) {
  const tags = new Map();
  const archives = new Map();

  entries.forEach((entry) => {
    entry.tags.forEach((tag) => tags.set(tag, (tags.get(tag) || 0) + 1));
    const month = entry.date.slice(0, 7);
    archives.set(month, (archives.get(month) || 0) + 1);
  });

  return { tags, archives };
}

export function formatLastSeen(isoString) {
  if (!isoString) {
    return "博主最近来过";
  }

  const now = Date.now();
  const date = new Date(isoString).getTime();
  if (Number.isNaN(date)) {
    return "博主最近来过";
  }

  const diffHours = Math.max(1, Math.floor((now - date) / (1000 * 60 * 60)));
  return `博主在 ${diffHours} 小时前来过`;
}

export function normalizeText(entry) {
  return `${entry.title} ${entry.tags.join(" ")} ${entry.content.join(" ")}`.toLowerCase();
}

export function searchEntries(entries, query) {
  const q = query.trim().toLowerCase();
  if (!q) {
    return entries;
  }

  return entries.filter((entry) => normalizeText(entry).includes(q));
}

export function setupSplash() {
  const splash = document.getElementById("splash-screen");
  if (!splash) {
    return;
  }

  const key = "horafeng-splash-played";
  const navigation = performance.getEntriesByType("navigation")[0];
  const navType = navigation?.type || "navigate";

  if (navType === "reload") {
    sessionStorage.removeItem(key);
  }

  if (sessionStorage.getItem(key)) {
    splash.remove();
    return;
  }

  document.body.classList.add("no-scroll");
  splash.classList.add("visible");
  sessionStorage.setItem(key, "1");

  window.setTimeout(() => {
    document.body.classList.remove("no-scroll");
    splash.remove();
  }, 1220);
}

export function setupPageTransition() {
  const markerKey = "horafeng-page-transition";
  const enterFlag = sessionStorage.getItem(markerKey) === "1";

  if (enterFlag) {
    document.body.classList.add("page-entering");
    requestAnimationFrame(() => {
      document.body.classList.add("page-enter-active");
    });
    window.setTimeout(() => {
      document.body.classList.remove("page-entering", "page-enter-active");
      sessionStorage.removeItem(markerKey);
    }, 320);
  }

  document.addEventListener("click", (event) => {
    const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
    if (!link) {
      return;
    }

    if (link.dataset.noTransition === "1") {
      return;
    }
    if (link.target && link.target !== "_self") {
      return;
    }
    if (link.hasAttribute("download")) {
      return;
    }
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }

    const nextUrl = new URL(link.href, window.location.href);
    if (nextUrl.origin !== window.location.origin) {
      return;
    }
    if (nextUrl.pathname === window.location.pathname && nextUrl.search === window.location.search) {
      return;
    }

    event.preventDefault();
    if (document.body.classList.contains("page-leaving")) {
      return;
    }

    document.body.classList.add("page-leaving");
    sessionStorage.setItem(markerKey, "1");
    window.setTimeout(() => {
      window.location.assign(nextUrl.toString());
    }, 180);
  });
}

export function setupSiteChrome(options = {}) {
  const nav = document.querySelector("[data-site-nav]");
  if (!nav) {
    return;
  }

  document.body.classList.add("with-site-nav");
  const scrollSelector = options.scrollContainerSelector || ".flow-panel";
  const scrollContainer = document.querySelector(scrollSelector);
  const useWindowScroll = options.useWindowScroll === true;
  const preferWindowOnMobile = options.preferWindowOnMobile !== false;
  const useWindow = useWindowScroll || (preferWindowOnMobile && window.matchMedia("(max-width: 1023px)").matches) || !scrollContainer;
  const scrollTarget = useWindow ? window : scrollContainer;
  const brandMini = nav.querySelector("[data-nav-brand-center]");
  const backTop = nav.querySelector("[data-nav-backtop]");
  const searchBtn = nav.querySelector("[data-nav-search]");
  const searchShell = nav.querySelector("[data-nav-search-shell]");
  const searchPanel = nav.querySelector(".site-nav-search-panel");
  const searchPanelInput = searchPanel?.querySelector('input[type="search"]');
  const dropdown = nav.querySelector("[data-nav-dropdown]");
  const dropdownToggle = nav.querySelector("[data-nav-dropdown-toggle]");
  const desktopHoverBacktop = window.matchMedia("(min-width: 1024px) and (hover: hover) and (pointer: fine)").matches;
  const desktopExpandableSearch = Boolean(searchPanel && searchPanelInput) && desktopHoverBacktop;

  const getScrollTop = () => {
    if (scrollTarget === window) {
      return window.scrollY || document.documentElement.scrollTop || 0;
    }
    return scrollTarget.scrollTop || 0;
  };

  const scrollToTop = () => {
    if (scrollTarget === window) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    scrollTarget.scrollTo({ top: 0, behavior: "smooth" });
  };

  const closeDropdown = () => {
    if (dropdown) {
      dropdown.classList.remove("open");
    }
  };

  const closeSearchPanel = () => {
    if (!searchPanel || !searchShell) {
      return;
    }
    searchShell.classList.remove("open");
    searchPanel.hidden = true;
  };

  const openSearchPanel = () => {
    if (!searchPanel || !searchShell) {
      return;
    }
    searchPanel.hidden = false;
    searchShell.classList.add("open");
    window.setTimeout(() => searchPanelInput?.focus(), 30);
  };

  let lastTop = getScrollTop();
  let condensed = false;
  const applyNavState = () => {
    const top = getScrollTop();
    const delta = top - lastTop;

    if (top <= 24) {
      condensed = false;
      document.body.classList.remove("site-nav-show-backtop");
    } else if (delta > 6 && top > 92) {
      condensed = true;
    } else if (delta < -6) {
      condensed = false;
      document.body.classList.remove("site-nav-show-backtop");
    }

    document.body.classList.toggle("site-nav-condensed", condensed);
    document.body.classList.toggle("site-nav-frosted", top > 18);
    lastTop = top;
  };

  applyNavState();
  scrollTarget.addEventListener("scroll", applyNavState, { passive: true });

  if (dropdownToggle && dropdown) {
    dropdownToggle.addEventListener("click", () => {
      dropdown.classList.toggle("open");
    });
  }

  document.addEventListener("click", (event) => {
    if (dropdown && dropdown.contains(event.target)) {
      return;
    }
    closeDropdown();

    if (searchShell && searchShell.contains(event.target)) {
      return;
    }
    closeSearchPanel();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeDropdown();
      closeSearchPanel();
      document.body.classList.remove("site-nav-show-backtop");
    }
  });

  if (brandMini) {
    brandMini.addEventListener("click", () => {
      if (!document.body.classList.contains("site-nav-condensed")) {
        scrollToTop();
        return;
      }
      if (desktopHoverBacktop) {
        return;
      }
      document.body.classList.toggle("site-nav-show-backtop");
    });

    if (desktopHoverBacktop) {
      brandMini.addEventListener("mouseenter", () => {
        if (document.body.classList.contains("site-nav-condensed")) {
          document.body.classList.add("site-nav-show-backtop");
        }
      });

      nav.addEventListener("mouseleave", () => {
        document.body.classList.remove("site-nav-show-backtop");
      });
    }
  }

  if (backTop) {
    backTop.addEventListener("click", () => {
      document.body.classList.remove("site-nav-show-backtop");
      scrollToTop();
    });
  }

  if (searchBtn) {
    searchBtn.addEventListener("click", () => {
      if (desktopExpandableSearch) {
        if (searchShell?.classList.contains("open")) {
          closeSearchPanel();
        } else {
          openSearchPanel();
        }
        return;
      }

      const targetSelector =
        nav.getAttribute("data-search-target") ||
        options.searchTargetSelector ||
        "#search-input, #guestbook-content";
      const target = document.querySelector(targetSelector);
      if (!target) {
        return;
      }

      target.scrollIntoView({ behavior: "smooth", block: "center" });
      window.setTimeout(() => target.focus?.(), 180);
    });
  }

  if (searchPanel) {
    searchPanel.addEventListener("submit", (event) => {
      if (desktopExpandableSearch) {
        event.preventDefault();
      }
    });
  }
}

export function renderMockComments(listEl, comments, limit = 10) {
  if (!listEl) {
    return;
  }

  const rows = (comments || []).slice(0, limit);
  if (!rows.length) {
    listEl.innerHTML = '<li class="subtle">评论区暂未开放。</li>';
    return;
  }

  listEl.innerHTML = rows
    .map((item) => `<li><p class="comment-author">${escapeHtml(item.nick || "访客")}</p><p class="comment-text">${escapeHtml(item.content || "")}</p></li>`)
    .join("");
}
