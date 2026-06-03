# A5 — Accessibility & react-aria Audit

**Date:** 2026-06-03  
**Auditor:** A5 (static source analysis)  
**Branch:** main @ dbf87ad  
**Method:** Full static source analysis of all primitives in `packages/ui/src/primitives/`, `packages/ui/src/components/`, `packages/ui/src/composites/`, and `packages/ui/src/shell/`. Live Playwright keyboard testing was blocked (dev server could not be started due to process-launch permission restrictions in this agent context). All findings are backed by `file:line` source references and/or reproduction keystroke sequences derivable from the code.

---

## Coverage

### Primitives / components analysed (source)

| Primitive           | File                                                               | react-aria hooks                                                                                                                  |
| ------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Button (BaseButton) | `packages/ui/src/components/BaseButton.tsx`                        | `useButton` ✓                                                                                                                     |
| Button (DS wrapper) | `packages/ui/src/primitives/Button/Button.tsx`                     | delegates to BaseButton ✓                                                                                                         |
| Modal               | `packages/ui/src/primitives/Modal/Modal.tsx`                       | `FocusScope contain restoreFocus`, `useOverlay`, `useDialog`, `usePreventScroll` ✓                                                |
| Drawer              | `packages/ui/src/primitives/Drawer/Drawer.tsx`                     | `FocusScope contain restoreFocus`, `useOverlay`, `useDialog`, `usePreventScroll`, `useButton` ✓                                   |
| Popover             | `packages/ui/src/primitives/Popover/Popover.tsx`                   | `FocusScope restoreFocus autoFocus`, `useOverlay`, `DismissButton` ✓                                                              |
| Tooltip             | `packages/ui/src/primitives/Tooltip/Tooltip.tsx`                   | `useTooltipTriggerState`, `useTooltipTrigger`, `useTooltip`, `mergeProps` ✓                                                       |
| SegmentedControl    | `packages/ui/src/primitives/SegmentedControl/SegmentedControl.tsx` | `useRadioGroupState`, `useRadioGroup`, `useRadio` ✓                                                                               |
| ToggleChip          | `packages/ui/src/primitives/ToggleChip/ToggleChip.tsx`             | `useToggleState`, `useToggleButton` ✓                                                                                             |
| Tabs                | `packages/ui/src/components/Tabs.tsx`                              | `useTabListState`, `useTabList`, `useTab` ✓                                                                                       |
| ViewSwitcher        | `packages/ui/src/primitives/ViewSwitcher/ViewSwitcher.tsx`         | `useMenuTriggerState`, `useMenuTrigger`, `useMenu`, `useMenuItem`, `useButton` ✓                                                  |
| VersionTrigger      | `packages/ui/src/primitives/VersionTrigger/VersionTrigger.tsx`     | same as ViewSwitcher ✓                                                                                                            |
| DropdownMenu        | `packages/ui/src/components/DropdownMenu.tsx`                      | `useMenuTriggerState`, `useMenuTrigger`, `useMenu`, `useMenuItem`, `useButton`, `FocusScope restoreFocus`, `useInteractOutside` ✓ |
| ContextMenu         | `packages/ui/src/components/ContextMenu.tsx`                       | `useOverlay`, `useMenu`, `useMenuItem`, `FocusScope restoreFocus` ✓                                                               |
| CesareDrawer        | `packages/ui/src/composites/CesareDrawer/CesareDrawer.tsx`         | `useButton` on HeaderButton/PeekRow; resize via `useMove` ✓                                                                       |
| CesareDrawer resize | `packages/ui/src/composites/CesareDrawer/use-drawer-resize.ts`     | `useMove` + ARIA separator role + keyboard step ✓                                                                                 |
| SplitDrawer         | `packages/ui/src/composites/SplitDrawer/SplitDrawer.tsx`           | `useButton` ✓                                                                                                                     |
| LeftRail            | `packages/ui/src/shell/LeftRail/LeftRail.tsx`                      | `useButton` (all interactive elements), `useHover`, `useOverlay`, `useTextField` ✓                                                |
| BottomDock          | `packages/ui/src/shell/BottomDock/BottomDock.tsx`                  | `useButton` ✓                                                                                                                     |
| TopBar              | `packages/ui/src/shell/TopBar/TopBar.tsx`                          | **none** — plain `<button>`                                                                                                       |
| FloatingDock        | `packages/ui/src/shell/FloatingDock/FloatingDock.tsx`              | **none** — plain `<button>`                                                                                                       |
| CommandPalette      | `packages/ui/src/shell/CommandPalette/CommandPalette.tsx`          | **none** — hand-rolled keyboard nav                                                                                               |
| SkipLink            | `packages/ui/src/shell/SkipLink/SkipLink.tsx`                      | `<a>` — correct, no hook needed                                                                                                   |

