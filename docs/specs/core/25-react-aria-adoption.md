# Spec 25 — React Aria adoption

> Status: draft · Date: 2026-05-15 · Owner: Valerio
> Triggered by: user proposal during the 15 May UX polish round — "aggiungere react-aria e i suoi hook come base componenti full accessible".

---

## 1. Decision summary

**Adopt React Aria (from Adobe), but in a controlled migration.** Replace the *behavior* layer of our DS-v2 primitives with `react-aria` hooks (`useButton`, `useDialog`, `useListBox`, `useOverlay`, etc.) while keeping the existing CSS-Module styling and DS-v2 tokens intact. The goal is industrial-grade a11y semantics (focus management, keyboard nav, ARIA roles, screen-reader announcements) without redesigning the visual layer.

NOT adopting: `react-aria-components` (the higher-level styled components). Those bring opinionated styling that would fight our CSS Modules + DS-v2 stack. Stick to the hooks.

## 2. Why now (and why also: not yet)

### Why
Current primitives roll their own ARIA semantics:
- `Modal` — hand-written `<dialog>` + custom Esc handling, no focus trap from a tested library
- `Drawer` — same pattern, focus management is minimal
- `Popover` — no managed overlay layer; click-outside is per-page
- `Tabs` / `ViewSwitcher` — no keyboard arrow nav, no `role="tablist"` semantics in some places
- `Tooltip` — no positioning logic that handles flips/collisions
- `Button` — minimal aria-pressed/aria-haspopup wiring per call site

This sprawls quietly. A future iOS / Expo companion app, plus the screen-reader requirement in CLAUDE.md ("accessibilità requisito di progetto"), make a hand-rolled approach a liability.

### Why not yet
The UI is still moving fast (typography just collapsed to 2 fonts, Tabs swapped to ViewSwitcher, V2 cleanup just landed). Migrating primitives mid-polish risks:
- Visual regressions during the rewrite
- Conflicts with in-flight CSS changes
- Wasted effort if a primitive gets dropped/redesigned anyway

The migration starts **only after the current UX polish round settles** (audit-driven punch list cleared) and the spec 23 server refactor is fully landed.

## 3. Scope

### In
Migrate these primitives to use `react-aria` hooks underneath:

| Primitive | Hook(s) | Why |
|---|---|---|
| `Modal` | `useOverlayTrigger`, `useDialog`, `FocusScope` | Real focus trap, restore-focus on close, scroll-lock |
| `Drawer` | `useOverlayTrigger`, `useDialog`, `FocusScope` | Same |
| `Popover` | `useOverlay`, `useOverlayPosition`, `DismissButton` | Flip/collision-aware positioning, managed dismiss |
| `Tooltip` | `useTooltip`, `useTooltipTrigger` | Hover/focus delays per WAI-ARIA pattern |
| `ViewSwitcher` | `useMenuTrigger`, `useMenu`, `useMenuItem` | Arrow-key nav, type-ahead, focus return |
| `Tabs` (composed of) | `useTabList`, `useTab`, `useTabPanel` | Arrow nav, automatic vs manual activation |
| `Button` (DsButton) | `useButton` | Cross-browser press handling, mobile tap delay |
| `ToggleChip` | `useToggleButton` | Real `aria-pressed` semantics |
| `Pill` | none — passive label, no behavior to migrate |
| `DocStats` | none |
| `SavePill` | none |
| `Presence` | none |
| `CommandPalette` | `useComboBox` or `useListBox` | Full keyboard nav for groups |
| `ProjectSwitcherPopover` | `useMenu` | Same |
| `VersionTrigger` | `useButton` + `useMenuTrigger` if it grows | Trivial |

### Out

- `react-aria-components` (the styled variant) — too opinionated, conflicts with CSS Modules
- Replacing screenplay editor / ProseMirror internals — that's its own a11y story
- Replacing the FloatingDock semantics — already a `role="toolbar"` and minimal

## 4. Migration shape

Per primitive: a single TSX file gets rewritten to use the hook(s); the `.module.css` file is **untouched**; the public props API is preserved (no caller change in the first cut).

Example for `Modal`:

