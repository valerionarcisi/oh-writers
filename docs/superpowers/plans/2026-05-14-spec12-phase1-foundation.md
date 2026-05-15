# Spec 12 · Phase 1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Posare la fondazione del Design System v2 "Ambient" in `packages/ui`: token architecture a 3 layer (raw → semantic → component) theme-ready, font migration verso Inter/Fraunces/IBM Plex Mono/Courier Prime, icon sprite Lucide-style, dev playground per validazione visiva. Zero regressioni sull'app esistente. **Accessibilità WCAG AA verificata su ogni task** (vedi spec 12 sez. 14).

**Architecture:** Tutti i nuovi token sono prefissati `--ds-*` per coesistere senza conflitto con i token dark esistenti (`--color-*`). Il file `themes/linen.css` definisce i raw token del tema linen (default); `themes/dark.css` fornisce lo scaffolding del tema dark per testare la resilienza del sistema; `tokens/semantic.css` mappa raw → semantic. I componenti DS-v2 (creati nelle Phase 2+) consumeranno solo i token semantici `--ds-*`. Nessun touch a `styles/tokens.css` esistente. Nessun touch ai feature files.

**Tech Stack:** CSS custom properties (3 layer), Google Fonts (Inter, Fraunces, IBM Plex Mono — Courier Prime già presente), SVG sprite, React 19, Vitest per Icon tests, TanStack Router per dev route.

---

## File Structure

**Create:**

- `packages/ui/src/themes/linen.css` — layer 1, raw token palette linen (default theme)
- `packages/ui/src/themes/dark.css` — layer 1, raw token palette dark mode (test di resilienza)
- `packages/ui/src/tokens/semantic.css` — layer 2 + 3, semantic tokens + component tokens
- `packages/ui/src/fonts/fonts.css` — @import Google Fonts (Inter, Fraunces, IBM Plex Mono)
- `packages/ui/src/icons/sprite.svg` — Lucide-style icon sprite con ~30 simboli
- `packages/ui/src/icons/Icon.tsx` — wrapper component `<Icon name="search" size={16} />`
- `packages/ui/src/icons/Icon.module.css` — style del wrapper
- `packages/ui/src/icons/Icon.test.tsx` — unit tests del wrapper
- `packages/ui/src/icons/icon-names.ts` — `IconName` union type, lista dei simboli disponibili
- `apps/web/app/routes/dev/tokens.tsx` — dev playground per ispezione visiva token + icons

**Modify:**

- `packages/ui/src/index.ts` — export `Icon` + `IconName`
- `apps/web/app/styles/global.css` — `@import` dei nuovi file (linen + semantic + fonts) DOPO il `tokens.css` esistente, in modo che convivano

**Not touched:**

- `packages/ui/src/styles/tokens.css` — invariato (dark theme legacy)
- Feature files in `apps/web/app/features/**` — invariati
- Primitives esistenti (Button, Tag, EditableCell, ecc.) — invariate

---

## Task 1: Linen theme — raw tokens (layer 1, default)

**Files:**

- Create: `packages/ui/src/themes/linen.css`

- [ ] **Step 1: Create the linen raw token file**

```css
/* packages/ui/src/themes/linen.css — layer 1 raw tokens, default theme */
:root {
  /* Linen — paper warm neutrals */
  --ds-linen-50:  #f5f3ee;
  --ds-linen-100: #ebe9e3;
  --ds-linen-200: #e2dfd6;
  --ds-linen-300: #d8d6cd;
  --ds-linen-400: #c4c2b9;
  --ds-linen-500: #a09e96;
  --ds-linen-600: #71706a;
  --ds-linen-700: #44413c;
  --ds-linen-800: #1c1a17;
  --ds-linen-soft: #e3e1d780;

  /* Pure */
  --ds-white: #ffffff;

  /* Clay — user action, page accent, primary */
  --ds-clay-50:  #f4dccb;
  --ds-clay-500: #8b3a1a;
  --ds-clay-600: #75301a;

  /* Leaf — Cesare, agent */
  --ds-leaf-50:  #e5e9d8;
  --ds-leaf-500: #5a6b3c;

  /* Category accents — muted, low chroma */
  --ds-cat-cast:        #6b3e7a;
  --ds-cat-crew:        #3d6b4a;
  --ds-cat-locations:   #9a5128;
  --ds-cat-vehicles:    #2c6168;
  --ds-cat-scenografia: #8a5a1f;
  --ds-cat-costumi:     #8b3565;
  --ds-cat-fotografia:  #34487a;
  --ds-cat-suono:       #5a6b25;
  --ds-cat-vfx:         #6a3e8a;
  --ds-cat-comparse:    #7a5524;

  /* Plan accents — Shot Plan v2 only */
  --ds-plan-1: #34487a;
  --ds-plan-2: #5a6b3c;
  --ds-plan-3: #8b3a1a;
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/ui/src/themes/linen.css
git commit -m "[OHW] feat(ui): add DS-v2 linen theme raw tokens"
```

---