### Pages/flows not exercised

Live keyboard testing on the running app was not possible (process-launch restriction in this agent context). The following pages require live verification:

- Screenplay editor page (tab order in editor toolbar)
- Breakdown page (dense ToggleChip grid tab order)
- Budget / Calendario pages
- Cesare session routes
- Login/Auth flow
- CommandPalette live (AT announcement of aria-activedescendant)

---

## Findings

---

### F1 — ALTO: Nested `<button>` inside `<button>` in PeekRow — HTML spec violation (WCAG 4.1.1)

**File:** `packages/ui/src/composites/CesareDrawer/CesareDrawer.tsx:243–267`

**Code:**

```tsx
// Line 243
<button
  ref={expandRef}
  {...expandProps}
  type="button"
  className={styles.peekRow}
  data-testid="cesare-peek-expand-btn"
>
  <span className={styles.peekGlow} aria-hidden="true" />
  <span className={styles.peekLabel}>Cesare</span>
  <span className={styles.peekSub}>· {subtitle}</span>
  {/* Line 253 — ILLEGAL: button inside button */}
  <button
    ref={closeRef}
    {...closeProps}
    type="button"
    className={styles.peekClose}
    data-testid="cesare-peek-close-btn"
    onClick={(e) => {
      e.stopPropagation();
      onClose();
    }}
  >
    ×
  </button>
</button>
```

Interactive content (`<button>`) is not permitted inside `<button>` per the HTML spec (interactive content model). Browsers handle this inconsistently:

- Chrome/Safari silently hoist the inner `<button>` out, making it a sibling in the DOM. The close button may appear _before_ the expand button in tab order.
- The inner close button's click propagation is unreliable across browsers (`.stopPropagation()` attempts to work around this, but the structural issue remains).
- NVDA/JAWS on different browsers will announce different DOM structures.

**Reproduction:** Open Cesare drawer → minimise to peek state → Tab twice.

**WCAG:** 4.1.1 Parsing (AA), 4.1.2 Name, Role, Value (AA)

**Fix:** Replace the outer `<button>` with a `<div>` + an inner explicit expand button:

```tsx
<div className={styles.peekRow} role="group" aria-label="Cesare">
  <button
    ref={expandRef}
    {...expandProps}
    type="button"
    className={styles.peekExpand}
    data-testid="cesare-peek-expand-btn"
  >
    <span className={styles.peekGlow} aria-hidden="true" />
    <span className={styles.peekLabel}>Cesare</span>
    <span className={styles.peekSub}>· {subtitle}</span>
  </button>
  <button
    ref={closeRef}
    {...closeProps}
    type="button"
    className={styles.peekClose}
    data-testid="cesare-peek-close-btn"
  >
    ×
  </button>
</div>
```

Remove the `onClick e.stopPropagation()` (no longer needed). Adjust `.peekRow` to be a flex container and add `.peekExpand` as a flex-grow sibling.

---

### F2 — ALTO: `DropdownMenu` trigger has `all: unset` with no `:focus-visible` — focus ring erased (WCAG 2.4.7)

**File:** `packages/ui/src/components/DropdownMenu.module.css:1–5`

```css
.triggerWrap {
  all: unset; /* wipes browser default :focus outline */
  display: inline-flex;
  cursor: pointer;
}
```