```tsx
// Before
import { useEffect, useRef } from "react";

export function Modal({ isOpen, onClose, title, children, footer }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (isOpen && !dialog.open) dialog.showModal();
    else if (!isOpen && dialog.open) dialog.close();
  }, [isOpen]);
  // ... hand-rolled Esc/click-outside/focus ...
  return <dialog ref={dialogRef} className={styles.dialog}>...</dialog>;
}

// After
import { useRef } from "react";
import { useOverlay, useDialog, FocusScope, OverlayContainer } from "react-aria";

export function Modal({ isOpen, onClose, title, children, footer }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { overlayProps, underlayProps } = useOverlay(
    { isOpen, onClose, isDismissable: true, isKeyboardDismissDisabled: false },
    ref,
  );
  const { dialogProps, titleProps } = useDialog({ "aria-labelledby": titleId }, ref);
  if (!isOpen) return null;
  return (
    <OverlayContainer>
      <div className={styles.backdrop} {...underlayProps} />
      <FocusScope contain restoreFocus autoFocus>
        <div ref={ref} className={styles.dialog} {...overlayProps} {...dialogProps}>
          <h2 {...titleProps} id={titleId}>{title}</h2>
          <div className={styles.body}>{children}</div>
          {footer && <footer>{footer}</footer>}
        </div>
      </FocusScope>
    </OverlayContainer>
  );
}
```

CSS unchanged. Props unchanged. Behavior strictly improved.

## 5. Dependency cost

- `react-aria`: tree-shakable, ~30 KB gzipped if we use the hooks listed above. No runtime hit on routes that don't use them.
- No new peer-dep conflicts (works with React 18+, which we already use).
- Adds `react-stately` as a transitive — also tree-shakable.

## 6. Phasing

| Phase | What | Estimated effort |
|---|---|---|
| **0 — prep** | Install `react-aria` and `react-stately`; add `<OverlayContainer>` at the app root; quick a11y baseline audit | 2 hours |
| **1 — overlays** | `Modal`, `Drawer`, `Popover`, `Tooltip` — these touch every page | 1 day |
| **2 — menus** | `ViewSwitcher`, `CommandPalette`, `ProjectSwitcherPopover` — replace ad-hoc keyboard nav | 1 day |
| **3 — interactive** | `Button` (DsButton), `ToggleChip` — small but pervasive | half day |
| **4 — tabs** | If still in use anywhere after `ViewSwitcher` adoption | half day |
| **5 — regression sweep** | Cross-browser keyboard + screen-reader (VoiceOver + NVDA) spot checks | half day |

Total: **~3.5 dev-days**, sequenced to avoid disturbing other work.

## 7. Done criteria

- Every primitive in §3 "in scope" goes through a `react-aria` hook for its semantics layer.
- Public component props unchanged (no caller migration needed in this spec).
- CSS Modules untouched.
- VoiceOver pass-through audit on the main flows: login, dashboard, screenplay editor, breakdown, budget, schedule.
- No new dependencies beyond `react-aria` + `react-stately`.
- CLAUDE.md updated: "for primitives that have ARIA semantics, use react-aria hooks; never re-implement focus management or keyboard nav by hand."

## 8. Open questions

1. **Does the screenplay editor's PM-based editing surface need its own a11y refactor?** Out of scope here — track separately. PM handles its own selection model.
2. **Will react-aria conflict with the ProseMirror `view.dom` event handling?** No, the hooks attach via React `ref` and don't compete for the same event listeners.
3. **Should we adopt `react-stately` directly for state machines (combobox/menu state)?** Implicit — react-aria hooks pull state from it. We don't write `react-stately` code by hand.
4. **Do we keep the `Tabs` primitive at all after ViewSwitcher?** `Tabs` is still used by Dashboard filters. Decide during phase 4 whether to keep it as a thin react-aria wrapper or sunset it.

## 9. What does NOT change

- DS-v2 tokens, CSS Modules, the Modal/Drawer/Popover visual look — all stay.
- The "two-font system" rule.
- The `ResultShape` server boundary and neverthrow patterns.
- The `withProjectAccess` server pipeline.

This spec is purely a behavior-layer migration on the client.
