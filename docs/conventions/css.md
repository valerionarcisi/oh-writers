# CSS

Dark modern SaaS — clean, warm, with depth and polish. Content-first. Modern CSS only, no preprocessors, no JS for visuals.

## Hard rules

- CSS Modules only — one `.module.css` per component
- Custom properties for every value — never hardcode hex, px, or magic numbers
- `--radius-md` (8px) as default border-radius. `--radius-none` only for screenplay page representation
- Class names in camelCase
- No Tailwind, no CSS-in-JS, no styled-components
- No Framer Motion or JS animations — CSS transitions only, always behind `prefers-reduced-motion`
- Shadows via `--shadow-*` tokens for elevation hierarchy

## Layout — flexbox first

Use flexbox as the default. Switch to grid only when you need explicit two-dimensional control (e.g. a screenplay page layout, a dashboard grid).

```css
/* Good — flexbox for most layouts */
.toolbar {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

/* Good — grid only when 2D structure is needed */
.editorLayout {
  display: grid;
  grid-template-columns: var(--sidebar-width) 1fr;
  grid-template-rows: var(--header-height) 1fr;
}
```

## CSS nesting — use it

Native CSS nesting is supported. Use it to keep related styles together. Don't nest more than 2 levels deep.

```css
/* Good */
.button {
  background: var(--color-surface);
  padding: var(--space-2) var(--space-4);

  &:hover {
    background: var(--color-surface-hover);
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
}

/* Bad — flat, hard to see the relationship */
.button {
  background: var(--color-surface);
}
.button:hover {
  background: var(--color-surface-hover);
}
.button:disabled {
  opacity: 0.4;
}
```

## Container queries — not media queries

Components respond to their container, not the viewport. This makes components truly portable.

```css
/* Good — component adapts to its container */
.card {
  container-type: inline-size;
  display: flex;
  flex-direction: column;

  @container (min-width: 400px) {
    flex-direction: row;
  }
}

/* Bad — component tied to viewport width */
.card {
  display: flex;
  flex-direction: column;

  @media (min-width: 768px) {
    flex-direction: row;
  }
}
```

Use `@media` only for truly global concerns: root font size, color scheme (`prefers-color-scheme`), reduced motion.

## Logical properties

Use logical properties instead of physical directions. This handles RTL and writing modes correctly without extra code.

```css
/* Good */
.label {
  margin-inline-end: var(--space-2);
  padding-block: var(--space-1);
  border-inline-start: 2px solid var(--color-accent);
}

/* Bad */
.label {
  margin-right: var(--space-2);
  padding-top: var(--space-1);
  padding-bottom: var(--space-1);
  border-left: 2px solid var(--color-accent);
}
```

Quick reference: `inline` = horizontal axis, `block` = vertical axis.

## Modern selectors — :has(), :is(), :where()

Use them to reduce duplication and express relationships between elements.

```css
/* :is() — apply the same styles to multiple selectors without repeating */
.form :is(input, textarea, select) {
  border: var(--border);
  padding: var(--space-2);
}

/* :has() — style a parent based on its children (no JS needed) */
.field:has(input:invalid) {
  color: var(--color-error);
}

.card:has(img) {
  padding-block-start: 0;
}

/* :where() — same as :is() but zero specificity, safe for overrides */
:where(h1, h2, h3, h4) {
  line-height: 1.1;
  text-wrap: balance;
}
```

## Animations — CSS only

No Framer Motion, no JS for visual transitions. Everything animated lives in CSS.

```css
/* Good — CSS transition for state changes */
.panel {
  opacity: 0;
  translate: 0 var(--space-2);
  transition:
    opacity 150ms ease,
    translate 150ms ease;

  &.isVisible {
    opacity: 1;
    translate: 0 0;
  }
}

/* Good — respect reduced motion */
@media (prefers-reduced-motion: reduce) {
  .panel {
    transition: none;
  }
}
```

Always include a `prefers-reduced-motion` rule for any animation that affects layout or opacity.