## Task 2: Dark theme — raw tokens (layer 1, alternative)

**Files:**

- Create: `packages/ui/src/themes/dark.css`

Questo file dimostra che aggiungere un tema = rimappare solo il layer 1, senza toccare alcun componente.

- [ ] **Step 1: Create the dark theme override**

```css
/* packages/ui/src/themes/dark.css — layer 1 raw tokens, dark theme override */
/* Attivare con <html data-theme="dark"> */
:root[data-theme="dark"] {
  /* Linen scale inverted */
  --ds-linen-50:  #1c1a17;
  --ds-linen-100: #232220;
  --ds-linen-200: #2d2b27;
  --ds-linen-300: #3a3833;
  --ds-linen-400: #5c5a54;
  --ds-linen-500: #8c8a82;
  --ds-linen-600: #b8b6ad;
  --ds-linen-700: #d8d6cd;
  --ds-linen-800: #f5f3ee;
  --ds-linen-soft: rgba(216, 214, 205, 0.16);

  /* Pure in dark = first surface above bg */
  --ds-white: #232220;

  /* Clay — brighter on dark */
  --ds-clay-50:  #4a2614;
  --ds-clay-500: #d97551;
  --ds-clay-600: #b85e3f;

  /* Leaf — brighter on dark */
  --ds-leaf-50:  #2e3322;
  --ds-leaf-500: #9bb37a;

  /* Categories adjusted for dark (higher luminance, lower chroma to keep harmony) */
  --ds-cat-cast:        #b07fc4;
  --ds-cat-crew:        #79b58e;
  --ds-cat-locations:   #d18a5b;
  --ds-cat-vehicles:    #6fa9b1;
  --ds-cat-scenografia: #d1a866;
  --ds-cat-costumi:     #c97aa3;
  --ds-cat-fotografia:  #7a93ce;
  --ds-cat-suono:       #b5c270;
  --ds-cat-vfx:         #a87bc4;
  --ds-cat-comparse:    #c89968;

  --ds-plan-1: #7a93ce;
  --ds-plan-2: #9bb37a;
  --ds-plan-3: #d97551;
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/ui/src/themes/dark.css
git commit -m "[OHW] feat(ui): add DS-v2 dark theme scaffolding"
```

---

## Task 3: Semantic tokens — layer 2 + 3 (theme-agnostic)

**Files:**

- Create: `packages/ui/src/tokens/semantic.css`

- [ ] **Step 1: Create the semantic mapping file**

```css
/* packages/ui/src/tokens/semantic.css — layer 2 (semantic) + layer 3 (component) */
/* Consumed by all DS-v2 components. Never reference --ds-linen-*, --ds-clay-*, --ds-leaf-* directly. */
:root {
  /* ── Layer 2: Semantic ─────────────────────────────────────── */

  /* Backgrounds */
  --ds-bg:           var(--ds-linen-50);
  --ds-surface:      var(--ds-white);
  --ds-surface-alt:  var(--ds-linen-100);
  --ds-surface-deep: var(--ds-linen-200);

  /* Text */
  --ds-text:         var(--ds-linen-800);
  --ds-text-2:       var(--ds-linen-700);
  --ds-text-3:       var(--ds-linen-600);
  --ds-text-mute:    var(--ds-linen-500);
  --ds-text-faint:   var(--ds-linen-400);
  --ds-text-on-dark: var(--ds-linen-50);

  /* Lines */
  --ds-line:      var(--ds-linen-300);
  --ds-line-soft: var(--ds-linen-soft);

  /* Brand bichromy */
  --ds-action:       var(--ds-clay-500);
  --ds-action-hover: var(--ds-clay-600);
  --ds-action-soft:  var(--ds-clay-50);
  --ds-agent:        var(--ds-leaf-500);
  --ds-agent-soft:   var(--ds-leaf-50);

  /* Status */
  --ds-saved:    var(--ds-leaf-500);
  --ds-saving:   var(--ds-clay-500);
  --ds-warning:  var(--ds-clay-500);
  --ds-success:  var(--ds-leaf-500);
  --ds-info:     #34487a;

  /* Typography stacks */
  --ds-font-sans:    "Inter", -apple-system, system-ui, sans-serif;
  --ds-font-display: "Fraunces", Georgia, serif;
  --ds-font-mono:    "IBM Plex Mono", ui-monospace, monospace;
  --ds-font-script:  "Courier Prime", "Courier New", monospace;

  /* Spacing — px-based, decoupled from rem */
  --ds-space-1:  4px;
  --ds-space-2:  8px;
  --ds-space-3:  12px;
  --ds-space-4:  16px;
  --ds-space-5:  20px;
  --ds-space-6:  24px;
  --ds-space-8:  32px;
  --ds-space-10: 48px;
  --ds-space-12: 64px;

  /* Radius */
  --ds-radius-none: 0;
  --ds-radius-sm:   4px;
  --ds-radius-md:   8px;
  --ds-radius-lg:   12px;
  --ds-radius-pill: 100px;

  /* Shadow — depth hierarchy */
  --ds-shadow-0: 0 1px 2px rgba(28, 26, 23, 0.04);
  --ds-shadow-1: 0 2px 4px rgba(28, 26, 23, 0.06);
  --ds-shadow-2: 0 8px 24px -8px rgba(28, 26, 23, 0.12);
  --ds-shadow-3: 0 12px 32px -8px rgba(28, 26, 23, 0.18);
  --ds-shadow-4: 0 24px 64px -12px rgba(28, 26, 23, 0.3);

  /* Motion */
  --ds-ease:        cubic-bezier(0.2, 0.7, 0.2, 1);
  --ds-duration-1:  150ms;
  --ds-duration-2:  200ms;
  --ds-duration-3:  250ms;

  /* ── Layer 3: Component-specific derived tokens ───────────── */
  --ds-btn-primary-bg:    var(--ds-action);
  --ds-btn-primary-fg:    var(--ds-text-on-dark);
  --ds-btn-primary-hover: var(--ds-action-hover);

  --ds-card-bg:     var(--ds-surface);
  --ds-card-border: var(--ds-line);

  --ds-dock-bg:     var(--ds-surface);
  --ds-dock-shadow: var(--ds-shadow-3);

  --ds-margin-note-rail: var(--ds-agent-soft);
  --ds-margin-note-kind: var(--ds-agent);
}

@media (prefers-reduced-motion: reduce) {
  :root {
    --ds-duration-1: 0ms;
    --ds-duration-2: 0ms;
    --ds-duration-3: 0ms;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/ui/src/tokens/semantic.css
git commit -m "[OHW] feat(ui): add DS-v2 semantic + component token layer"
```