There is no `:focus-visible` rule on `.triggerWrap`. The `useButton` hook in `DropdownMenu.tsx:302–309` emits `data-focus-visible` on the element, but there is no CSS rule consuming it nor any `outline` fallback. Every `DropdownMenu` trigger (session row `⋯`, scene more buttons in Breakdown, ActionsMenu in TopBar) shows **no visible focus ring** when reached by keyboard.

**Reproduction:** Tab to any `DropdownMenu` trigger → no visible focus indicator on the trigger button.

**WCAG:** 2.4.7 Focus Visible (AA)

**Fix:**

```css
.triggerWrap {
  all: unset;
  display: inline-flex;
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid var(--ds-action);
    outline-offset: 2px;
    border-radius: var(--ds-radius-sm);
  }
}
```

---

### F3 — ALTO: `CommandPalette` input missing `role="combobox"` + `aria-expanded`; hand-rolled keyboard nav violates project rule (WCAG 4.1.2)

**File:** `packages/ui/src/shell/CommandPalette/CommandPalette.tsx:190–207`

The input element has:

```tsx
<input
  type="text"
  aria-controls={listboxId}
  aria-activedescendant={...}
  aria-autocomplete="list"
  // Missing: role="combobox", aria-expanded
/>
```

`aria-controls`, `aria-activedescendant`, and `aria-autocomplete` all belong to the ARIA combobox pattern and are meaningless on a plain `type="text"` input without `role="combobox"`. Screen readers announce this as a plain text field and do not narrate the active option or option count. The listbox is not announced as open or closed.

Additionally, the entire keyboard navigation is hand-rolled at `CommandPalette.tsx:146–165` (`onKeyDown` with ArrowDown/ArrowUp/Enter/Escape) instead of using `useComboBox` from react-aria — a violation of the project rule: "Never re-implement focus management, keyboard nav … use react-aria hooks … if a react-aria hook exists for the pattern, it is mandatory."

**WCAG:** 4.1.2 Name, Role, Value (AA)

**Minimal fix:** Add `role="combobox"` and `aria-expanded`:

```tsx
<input
  role="combobox"
  aria-expanded={selectable.length > 0}
  aria-controls={listboxId}
  aria-activedescendant={...}
  aria-autocomplete="list"
  ...
/>
```

**Complete fix (per project rule):** Migrate to `useComboBox` (react-aria). The native `<dialog>` wrapper stays; the combobox wiring replaces the hand-rolled `onKeyDown`.

---

### F4 — MEDIO: Several small buttons in `CesareDrawer` lack `:focus-visible` styles (WCAG 2.4.7)

**File:** `packages/ui/src/composites/CesareDrawer/CesareDrawer.module.css`

The following interactive elements are rendered in `CesareDrawer` but have **no `:focus-visible` rule**:

| CSS class             | Line range | Purpose                         |
| --------------------- | ---------- | ------------------------------- |
| `.peekClose`          | 651–668    | × button in peek bar            |
| `.scopeChipRemove`    | 433–451    | × dismiss on each scope chip    |
| `.contextChipDismiss` | 271–287    | × dismiss on context tag chips  |
| `.scopeChipAdd`       | 453–466    | "+ Aggiungi" add-context button |

The `.iconBtn` (expand/minimize/close), `.sessionSelector`, `.composerBtn`, `.composerSend`, `.scrollNudge`, and resize handles all have `:focus-visible` correctly — those are fine. The four elements above are missing it.

**Reproduction:** Tab through an expanded CesareDrawer with a scope chip present → the × remove button receives focus but shows no outline.

**WCAG:** 2.4.7 Focus Visible (AA)

**Fix:** Add to `CesareDrawer.module.css` (in the existing `@media (prefers-reduced-motion)` block or before it):

```css
.peekClose,
.scopeChipRemove,
.contextChipDismiss,
.scopeChipAdd {
  &:focus-visible {
    outline: 2px solid var(--ds-action);
    outline-offset: 2px;
  }
}
```

