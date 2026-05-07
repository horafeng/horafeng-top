const reduceMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
const pointerQuery = window.matchMedia("(hover: hover) and (pointer: fine)");

let entryObserver = null;
let terminalTypingTimer = null;
let heroFlowFrame = 0;
const DEFAULT_HERO_SIGNATURE = "\u6b22\u8fce\u6765\u5230\u6211\u7684\u535a\u5ba2";
const MOJIBAKE_PATTERN = /[\uFFFD\u951F]|[\u9356\u6D5C\u9394\u9436\u4E32\u7ECB\u71B7]/;

function readableText(value, fallback = "") {
  const text = String(value || "").trim();
  if (!text || MOJIBAKE_PATTERN.test(text)) {
    return fallback;
  }
  return text;
}

function setHeroCopy(config = {}) {
  const profile = config.profile || {};
  const title = document.getElementById("home-hero-title");
  const signature = document.getElementById("home-hero-signature");
  const hero = document.querySelector("[data-home-hero]");
  const cover = profile.cover || getComputedStyle(document.querySelector(".bg-layer")).backgroundImage.replace(/^url\(["']?|["']?\)$/g, "");
  const signatureText = readableText(profile.signature || profile.bio, DEFAULT_HERO_SIGNATURE);

  if (title) {
    title.textContent = `${readableText(profile.name, "HoraFeng")}\u7684\u535a\u5ba2`;
  }

  if (signature) {
    signature.textContent = signatureText;
  }

  if (hero && cover) {
    hero.style.setProperty("--home-hero-image", `url("${cover}")`);
  }
}

function setupHeroParallax() {
  const hero = document.querySelector("[data-home-hero]");
  if (!hero) {
    return;
  }

  window.requestAnimationFrame(() => hero.classList.add("is-ready"));

  const reset = () => {
    hero.style.setProperty("--hero-card-x", "0px");
    hero.style.setProperty("--hero-card-y", "0px");
    hero.style.setProperty("--hero-bg-x", "0px");
    hero.style.setProperty("--hero-bg-y", "0px");
    hero.style.setProperty("--hero-copy-x", "0px");
    hero.style.setProperty("--hero-copy-y", "0px");
    hero.style.setProperty("--hero-flow-x", "0px");
    hero.style.setProperty("--hero-flow-y", "0px");
  };

  if (reduceMotionQuery.matches || !pointerQuery.matches) {
    reset();
    return;
  }

  let frame = 0;
  let lastEvent = null;

  const update = () => {
    frame = 0;
    if (!lastEvent) {
      return;
    }

    const rect = hero.getBoundingClientRect();
    const x = (lastEvent.clientX - rect.left) / rect.width - 0.5;
    const y = (lastEvent.clientY - rect.top) / rect.height - 0.5;

    hero.style.setProperty("--hero-card-x", `${x * 1.5}px`);
    hero.style.setProperty("--hero-card-y", `${y * 1}px`);
    hero.style.setProperty("--hero-bg-x", `${x * -4}px`);
    hero.style.setProperty("--hero-bg-y", `${y * -3}px`);
    hero.style.setProperty("--hero-copy-x", `${x * 1.5}px`);
    hero.style.setProperty("--hero-copy-y", `${y * 1}px`);
    hero.style.setProperty("--hero-flow-x", `${x * 3}px`);
    hero.style.setProperty("--hero-flow-y", `${y * 2}px`);
  };

  hero.addEventListener("pointermove", (event) => {
    if (event.pointerType !== "mouse") {
      return;
    }
    lastEvent = event;
    if (!frame) {
      frame = window.requestAnimationFrame(update);
    }
  });
  hero.addEventListener("pointerleave", reset);
}

function setupHeroTextFlow() {
  const textPath = document.getElementById("home-hero-flow-text-path");
  if (!textPath || heroFlowFrame) {
    return;
  }

  if (reduceMotionQuery.matches) {
    textPath.setAttribute("startOffset", "4%");
    return;
  }

  let offset = -52;
  let lastTime = performance.now();
  const speed = 1.45;

  const tick = (time) => {
    const delta = Math.min(48, time - lastTime);
    lastTime = time;
    offset = ((offset + (delta / 1000) * speed + 52) % 52) - 52;
    textPath.setAttribute("startOffset", `${offset}%`);
    heroFlowFrame = window.requestAnimationFrame(tick);
  };

  heroFlowFrame = window.requestAnimationFrame(tick);
}

function setupInteractiveShowcase() {
  const showcase = document.querySelector("[data-interactive-showcase]");
  const display = document.querySelector("[data-showcase-display]");
  if (!showcase) {
    return;
  }

  const tabs = [...showcase.querySelectorAll("[data-showcase-target]")];
  const panels = [...document.querySelectorAll("[data-showcase-panel]")];
  const terminal = document.querySelector("[data-project-terminal]");
  const terminalText = "> build blog\n> sync notion\n> deploy cloudflare";

  const typeTerminal = () => {
    window.clearTimeout(terminalTypingTimer);
    if (!terminal) {
      return;
    }

    if (reduceMotionQuery.matches) {
      terminal.textContent = terminalText;
      return;
    }

    terminal.textContent = "";
    let index = 0;
    const tick = () => {
      if (!document.querySelector('[data-showcase-panel="projects"]')?.classList.contains("is-active")) {
        return;
      }
      terminal.textContent = terminalText.slice(0, index);
      index += 1;
      if (index <= terminalText.length) {
        terminalTypingTimer = window.setTimeout(tick, 28);
      }
    };
    tick();
  };

  const activate = (name) => {
    if (!name) {
      return;
    }

    showcase.dataset.active = name;
    if (display) {
      display.dataset.active = name;
    }
    tabs.forEach((tab) => {
      const active = tab.dataset.showcaseTarget === name;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", active ? "true" : "false");
    });
    panels.forEach((panel) => {
      panel.classList.toggle("is-active", panel.dataset.showcasePanel === name);
    });

    if (name === "projects") {
      typeTerminal();
    } else if (terminal) {
      window.clearTimeout(terminalTypingTimer);
      terminal.textContent = terminalText;
    }
  };

  tabs.forEach((tab) => {
    tab.addEventListener("mouseenter", () => activate(tab.dataset.showcaseTarget));
    tab.addEventListener("focus", () => activate(tab.dataset.showcaseTarget));
    tab.addEventListener("click", () => activate(tab.dataset.showcaseTarget));
  });

  activate(showcase.dataset.active || tabs[0]?.dataset.showcaseTarget);
}

function observeEntryCards() {
  const cards = [...document.querySelectorAll("#timeline .entry-card")];
  if (!cards.length) {
    return;
  }

  entryObserver?.disconnect();

  if (reduceMotionQuery.matches || !("IntersectionObserver" in window)) {
    cards.forEach((card) => card.classList.add("is-visible"));
    return;
  }

  entryObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return;
        }
        entry.target.classList.add("is-visible");
        entryObserver.unobserve(entry.target);
      });
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
  );

  cards.forEach((card, index) => {
    card.classList.add("home-entry-reveal");
    card.classList.remove("is-visible");
    card.style.setProperty("--home-entry-delay", `${Math.min(index % 8, 7) * 55}ms`);
    entryObserver.observe(card);
  });
}

function setupTimelineMutationObserver() {
  const timeline = document.getElementById("timeline");
  if (!timeline) {
    return;
  }

  const observer = new MutationObserver(() => observeEntryCards());
  observer.observe(timeline, { childList: true });
}

window.addEventListener("home:rendered", (event) => {
  setHeroCopy(event.detail?.config);
  observeEntryCards();
});

window.addEventListener("home:timeline-rendered", () => {
  observeEntryCards();
});

document.addEventListener("DOMContentLoaded", () => {
  setHeroCopy();
  setupHeroParallax();
  setupHeroTextFlow();
  setupInteractiveShowcase();
  setupTimelineMutationObserver();
});