---

## Task 4: Font loading

**Files:**

- Create: `packages/ui/src/fonts/fonts.css`

Inter, Fraunces, IBM Plex Mono caricati da Google Fonts (self-hosting in spec separata futura). Courier Prime già caricato dal `tokens.css` esistente — non duplichiamo.

- [ ] **Step 1: Create the fonts file**

```css
/* packages/ui/src/fonts/fonts.css — DS-v2 font loading */
/* Self-hosting verrà fatto in spec separata; per ora Google Fonts CDN. */

@import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap");
@import url("https://fonts.googleapis.com/css2?family=Fraunces:opsz,ital,wght@9..144,0,400;9..144,0,500;9..144,0,600;9..144,1,400;9..144,1,500&display=swap");
@import url("https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&display=swap");

/* Numeric defaults — tabular nums on data attributes */
[data-num] {
  font-variant-numeric: tabular-nums;
  font-feature-settings: "tnum" on;
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/ui/src/fonts/fonts.css
git commit -m "[OHW] feat(ui): load Inter, Fraunces, IBM Plex Mono for DS-v2"
```

---

## Task 5: Icon sprite — Lucide-style SVG

**Files:**

- Create: `packages/ui/src/icons/sprite.svg`

Sprite con 30 simboli base. Stile: line-based, no fill (eccetto pochi pieni), `stroke="currentColor"`, viewBox 24×24, default `stroke-width="1.8"`.

- [ ] **Step 1: Create the sprite file**

```svg
<svg xmlns="http://www.w3.org/2000/svg" style="display:none">
  <defs>
    <symbol id="i-search" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></symbol>
    <symbol id="i-bell" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10 21a2 2 0 0 0 4 0"/></symbol>
    <symbol id="i-clock" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 3"/></symbol>
    <symbol id="i-plus" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></symbol>
    <symbol id="i-chevron-down" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></symbol>
    <symbol id="i-chevron-right" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></symbol>
    <symbol id="i-external" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6"/><path d="M10 14l10-10"/><path d="M20 14v6H4V4h6"/></symbol>
    <symbol id="i-download" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/></symbol>
    <symbol id="i-upload" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21V9"/><path d="M7 14l5-5 5 5"/><path d="M5 3h14"/></symbol>
    <symbol id="i-refresh" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 1 3 6.7"/><path d="M3 19v-6h6"/></symbol>
    <symbol id="i-pin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v6"/><path d="M7 9h10l-2 5H9z"/><path d="M12 14v8"/></symbol>
    <symbol id="i-lock" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></symbol>
    <symbol id="i-unlock" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/></symbol>
    <symbol id="i-eye" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></symbol>
    <symbol id="i-eye-off" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18"/><path d="M10 5.5a10 10 0 0 1 12 6.5 9.7 9.7 0 0 1-2.2 3.3"/><path d="M6.2 6.2A10 10 0 0 0 2 12s3 7 10 7a9.7 9.7 0 0 0 4.6-1.2"/></symbol>
    <symbol id="i-comment" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.5L3 21l1-4.5a8.4 8.4 0 1 1 17-5z"/></symbol>
    <symbol id="i-at" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/></symbol>
    <symbol id="i-mic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M19 11a7 7 0 0 1-14 0"/><path d="M12 18v3"/></symbol>
    <symbol id="i-play" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4l14 8-14 8z"/></symbol>
    <symbol id="i-pause" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></symbol>
    <symbol id="i-arrows-lr" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h18"/><path d="M9 6l-6 6 6 6"/><path d="M15 6l6 6-6 6"/></symbol>
    <symbol id="i-git-branch" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="12" cy="18" r="2"/><path d="M6 8v8a2 2 0 0 0 2 2h4"/><path d="M18 8a4 4 0 0 1-4 4h-4"/></symbol>
    <symbol id="i-compass" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M15 9l-2 6-4 2 2-6z"/></symbol>
    <symbol id="i-map-pin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2C8 2 5 5 5 9c0 5 7 13 7 13s7-8 7-13c0-4-3-7-7-7z"/><circle cx="12" cy="9" r="2"/></symbol>
    <symbol id="i-camera" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7l2-3h4l2 3"/><circle cx="12" cy="13" r="4"/></symbol>
    <symbol id="i-clipboard" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="12" height="18" rx="2"/><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h4"/></symbol>
    <symbol id="i-book" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5a2 2 0 0 1 2-2h13v18H6a2 2 0 0 1-2-2z"/><path d="M19 16H6a2 2 0 0 0-2 2"/></symbol>
    <symbol id="i-file-text" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><path d="M8 13h8M8 17h6"/></symbol>
    <symbol id="i-help" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4"/><path d="M12 17h.01"/></symbol>
    <symbol id="i-close" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></symbol>
  </defs>
</svg>
```