---

### F5 — MEDIO: `TopBar` search button and `FloatingDock` action buttons use plain `<button>` without `useButton` (project rule violation)

**Files:**

- `packages/ui/src/shell/TopBar/TopBar.tsx:155–165`
- `packages/ui/src/shell/FloatingDock/FloatingDock.tsx:101–140` (primary, secondary, Cesare pill)

Both use raw `<button onClick={...}>` without `useButton`. The project rule states: "Never re-implement focus management, keyboard nav, or overlay dismiss by hand — use react-aria hooks (`useButton` … for every interactive primitive. If a react-aria hook exists for the pattern, it is mandatory."

**Concretely missing without `useButton`:**

- iOS Safari click handling on `<button>` is inconsistent without react-aria's press detection
- `aria-disabled` + blocked interaction (when buttons need to be visually disabled but focusable)
- Pointer-cancel handling (`onPointerUp` cancels that happen during drag)

Focus rings are present (CSS `:focus-visible` rules exist for both). This is a robustness/spec-compliance gap, not a broken ring.

**WCAG:** Not a direct WCAG AA failure today. Severity MEDIO because future `disabled` additions will silently break without `useButton`.

**Fix:** Wrap each in `useButton`. Example for TopBar search:

```tsx
// TopBar.tsx — add import useButton, useRef from react-aria/react
const searchRef = useRef<HTMLButtonElement>(null);
const { buttonProps: searchProps } = useButton(
  { onPress: onSearch, "aria-label": "Cerca ⌘K" },
  searchRef,
);
// render:
<button
  ref={searchRef}
  {...searchProps}
  className={styles.iconBtn}
  title="Cerca (⌘K)"
>
  <Icon name="search" size={14} aria-hidden={true} />
</button>;
```

---

### F6 — MEDIO: `DropdownMenu` portalled menu has no `DismissButton` sentinel — Tab past last item does not close (WCAG 2.1.2 advisory)

**File:** `packages/ui/src/components/DropdownMenu.tsx:241`

```tsx
<FocusScope restoreFocus>
  <ul {...menuProps} ref={menuRef} ...>
    {items}
  </ul>
  {/* Missing: <DismissButton onDismiss={onClose} /> */}
</FocusScope>
```

`FocusScope` without `contain` is correct for a non-modal menu. However, without a trailing `DismissButton`, when a keyboard user presses Tab past the last menu item, focus escapes to the next DOM element (outside the menu) without closing the menu. The `useInteractOutside` handler closes it on click/touch but not on Tab-out. `Popover` correctly uses two `DismissButton`s (before and after content); `DropdownMenu` has none.

**Reproduction:** Open a `DropdownMenu` → Tab to last item → press Tab → menu stays open while focus moves to content behind it.

**WCAG:** Advisory against 2.1.2 (No Keyboard Trap — menu remains open but focus escapes, partial trap scenario)

**Fix:** Add `<DismissButton onDismiss={onClose} />` after the `</ul>`:

```tsx
<FocusScope restoreFocus>
  <ul ...>{items}</ul>
  <DismissButton onDismiss={onClose} />
</FocusScope>
```

---

### F7 — BASSO: `Tabs` `aria-label` is hardcoded `"Tabs"` — duplicate accessible names when multiple tab lists on one page (WCAG 2.4.6)

**File:** `packages/ui/src/components/Tabs.tsx:55`

```tsx
const { tabListProps } = useTabList({ "aria-label": "Tabs" }, state, ref);
```

Every `Tabs` instance announces as "Tabs" regardless of context. When multiple tab lists are present on a page (e.g. Breakdown has a view switcher and a content tab set), screen readers cannot distinguish them.

**WCAG:** 2.4.6 Headings and Labels (AA)

**Fix:** Expose `ariaLabel?: string` prop, pass it through:

```tsx
const { tabListProps } = useTabList(
  { "aria-label": ariaLabel ?? "Tabs" },
  state,
  ref,
);
```

---

