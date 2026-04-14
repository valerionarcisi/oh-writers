# Spec 07b — Design System Refresh

## Direction

Move from brutalist (flat, sharp, no decoration) to **dark modern SaaS** — clean, inviting, with depth and polish. The app is a large text editor for screenwriters; the design must serve writing first.

### References (spirit, not copy)

- **Notion** — clean hierarchy, whitespace, content-first chrome
- **Quip** — warm editor feel, unobtrusive toolbar, collaborative presence
- **Asana** — modern SaaS nav, polished components, subtle animations
- **Linear** — dark theme done right, keyboard-first, fast feel

### Design Principles

1. **Content is the hero** — editor area gets maximum space and visual prominence. Chrome fades.
2. **Warm dark, not cold** — dark backgrounds keep warm undertones (current palette is good). Never pure black `#000`.
3. **Depth through light** — use subtle shadows, layered surfaces, and opacity to create hierarchy. No flat pancake.
4. **Soft edges** — rounded corners everywhere (8px default). Sharp corners only for the screenplay page itself (it represents a real page).
5. **Motion with purpose** — micro-animations for state changes (hover, focus, open/close). Never decorative. Always respect `prefers-reduced-motion`.
6. **Keyboard-first** — visible focus rings, clear active states. Writing tools live and die by keyboard UX.

---

## Color Palette

Keep the warm dark foundation. Evolve it with more layering and a refined accent.

```css
:root {
  /* ── Backgrounds (warm dark, layered) ── */
  --color-bg: #0f0f0d;
  --color-surface: #1a1917;
  --color-elevated: #222120;
  --color-overlay: #2a2928;

  /* ── Text ── */
  --color-fg: #ededec;
  --color-fg-secondary: #a0a09b;
  --color-fg-muted: #6b6b66;
  --color-fg-inverse: #0f0f0d;

  /* ── Borders ── */
  --color-border: rgba(255, 255, 255, 0.08);
  --color-border-strong: rgba(255, 255, 255, 0.15);
  --color-border-focus: var(--color-accent);

  /* ── Accent (amber, slightly warmer) ── */
  --color-accent: #e0a832;
  --color-accent-hover: #c9962d;
  --color-accent-subtle: rgba(224, 168, 50, 0.12);
  --color-accent-fg: #0f0f0d;

  /* ── Semantic ── */
  --color-danger: #e5534b;
  --color-danger-subtle: rgba(229, 83, 75, 0.12);
  --color-warning: #d4943a;
  --color-warning-subtle: rgba(212, 148, 58, 0.12);
  --color-success: #57ab5a;
  --color-success-subtle: rgba(87, 171, 90, 0.12);
  --color-info: #539bf5;
  --color-info-subtle: rgba(83, 155, 245, 0.12);

  /* ── Diff ── */
  --color-diff-insert-bg: rgba(87, 171, 90, 0.15);
  --color-diff-insert-fg: #57ab5a;
  --color-diff-delete-bg: rgba(229, 83, 75, 0.15);
  --color-diff-delete-fg: #e5534b;
}
```

### Key changes from current

- Borders use `rgba` transparency instead of hard hex → integrates with any surface
- Semantic colors now have `*-subtle` variants for backgrounds (tags, badges, alerts)
- Accent slightly warmer and more saturated
- Added `--color-info` for non-destructive actions

---

## Typography

Keep the three-family system but refine the scale.

```css
:root {
  /* ── Families ── */
  --font-sans: "Inter", system-ui, sans-serif;
  --font-serif: "Lora", "Georgia", serif;
  --font-mono: "Courier Prime", "Courier New", monospace;

  /* ── Scale (fluid, clamp-based) ── */
  --text-xs: clamp(0.6875rem, 0.65rem + 0.1vw, 0.75rem); /* ~11-12px */
  --text-sm: clamp(0.8125rem, 0.78rem + 0.1vw, 0.875rem); /* ~13-14px */
  --text-base: clamp(0.875rem, 0.85rem + 0.1vw, 1rem); /* ~14-16px */
  --text-lg: clamp(1rem, 0.95rem + 0.15vw, 1.125rem); /* ~16-18px */
  --text-xl: clamp(1.125rem, 1.05rem + 0.2vw, 1.25rem); /* ~18-20px */
  --text-2xl: clamp(1.375rem, 1.25rem + 0.3vw, 1.5rem); /* ~22-24px */
  --text-3xl: clamp(1.75rem, 1.5rem + 0.5vw, 2rem); /* ~28-32px */

  /* ── Line heights ── */
  --leading-tight: 1.2;
  --leading-normal: 1.5;
  --leading-relaxed: 1.7;

  /* ── Font weights ── */
  --weight-normal: 400;
  --weight-medium: 500;
  --weight-semibold: 600;
  --weight-bold: 700;

  /* ── Letter spacing ── */
  --tracking-tight: -0.01em;
  --tracking-normal: 0;
  --tracking-wide: 0.02em;
  --tracking-caps: 0.06em;
}
```

### Usage rules

- **Sans (Inter)**: all UI — nav, labels, buttons, metadata
- **Serif (Lora)**: headings on content pages (project title, document title), logline display
- **Mono (Courier Prime)**: screenplay editor only — it represents the printed page
- Headings: serif `--weight-semibold`, `--leading-tight`, `--tracking-tight`
- Body: sans `--weight-normal`, `--leading-normal`
- Labels/meta: sans `--text-sm`, `--color-fg-secondary`, `--tracking-wide` for all-caps labels