- [ ] **Step 2: Commit**

```bash
git add packages/ui/src/icons/sprite.svg
git commit -m "[OHW] feat(ui): add DS-v2 icon sprite (30 Lucide-style symbols)"
```

---

## Task 6: Icon component + types

**Files:**

- Create: `packages/ui/src/icons/icon-names.ts`
- Create: `packages/ui/src/icons/Icon.tsx`
- Create: `packages/ui/src/icons/Icon.module.css`

- [ ] **Step 1: Write the icon-names file**

```typescript
// packages/ui/src/icons/icon-names.ts
export const ICON_NAMES = [
  "search",
  "bell",
  "clock",
  "plus",
  "chevron-down",
  "chevron-right",
  "external",
  "download",
  "upload",
  "refresh",
  "pin",
  "lock",
  "unlock",
  "eye",
  "eye-off",
  "comment",
  "at",
  "mic",
  "play",
  "pause",
  "arrows-lr",
  "git-branch",
  "compass",
  "map-pin",
  "camera",
  "clipboard",
  "book",
  "file-text",
  "help",
  "close",
] as const;

export type IconName = (typeof ICON_NAMES)[number];
```

- [ ] **Step 2: Write the Icon CSS module**

```css
/* packages/ui/src/icons/Icon.module.css */
.icon {
  display: inline-block;
  vertical-align: middle;
  flex-shrink: 0;
  width: 1em;
  height: 1em;
  color: currentColor;
}
```

- [ ] **Step 3: Write the Icon component**

```tsx
// packages/ui/src/icons/Icon.tsx
import type { IconName } from "./icon-names";
import styles from "./Icon.module.css";

export type IconProps = {
  name: IconName;
  size?: number | string;
  className?: string;
  "aria-label"?: string;
  "aria-hidden"?: boolean;
};

export function Icon({
  name,
  size = 16,
  className,
  "aria-label": ariaLabel,
  "aria-hidden": ariaHidden,
}: IconProps) {
  const isDecorative = ariaLabel === undefined;
  return (
    <svg
      className={[styles.icon, className].filter(Boolean).join(" ")}
      width={size}
      height={size}
      role={isDecorative ? "presentation" : "img"}
      aria-hidden={isDecorative ? true : ariaHidden}
      aria-label={ariaLabel}
    >
      <use href={`#i-${name}`} />
    </svg>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/icons/icon-names.ts packages/ui/src/icons/Icon.tsx packages/ui/src/icons/Icon.module.css