### F8 — BASSO: `SegmentedControl` `ariaLabel` is optional with no fallback — radio group may have no accessible name (WCAG 2.4.6)

**File:** `packages/ui/src/primitives/SegmentedControl/SegmentedControl.tsx:43`

```tsx
const { radioGroupProps } = useRadioGroup(
  { "aria-label": ariaLabel, orientation: "horizontal" },
  state,
);
```

When `ariaLabel` is `undefined` (the prop is optional), the radio group has no accessible name. Screen readers announce it as an unnamed `radiogroup`. The Breakdown page's "Per scena / Per progetto / Matrice" SegmentedControl is a candidate for this omission — `ariaLabel` must be verified at each call site.

**WCAG:** 2.4.6 Headings and Labels (AA)

**Fix:** Either enforce `ariaLabel` as required, or add a default:

```tsx
{ "aria-label": ariaLabel ?? "Vista", orientation: "horizontal" }
```

---

### F9 — BASSO: `FloatingDock` `.toast` animation has no `prefers-reduced-motion` suppression

**File:** `packages/ui/src/shell/FloatingDock/FloatingDock.module.css:283–291`

```css
.toast {
  animation: dockToastFadeIn 180ms var(--ds-ease);
}
/* The existing @media (prefers-reduced-motion: reduce) block at line 320
   does NOT mention .toast */
```

All the breathing and glow animations are tamed in the existing reduce block, but `.toast { animation: dockToastFadeIn }` is not. It is a 180ms cosmetic fade — low impact, but the convention is to suppress all animations under `prefers-reduced-motion: reduce`.

**Fix:** Add to `FloatingDock.module.css` reduce block:

```css
@media (prefers-reduced-motion: reduce) {
  .actionBtn {
    transition: none;
  }
  .cesarePill {
    transition: none;
  }
  .cesarePillThinking,
  .cesarePillThinking::before,
  .cesarePillThinking .cesareDot {
    animation: none;
  }
  .toast {
    animation: none;
  } /* ← add */
}
```

---

### F10 — BASSO: `DropdownMenu.triggerLabel` is optional — icon-only callers without it produce a button with no accessible name (WCAG 4.1.2)

**File:** `packages/ui/src/components/DropdownMenu.tsx:51–52`

```tsx
/** Accessible label for the trigger button. Required when the trigger is
 *  icon-only (e.g. the "…" more button) so screen readers announce it. */
triggerLabel?: string;
```

The prop is documented as "required when icon-only" but typed as optional with no runtime enforcement. Future call sites may omit it for icon-only triggers and silently produce an unlabelled button.

**Existing callers are correct** (LeftRail session row passes `triggerLabel`). The gap is forward-looking.

**WCAG:** 4.1.2 Name, Role, Value (AA) — potential future failure.

**Fix:** Add a runtime warning or a TypeScript overload:

```tsx
// Option A: type-level enforcement
type DropdownMenuProps =
  | { trigger: ReactNode; triggerLabel: string; ... }  // icon-only: label required
  | { trigger: string; triggerLabel?: string; ... };   // text trigger: label optional
```

---

## Bell / Avatar / Gear duplication check

**Spec 47b FIX 1 compliance: PASS.**

- `BottomDock.tsx` — Cesare launcher only. No bell/avatar/gear. (`packages/ui/src/shell/BottomDock/BottomDock.tsx`)
- `CesareDrawer.tsx` — expand/minimize/close window controls + session selector. No bell/avatar/gear. (lines 500–536)
- `LeftRail.tsx` — `AccountRow` is the single home for bell/avatar/gear. (lines 452–529)

No duplication detected.

---

## Icon-only button accessible name spot-check

