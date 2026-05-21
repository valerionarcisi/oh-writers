// Interactive tour controller — pure DOM, no framework.
// Each step swaps the active panel + announces to AT.

const steps = Array.from(document.querySelectorAll("[data-tour-step]"));
const panels = Array.from(document.querySelectorAll("[data-tour-panel]"));

const activate = (id) => {
  steps.forEach((s) => {
    const isActive = s.dataset.tourStep === id;
    s.setAttribute("aria-current", isActive ? "true" : "false");
  });
  panels.forEach((p) => {
    const isActive = p.dataset.tourPanel === id;
    if (isActive) {
      p.setAttribute("data-active", "");
    } else {
      p.removeAttribute("data-active");
    }
  });
};

steps.forEach((s) => {
  s.addEventListener("click", () => activate(s.dataset.tourStep));
});

// Logline typewriter — runs only when logline panel becomes active and not yet played.
const loglineText =
  "Una sceneggiatrice di Roma scopre che il suo nuovo film coincide, scena per scena, con la vita di una donna che non ha mai conosciuto.";
const loglineTarget = document.querySelector("[data-logline-text]");
let loglinePlayed = false;

const playLogline = () => {
  if (loglinePlayed || !loglineTarget) return;
  loglinePlayed = true;
  loglineTarget.textContent = "";
  loglineTarget.classList.add("mock-logline__cursor");
  let i = 0;
  const tick = () => {
    if (i < loglineText.length) {
      loglineTarget.textContent += loglineText[i];
      i += 1;
      setTimeout(tick, 18 + Math.random() * 30);
    } else {
      loglineTarget.classList.remove("mock-logline__cursor");
    }
  };
  setTimeout(tick, 400);
};

// Watch for logline panel activation via mutation observer.
const loglinePanel = document.querySelector('[data-tour-panel="logline"]');
if (loglinePanel) {
  const observer = new MutationObserver(() => {
    if (loglinePanel.hasAttribute("data-active")) playLogline();
  });
  observer.observe(loglinePanel, { attributes: true });
  // Trigger on initial load if already active.
  if (loglinePanel.hasAttribute("data-active")) playLogline();
}

// Sticky nav scroll border — mirrors app TopBar.
const nav = document.querySelector("[data-nav]");
if (nav) {
  const onScroll = () => {
    if (window.scrollY > 8) nav.classList.add("is-scrolled");
    else nav.classList.remove("is-scrolled");
  };
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
}