git commit -m "[OHW] feat(ui): add Icon component with IconName type"
```

---

## Task 7: Icon component tests

**Files:**

- Create: `packages/ui/src/icons/Icon.test.tsx`
- Modify: `packages/ui/package.json` — add `vitest` + `@testing-library/react` to devDependencies if not present

- [ ] **Step 1: Verify the ui package has vitest available**

```bash
cd packages/ui && cat package.json | grep -E "vitest|@testing-library"
```

Expected output: lines containing `vitest` and `@testing-library/react`. If missing, proceed to Step 2; otherwise skip to Step 3.

- [ ] **Step 2: Add vitest + testing-library to packages/ui (only if needed)**

```bash
cd packages/ui && pnpm add -D vitest @testing-library/react @testing-library/jest-dom jsdom
```

Then add to `packages/ui/package.json` scripts:

```json
{
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

Create `packages/ui/vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: false,
    setupFiles: [],
  },
});
```

- [ ] **Step 3: Write the failing test**

```tsx
// packages/ui/src/icons/Icon.test.tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Icon } from "./Icon";

describe("Icon", () => {
  it("renders an SVG referencing the correct sprite symbol", () => {
    const { container } = render(<Icon name="search" />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    const use = svg!.querySelector("use");
    expect(use).not.toBeNull();
    expect(use!.getAttribute("href")).toBe("#i-search");
  });

  it("uses default size 16x16 when not specified", () => {
    const { container } = render(<Icon name="bell" />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("width")).toBe("16");
    expect(svg.getAttribute("height")).toBe("16");
  });

  it("accepts custom size", () => {
    const { container } = render(<Icon name="bell" size={24} />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("width")).toBe("24");
    expect(svg.getAttribute("height")).toBe("24");
  });

  it("is decorative by default (aria-hidden true, role presentation)", () => {
    const { container } = render(<Icon name="close" />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("role")).toBe("presentation");
    expect(svg.getAttribute("aria-label")).toBeNull();
  });

  it("becomes meaningful when aria-label is provided", () => {
    const { container } = render(<Icon name="close" aria-label="Chiudi" />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("role")).toBe("img");
    expect(svg.getAttribute("aria-label")).toBe("Chiudi");
    expect(svg.getAttribute("aria-hidden")).not.toBe("true");
  });
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/ui && pnpm test`

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/icons/Icon.test.tsx packages/ui/package.json packages/ui/vitest.config.ts
git commit -m "[OHW] test(ui): add Icon component tests"
```

---

## Task 8: Export Icon from the ui package barrel

**Files:**

- Modify: `packages/ui/src/index.ts`

- [ ] **Step 1: Add Icon export to the barrel**

Append at the bottom of `packages/ui/src/index.ts`:

```typescript
// ─── DS-v2 ──────────────────────────────────────────────────
export { Icon } from "./icons/Icon";
export type { IconName, IconProps } from "./icons/icon-names";
export { ICON_NAMES } from "./icons/icon-names";
```

Note: `IconProps` is exported from `./icons/Icon` not `./icons/icon-names`. Fix the line to:

```typescript
// ─── DS-v2 ──────────────────────────────────────────────────
export { Icon } from "./icons/Icon";
export type { IconProps } from "./icons/Icon";
export type { IconName } from "./icons/icon-names";
export { ICON_NAMES } from "./icons/icon-names";
```

- [ ] **Step 2: Run typecheck to verify**

Run: `cd packages/ui && pnpm typecheck`

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/index.ts
git commit -m "[OHW] feat(ui): export Icon + IconName from @oh-writers/ui"
```

---

## Task 9: Wire DS-v2 imports into the web app

**Files:**

- Modify: `apps/web/app/styles/global.css`

I nuovi token convivono con quelli esistenti — entrambi sotto `:root`, prefissi diversi, nessun conflitto.

- [ ] **Step 1: Add DS-v2 imports to global.css**

Modificare la prima riga di `apps/web/app/styles/global.css` da:

```css
@import "../../../../packages/ui/src/styles/tokens.css";
```

a:

```css
/* Legacy dark tokens (in use until each page is migrated to DS-v2) */
@import "../../../../packages/ui/src/styles/tokens.css";

/* DS-v2 Ambient — token architecture (linen default + dark variant + semantic + fonts) */
@import "../../../../packages/ui/src/themes/linen.css";
@import "../../../../packages/ui/src/themes/dark.css";
@import "../../../../packages/ui/src/tokens/semantic.css";
@import "../../../../packages/ui/src/fonts/fonts.css";
```

- [ ] **Step 2: Start dev server and verify no break**

Run: `pnpm --filter @oh-writers/web dev`

Expected:
- Server starts successfully
- Existing pages render exactly as before (no visual regression — old `--color-*` tokens still drive them)
- DevTools → Elements → :root → must include both old and new tokens (`--color-bg: #0a0a0a` AND `--ds-bg: #f5f3ee`)

Verifica via Bash:

```bash
curl -s http://localhost:1234 | grep -c "DS-v2" || echo "Body unchanged, OK"
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/styles/global.css
git commit -m "[OHW] feat(web): import DS-v2 token architecture + fonts in global.css"
```

---

## Task 10: Dev playground route — token + icon inspector

**Files:**

- Create: `apps/web/app/routes/dev/tokens.tsx`

Pagina pubblica `/dev/tokens` accessibile solo in dev. Mostra tutti i token DS-v2 + tutte le icone, per validazione visiva durante l'implementazione.

- [ ] **Step 1: Check how other routes are structured**

Run: `ls apps/web/app/routes/ | head -10`

Expected: lista di file `.tsx`. Identificare il pattern (es. `__root.tsx`, `index.tsx`, route file-based).

- [ ] **Step 2: Create the playground route**

```tsx
// apps/web/app/routes/dev/tokens.tsx
import { createFileRoute } from "@tanstack/react-router";
import { Icon, ICON_NAMES } from "@oh-writers/ui";

export const Route = createFileRoute("/dev/tokens")({
  component: TokensPlayground,
});

const RAW_LINEN = [
  "--ds-linen-50", "--ds-linen-100", "--ds-linen-200", "--ds-linen-300",
  "--ds-linen-400", "--ds-linen-500", "--ds-linen-600", "--ds-linen-700",
  "--ds-linen-800",
];
const RAW_BRAND = [
  "--ds-white", "--ds-clay-50", "--ds-clay-500", "--ds-clay-600",
  "--ds-leaf-50", "--ds-leaf-500",
];
const RAW_CAT = [
  "--ds-cat-cast", "--ds-cat-crew", "--ds-cat-locations", "--ds-cat-vehicles",
  "--ds-cat-scenografia", "--ds-cat-costumi", "--ds-cat-fotografia",
  "--ds-cat-suono", "--ds-cat-vfx", "--ds-cat-comparse",
];
const SEMANTIC = [
  "--ds-bg", "--ds-surface", "--ds-surface-alt", "--ds-surface-deep",
  "--ds-text", "--ds-text-2", "--ds-text-3", "--ds-text-mute", "--ds-text-faint",
  "--ds-line", "--ds-line-soft",
  "--ds-action", "--ds-action-hover", "--ds-action-soft",
  "--ds-agent", "--ds-agent-soft",
];

function Swatch({ token }: { token: string }) {
  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: 8, borderRadius: 4,
      }}
    >
      <div
        style={{
          width: 40, height: 40, borderRadius: 6,
          background: `var(${token})`,
          border: "1px solid var(--ds-line)",
        }}
      />
      <code style={{ fontFamily: "var(--ds-font-mono)", fontSize: 11 }}>
        {token}
      </code>
    </div>
  );
}

function TokensPlayground() {
  return (
    <div
      style={{
        background: "var(--ds-bg)",
        color: "var(--ds-text)",
        fontFamily: "var(--ds-font-sans)",
        minHeight: "100vh",
        padding: "48px 64px",
      }}
    >
      <h1
        style={{
          fontFamily: "var(--ds-font-display)",
          fontStyle: "italic",
          fontWeight: 400,
          fontSize: 48,
          margin: "0 0 8px",
          letterSpacing: "-0.02em",
        }}
      >
        DS-v2 token inspector
      </h1>
      <p
        style={{
          fontFamily: "var(--ds-font-mono)",
          fontSize: 11,
          color: "var(--ds-text-3)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          marginBottom: 48,
        }}
      >
        Tema attivo: linen (default) · <button
          onClick={() => {
            const root = document.documentElement;
            root.dataset.theme = root.dataset.theme === "dark" ? "" : "dark";
          }}
          style={{
            background: "var(--ds-action)", color: "var(--ds-text-on-dark)",
            border: 0, padding: "4px 10px", borderRadius: 4,
            fontFamily: "inherit", fontSize: 11, cursor: "pointer",
            textTransform: "uppercase", letterSpacing: "0.08em",
          }}
        >
          Switch theme
        </button>
      </p>

      <h2 style={{ fontFamily: "var(--ds-font-mono)", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--ds-text-3)", marginTop: 32 }}>Layer 1 · Linen scale</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4, marginBottom: 32 }}>
        {RAW_LINEN.map((t) => <Swatch key={t} token={t} />)}
      </div>

      <h2 style={{ fontFamily: "var(--ds-font-mono)", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--ds-text-3)" }}>Layer 1 · Brand</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4, marginBottom: 32 }}>
        {RAW_BRAND.map((t) => <Swatch key={t} token={t} />)}
      </div>

      <h2 style={{ fontFamily: "var(--ds-font-mono)", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--ds-text-3)" }}>Layer 1 · Categorie</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4, marginBottom: 32 }}>
        {RAW_CAT.map((t) => <Swatch key={t} token={t} />)}
      </div>

      <h2 style={{ fontFamily: "var(--ds-font-mono)", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--ds-text-3)" }}>Layer 2 · Semantic</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4, marginBottom: 48 }}>
        {SEMANTIC.map((t) => <Swatch key={t} token={t} />)}
      </div>

      <h2 style={{ fontFamily: "var(--ds-font-mono)", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--ds-text-3)" }}>Typography</h2>
      <div style={{ background: "var(--ds-surface)", border: "1px solid var(--ds-line)", borderRadius: 8, padding: 32, marginBottom: 32 }}>
        <div style={{ fontFamily: "var(--ds-font-display)", fontStyle: "italic", fontWeight: 400, fontSize: 48, marginBottom: 16 }}>
          Fraunces italic · display
        </div>
        <div style={{ fontFamily: "var(--ds-font-sans)", fontSize: 14, marginBottom: 8 }}>
          Inter · UI body text — qui vive il 90% del testo dell'app.
        </div>
        <div style={{ fontFamily: "var(--ds-font-mono)", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ds-text-3)", marginBottom: 8 }}>
          IBM Plex Mono · LABEL & NUMERI
        </div>
        <div style={{ fontFamily: "var(--ds-font-script)", fontSize: 13.5, lineHeight: 1.7 }}>
          SC. 3 INT. PIZZERIA SOTTOSCALA — Sera
        </div>
      </div>

      <h2 style={{ fontFamily: "var(--ds-font-mono)", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--ds-text-3)" }}>Icons</h2>
      <div style={{ background: "var(--ds-surface)", border: "1px solid var(--ds-line)", borderRadius: 8, padding: 24, display: "grid", gridTemplateColumns: "repeat(10, 1fr)", gap: 16 }}>
        {ICON_NAMES.map((name) => (
          <div key={name} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, color: "var(--ds-text-2)" }}>
            <Icon name={name} size={20} />
            <code style={{ fontFamily: "var(--ds-font-mono)", fontSize: 9, color: "var(--ds-text-mute)" }}>{name}</code>
          </div>
        ))}
      </div>
    </div>
  );
}
```

Importante: l'`<svg>` sprite deve essere disponibile nel documento. Aggiungere il caricamento dello sprite nel `__root.tsx` o nel componente come fetch sincrono.

- [ ] **Step 3: Inject sprite into the root document**

Verificare il pattern del `__root.tsx`:

```bash
cat apps/web/app/routes/__root.tsx | head -60
```

Aggiungere lo sprite come componente client-side che fa `fetch` del file SVG e lo inietta nel body. Crea il file:

```tsx
// packages/ui/src/icons/SpriteLoader.tsx
import { useEffect } from "react";

let injected = false;

export function SpriteLoader() {
  useEffect(() => {
    if (injected) return;
    injected = true;
    fetch("/icons/sprite.svg")
      .then((r) => r.text())
      .then((svg) => {
        const div = document.createElement("div");
        div.innerHTML = svg;
        div.style.position = "absolute";
        div.style.width = "0";
        div.style.height = "0";
        div.style.overflow = "hidden";
        div.setAttribute("aria-hidden", "true");
        document.body.insertBefore(div, document.body.firstChild);
      });
  }, []);
  return null;
}
```

Esportare `SpriteLoader` dal barrel:

```typescript
// in packages/ui/src/index.ts, sotto la sezione DS-v2
export { SpriteLoader } from "./icons/SpriteLoader";
```

E copiare il file SVG nella public folder di apps/web — il path `/icons/sprite.svg` deve risolvere a un file servito staticamente:

```bash
mkdir -p apps/web/public/icons
cp packages/ui/src/icons/sprite.svg apps/web/public/icons/sprite.svg
```

Mount `<SpriteLoader />` nel `__root.tsx` dell'app (dentro al body).

- [ ] **Step 4: Verify the playground works**

```bash
pnpm --filter @oh-writers/web dev
```

Visit `http://localhost:1234/dev/tokens`. Expected:
- Pagina con sfondo linen
- 4 sezioni di swatch (Linen scale, Brand, Categorie, Semantic)
- 4 esempi tipografici renderizzati con i font corretti
- 30 icone in griglia con label sotto
- Bottone "Switch theme" che alterna dark/linen senza ricaricamento

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/routes/dev/tokens.tsx apps/web/public/icons/sprite.svg packages/ui/src/icons/SpriteLoader.tsx packages/ui/src/index.ts apps/web/app/routes/__root.tsx
git commit -m "[OHW] feat(web): add /dev/tokens playground for DS-v2 validation"
```

---

## Task 11: Visual regression + a11y verification

Verificare (1) zero regression visive sull'app esistente, (2) la fondazione DS-v2 rispetta WCAG AA, (3) le icone sono usabili da screen reader.

**Files:** none modified — solo verifica.

- [ ] **Step 1: Start dev server**

Run: `pnpm --filter @oh-writers/web dev`

- [ ] **Step 2: Smoke test delle pagine esistenti**

Naviga e verifica che lo styling sia identico a prima:

- `http://localhost:1234/` (home)
- `http://localhost:1234/projects` (lista progetti)
- `http://localhost:1234/projects/<id>/budget`
- `http://localhost:1234/projects/<id>/breakdown`
- `http://localhost:1234/projects/<id>/screenplay`

Expected: nessun cambiamento visivo. In DevTools → `:root` devono comparire entrambi i set di token (`--color-bg: #0a0a0a` AND `--ds-bg: #f5f3ee`).

- [ ] **Step 3: Run the full test suite**

```bash
pnpm --filter @oh-writers/web test
```

Expected: tutti i test passano.

- [ ] **Step 4: Typecheck across monorepo**

```bash
pnpm -r typecheck
```

Expected: zero errori.

- [ ] **Step 5: Contrast verification on /dev/tokens**

Aprire `http://localhost:1234/dev/tokens`. Usare Chrome DevTools → Lighthouse → Accessibility audit.

Expected: score ≥ 95, zero violazioni critiche.

Verificare manualmente con il "Contrast" inspector di DevTools (hover su `--ds-text` swatch label):

| Combinazione | Ratio atteso |
|---|---|
| `--ds-text` su `--ds-bg` | ≥ 13:1 (AAA) |
| `--ds-text-3` su `--ds-bg` | ≥ 5:1 (AA) |
| `--ds-action` su `--ds-bg` | ≥ 4.5:1 (AA) |
| `--ds-agent` su `--ds-bg` | ≥ 4.5:1 (AA) |
| `--ds-text-on-dark` su `--ds-action` | ≥ 4.5:1 (AA) |

Ripetere dopo aver attivato il tema dark via il bottone "Switch theme". Ratio devono restare AA su entrambi i temi.

Se un ratio è sotto soglia, è un bug del token (linen-600 o linen-500 non abbastanza scuro/chiaro) — fixare il valore in `themes/linen.css` o `themes/dark.css` prima di chiudere la Phase 1.

- [ ] **Step 6: Reduced-motion verification**

In DevTools → Rendering → "Emulate CSS media feature prefers-reduced-motion" → `reduce`.

Aprire `http://localhost:1234/dev/tokens` e cliccare "Switch theme". Expected: cambio istantaneo, nessuna transizione visibile.

(In Phase 1 non ci sono componenti animati — la verifica conferma che i token DS-v2 hookano correttamente `prefers-reduced-motion`.)

- [ ] **Step 7: Keyboard navigation on /dev/tokens**

Visitare `/dev/tokens`, mai toccare il mouse:

- `Tab` deve raggiungere il bottone "Switch theme" come prima azione interattiva.
- `Enter` o `Space` lo attiva → tema cambia.
- `Shift+Tab` torna indietro.

Verificare che il focus ring sia visibile sul bottone (default UA acceptable per Phase 1; sarà tematizzato in Phase 2 quando aggiungeremo il Button DS-v2).

- [ ] **Step 8: Screen reader spot-check su Icon**

Su macOS: attivare VoiceOver (`⌘F5`).

Caso 1 — icona decorativa (default in `/dev/tokens`):
- VO non deve annunciare l'icona. Se è inline dentro un bottone "Switch theme", VO annuncia solo "Switch theme, button" — non "search image, Switch theme button".

Caso 2 — icona meaningful: creare temporaneamente un test:

```tsx
// Aggiungere nel playground come ultima sezione:
<button style={{ background: "var(--ds-surface)", border: "1px solid var(--ds-line)", padding: 8, borderRadius: 4 }}>
  <Icon name="close" aria-label="Chiudi" size={16} />
</button>
```

VO deve annunciare: "Chiudi, button" (l'aria-label dell'icona promuove la sua leggibilità).

Rimuovere il test temporaneo dopo la verifica.

- [ ] **Step 9: Done check**

Se Step 1-8 sono tutti verdi, Phase 1 è completa. Nessun commit richiesto in questo task (è pure verifica).

Se uno step fallisce, **non procedere alla Phase 2** finché il problema non è risolto. Il problema più probabile è un contrast ratio sotto soglia: fixare il token raw in `themes/<theme>.css` e re-runnare Step 5.

---

## Self-Review Summary

**Spec coverage:**

- ✅ Section 3.1 Layer 1 — Task 1 (linen) + Task 2 (dark)
- ✅ Section 3.2 Layer 2 — Task 3 (semantic)
- ✅ Section 3.3 Layer 3 — Task 3 (component tokens inclusi)
- ✅ Section 3.4 "Aggiungere un tema" — dimostrato da Task 2 dark + Task 10 toggle switch
- ✅ Section 11 Typography — Task 4 (fonts.css)
- ✅ Section 12 Iconography — Task 5 (sprite) + Task 6 (component) + Task 7 (tests)
- ⏭ Section 4 Tre archetipi — out of Phase 1 (vengono in Phase 4+)
- ⏭ Section 5 Tre modalità Cesare — out of Phase 1 (Phase 3)
- ⏭ Section 6 Shell components — out of Phase 1 (Phase 3)
- ⏭ Section 7 Pattern Cesare — out of Phase 1 (Phase 3)
- ⏭ Section 8 Primitives — out of Phase 1 (Phase 2)

**Out of scope (per altre phase):**

- Primitive nuove (Popover, Drawer, Scrim, Tooltip, ToggleChip, Pill, SavePill, Presence) → Phase 2
- Composites Cesare + data + shell → Phase 3
- Layouts (Working/Editorial/Planner) → Phase 3
- Page refactors → Phase 4+

**Criterio di "done" per Phase 1:**

1. `pnpm --filter @oh-writers/web dev` parte senza errori
2. `/dev/tokens` mostra tutti i token + icone correttamente
3. Tema dark si attiva con un click e modifica tutti gli swatch
4. Le pagine esistenti dell'app sono **identiche** a prima (zero regression)
5. `pnpm -r typecheck` e `pnpm --filter @oh-writers/ui test` verdi
6. **A11y**: Lighthouse score ≥ 95 su `/dev/tokens`, contrast AA su entrambi i temi, keyboard nav OK, VoiceOver annuncia correttamente icone decorative vs meaningful, `prefers-reduced-motion` rispettato