| Button                             | Source               | aria-label                                           |
| ---------------------------------- | -------------------- | ---------------------------------------------------- |
| TopBar search                      | TopBar.tsx:160       | `aria-label="Cerca ⌘K"` ✓                            |
| Drawer close ×                     | Drawer.tsx:24        | `useButton "aria-label: Chiudi"` ✓                   |
| BottomDock Cesare                  | BottomDock.tsx:33    | `useButton "aria-label: openLabel"` ✓                |
| CesareDrawer expand/minimize/close | CesareDrawer.tsx:183 | `useButton "aria-label: label"` ✓                    |
| Rail bell/avatar/gear              | LeftRail.tsx:470–486 | all via `useButton` with labels ✓                    |
| Session row ⋯ menu                 | LeftRail.tsx:355     | `triggerLabel="Azioni sessione: ${session.title}"` ✓ |
| Scope chip remove ×                | CesareDrawer.tsx:210 | `aria-label="Rimuovi contesto: ${scope.label}"` ✓    |
| Context tag dismiss ×              | CesareDrawer.tsx:491 | `aria-label="Rimuovi tag: ${tag.label}"` ✓           |

---

## reduced-motion coverage spot-check

| Component        | Transitions/animations                | reduce block           |
| ---------------- | ------------------------------------- | ---------------------- |
| Button           | transition on bg/color/border         | ✓ `transition: none`   |
| ToggleChip       | transition + dot transition           | ✓                      |
| SegmentedControl | option color transition               | ✓                      |
| ViewSwitcher     | trigger + item transitions            | ✓                      |
| Tooltip          | (no animation in CSS)                 | n/a                    |
| Popover          | `popIn` animation                     | ✓ `animation: none`    |
| Modal            | `modalPanelIn` + backdrop             | ✓                      |
| Drawer           | slide translate transition + backdrop | ✓                      |
| CesareDrawer     | expand/slide animations + peek pulse  | ✓                      |
| FloatingDock     | breathing/glow/dot animations         | ✓ (toast missing — F9) |
| SplitDrawer      | slide animation                       | ✓                      |
| LeftRail         | slide-in overlay transition           | ✓                      |
| BottomDock       | (minimal transitions)                 | ✓                      |

---

## Severity counts

| Severity  | Count  | Findings        |
| --------- | ------ | --------------- |
| ALTO      | 3      | F1, F2, F3      |
| MEDIO     | 3      | F4, F5, F6      |
| BASSO     | 4      | F7, F8, F9, F10 |
| **Total** | **10** |                 |

---

## Top 3 findings

1. **F1 (ALTO)** — `CesareDrawer` `PeekRow` contains a `<button>` nested inside a `<button>` — HTML spec violation producing unpredictable DOM structure in browsers; WCAG 4.1.1 Parsing failure. Fix: restructure as `<div role="group">` + two sibling buttons.

2. **F2 (ALTO)** — `DropdownMenu.module.css` `.triggerWrap { all: unset }` with no `:focus-visible` rule — focus ring completely erased for every `DropdownMenu` trigger in the app (session rows, Breakdown scene menus, ActionsMenu). WCAG 2.4.7 Focus Visible failure. Fix: add `:focus-visible { outline: 2px solid var(--ds-action); }` to `.triggerWrap`.

3. **F3 (ALTO)** — `CommandPalette` input missing `role="combobox"` + `aria-expanded`; entire keyboard nav hand-rolled without react-aria. Screen readers announce a plain text input and cannot narrate the active option. WCAG 4.1.2 Name, Role, Value failure + project rule violation. Fix: add `role="combobox"` + `aria-expanded` (minimal); migrate to `useComboBox` (complete).

---

## Primitives / pages NOT exercised (live keyboard)

Due to process-launch restrictions, live Playwright keyboard testing was not performed. The following areas need live follow-up:

- **Screenplay editor page** — editor toolbar tab order, element legend, TopBar action focus
- **Breakdown page** — ToggleChip dense grid tab order, SegmentedControl `ariaLabel` at the call site
- **Budget / Calendario pages** — FloatingDock keyboard focus sequence
- **Cesare session routes** — CesareDrawer in expanded/full/peek states keyboard flow
- **Login/Auth flow** — form tab order, error announcements
- **CommandPalette live** — `aria-activedescendant` announcement in NVDA/JAWS
- **ContextMenu via Shift+F10** — focus restoration on keyboard-triggered context menu