---

## Spacing

Same scale, add `--space-0` and `--space-20`.

```css
:root {
  --space-0: 0;
  --space-px: 1px;
  --space-1: 0.25rem; /* 4px */
  --space-2: 0.5rem; /* 8px */
  --space-3: 0.75rem; /* 12px */
  --space-4: 1rem; /* 16px */
  --space-5: 1.25rem; /* 20px */
  --space-6: 1.5rem; /* 24px */
  --space-8: 2rem; /* 32px */
  --space-10: 2.5rem; /* 40px */
  --space-12: 3rem; /* 48px */
  --space-16: 4rem; /* 64px */
  --space-20: 5rem; /* 80px */
}
```

---

## Radius

```css
:root {
  --radius-sm: 4px;
  --radius-md: 8px; /* default for most components */
  --radius-lg: 12px; /* cards, modals, panels */
  --radius-xl: 16px; /* large containers, dialogs */
  --radius-full: 9999px; /* pills, avatars */
  --radius-none: 0; /* screenplay page representation only */
}
```

### Rule

Everything gets `--radius-md` by default. Exceptions:

- Screenplay page view: `--radius-none` (it's a real page, sharp corners)
- Avatars, status dots: `--radius-full`
- Modals, large panels: `--radius-lg`

---

## Shadows & Elevation

```css
:root {
  --shadow-xs: 0 1px 2px rgba(0, 0, 0, 0.3);
  --shadow-sm: 0 2px 4px rgba(0, 0, 0, 0.25);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.3);
  --shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.35);
  --shadow-xl: 0 16px 48px rgba(0, 0, 0, 0.4);

  /* Ring for focus states */
  --ring-focus: 0 0 0 2px var(--color-bg), 0 0 0 4px var(--color-accent);
}
```

Layering model:

1. `--color-bg` — page background
2. `--color-surface` + `--shadow-xs` — cards, panels, sidebar
3. `--color-elevated` + `--shadow-md` — dropdowns, popovers
4. `--color-overlay` + `--shadow-lg` — modals, dialogs
5. Focus ring via `--ring-focus` on all interactive elements

---

## Transitions

```css
:root {
  --duration-fast: 100ms;
  --duration-normal: 150ms;
  --duration-slow: 250ms;
  --ease-default: cubic-bezier(0.25, 0.1, 0.25, 1);
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
}
```

- Hover/focus: `--duration-fast`
- Open/close, toggle: `--duration-normal`
- Page transitions, panel slide: `--duration-slow`
- Always wrap in `@media (prefers-reduced-motion: no-preference)`

---

## UI Components Needed

### Existing (to restyle)

- `Button` — add rounded corners, hover shadow lift, focus ring
- `Badge` — add subtle background variants, rounded pill shape
- `Sidebar` — add depth, smooth collapse animation
- `AppShell` — refine grid, add transition for sidebar toggle

### New components for `packages/ui/`

| Component    | Purpose                                                         |
| ------------ | --------------------------------------------------------------- |
| `Input`      | Text input with label, error state, icon slot                   |
| `TextArea`   | Multi-line input, auto-resize                                   |
| `Select`     | Custom styled select with dropdown                              |
| `FormField`  | Label + input + error message wrapper                           |
| `Dialog`     | Modal with overlay, focus trap, close on Escape                 |
| `Toast`      | Notification stack, auto-dismiss, variants (success/error/info) |
| `Skeleton`   | Loading placeholder, animated shimmer                           |
| `EmptyState` | Icon + title + description + optional action                    |
| `Avatar`     | User avatar with initials fallback, status dot                  |
| `Dropdown`   | Popover menu with keyboard nav                                  |
| `Tabs`       | Tab bar for switching views (versions, documents)               |
| `Tooltip`    | Hover tooltip, delay, placement                                 |
| `Kbd`        | Keyboard shortcut display                                       |

### Not building (use native)

- Checkbox → `<input type="checkbox">` styled with CSS
- Radio → `<input type="radio">` styled with CSS
- Toggle → checkbox with custom appearance

---

## Page-Level Changes

### Sidebar

- Subtle background distinction from main content
- Smooth width transition on collapse (icon-only mode)
- Active item: accent left border + accent-subtle background
- Hover: surface-hover background
- User section at bottom: avatar + name + role badge

### Dashboard

- Project cards with shadow, hover lift, rounded corners
- Empty state with illustration placeholder and CTA
- Section headers: serif font, muted divider line

### Editor Area

- Screenplay content: white/cream page on dark background (simulates a real page)
- Toolbar: elevated bar with rounded buttons, clear active states
- Focus mode: smooth fade-in, escape hint with `Kbd` component

### Auth Pages (Login/Register)

- Centered card on gradient-subtle background
- Social login buttons with provider icons
- Clean form layout with FormField components

---

## Migration Strategy

1. Update `packages/ui/src/styles/tokens.css` with new token values
2. Restyle existing components (`Button`, `Badge`) in place
3. Build new components one by one, each with `.module.css`
4. Update page-level CSS modules to use new tokens
5. Typecheck + visual review after each component

No big-bang rewrite — component by component, page by page.

---

## Out of Scope

- Light mode (dark only for v1)
- Theming system / theme switcher
- Design tokens in JS (CSS custom properties only)
- Storybook or component playground
- Illustrations or custom icons (use Lucide icons if needed)
