# Spec 25b — Primitives → react-aria migration & Button unification

> Status: active · Date: 2026-06-02 · Owner: Valerio
> Extends: [25 — React Aria adoption](./25-react-aria-adoption.md)
> Roadmap: STATUS.md Priority 2 (labelled "12d" historically; the *visual* 12d
> spec `12d-ds-primitives-unification.md` is already DONE/closed at `de6dd5d`.
> This spec is the **behavioural** debt that entry actually refers to.)

## 1. Problem

`packages/ui/src/components/*` use react-aria hooks (`useButton`, `useDialog`,
`useTabList`, `useMenu`, …). `packages/ui/src/primitives/*` use **zero**
react-aria — they hand-roll focus management, keyboard nav, Esc, outside-click,
and ARIA wiring. Two interactive layers coexist. This violates the CLAUDE.md
hard rule:

> Never re-implement focus management, keyboard nav, or overlay dismiss by hand
> — use `react-aria` hooks for every interactive primitive.

Additionally `Button` is **duplicated**: `components/Button` (react-aria, exported
as `Button`) and `primitives/Button` (plain `<button>`, exported as `DsButton`).
Both are consumed. They must converge to one.

## 2. Goal

Every **interactive** primitive in `packages/ui/src/primitives/` uses the correct
react-aria hook(s); behaviour (keyboard, focus return, dismiss, ARIA) matches the
react-aria standard; **public prop APIs and visual output are unchanged** unless
explicitly noted below. Non-interactive primitives are left alone. The two Buttons
converge to one implementation. Zero behavioural regressions in the app.

Deps already present: `react-aria@3.48.0`, `react-stately@3.46.0` in `packages/ui`.
**Do not add new deps.**

## 3. Hard constraints (every agent)

- Read `CLAUDE.md`, `docs/conventions/react.md`, `docs/conventions/css.md`, this spec.
- **react-aria hooks mandatory** for every interactive element. No hand-rolled
  Esc / outside-click / focus-trap / roving-tabindex / hover-intent.
- neverthrow for any Result paths (none expected here — pure UI). No try/catch.
- CSS Modules + design tokens only. **No visual change**: keep every existing
  class name and `.module.css`; only swap the JS behaviour layer. If react-aria
  needs an extra wrapper element, keep it `display:contents` or reuse an existing
  class so the rendered look is byte-identical.
- English identifiers / comments. Italian only in user-facing copy (e.g. the
  existing `aria-label="Chiudi"` Italian strings stay — they are UI copy).
- Preserve every `data-testid`, `role`, `aria-*` the current markup exposes
  **or** improve it to the react-aria standard — never regress a test selector
  without updating the test in the same change.
- Keep the component generic signatures (`<Id extends string>`) intact.
- Each agent: unit tests where logic exists + at minimum a render/interaction
  test per migrated primitive; verify LIVE with playwright-cli on a real page that
  renders the primitive; `pnpm --filter @oh-writers/ui typecheck` + root `pnpm typecheck`
  green; commit on its branch with `[OHW]`, no AI signatures; **do NOT merge**.

## 4. Per-primitive contract

Reference implementation to mirror: `packages/ui/src/components/Button.tsx`
(`useButton` + chaining `onClick` through `usePress`), `components/Dialog.tsx`
(`useDialog`/`useOverlay`), `components/DropdownMenu.tsx` (`useMenu`/`useMenuTrigger`),
`components/Tabs.tsx` (`useTabList`/`useTab`).

### 4.1 Button unification (FOUNDATION — must land first)
- Make `primitives/Button` the canonical react-aria button (it already shares the
  `Button.module.css`? No — verify; primitives/Button has its own module). The
  **merged** Button must support the **union** of both APIs without breaking callers:
  - variants: `primary | secondary | danger | ghost` (superset).
  - sizes: `sm | md | lg` (superset).
  - `hotkey?: string` (from primitives — renders the `styles.hotkey` span).
  - `onPress`/`onPressStart`/`onPressEnd`/`onPressChange` + `onClick` chained
    through `useButton` (from components).
  - default variant: keep **both** export defaults working. `Button` (components)
    defaulted `primary`; `DsButton` (primitives) defaulted `ghost`. To avoid a
    silent visual flip, keep TWO named exports backed by ONE component:
    `Button` (default `primary`) and `DsButton` (default `ghost`), both thin
    wrappers over the unified `BaseButton`. Document that `DsButton` is
    deprecated-alias and new code uses `Button`.
- Reconcile the two `Button.module.css` files into one (the canonical lives with
  the unified component); ensure both variant sets + `sm/md/lg` + `hotkey` styles
  exist. Visual spot-check every variant/size live.
- Update `index.ts` exports accordingly (keep `Button`, `DsButton`, all type exports).

### 4.2 Modal — `useDialog` + `useOverlay`/`useModalOverlay` + `FocusScope`
- Keep the public `ModalProps` API exactly (`isOpen,onClose,title,description,
  size,children,footer,initialFocusRef`).
- Replace the hand-rolled `<dialog>.showModal()` + manual `cancel`/`click` listeners
  with react-aria `Overlay` + `useModalOverlay`(or `useOverlay`+`usePreventScroll`+
  `useModalOverlay`) + `useDialog` + `<FocusScope contain restoreFocus autoFocus>`.
  `initialFocusRef` maps to autofocusing that node inside the FocusScope.
- Esc + outside-click dismissal now come from `useOverlay`/`useModalOverlay`
  (`isDismissable: true`, `isKeyboardDismissDisabled: false`). Keep
  `aria-labelledby`/`aria-describedby` wiring (react-aria `useDialog` returns
  `dialogProps`/`titleProps`).
- Keep `styles.dialog`/`data-size`/header/body/footer markup + classes.

### 4.3 Drawer — same overlay stack as Modal
- Keep `DrawerProps` (`isOpen,onClose,title,side,width,children`).
- Same react-aria overlay + dialog + FocusScope migration. The Italian
  `aria-label="Chiudi"` close button stays; wire it with `useButton`.
- Keep `--drawer-width` CSS var + `styles.drawer`/`left` classes.

### 4.4 Popover — `useOverlay` + `DismissButton` + `FocusScope` (non-modal)
- Keep `PopoverProps` (`isOpen,onClose,placement,width,children,className`).
- Replace hand-rolled `keydown`/`mousedown` listeners with `useOverlay({ isOpen,
  onClose, isDismissable:true, shouldCloseOnBlur:true }, ref)` + `<FocusScope
  restoreFocus>` + leading/trailing `<DismissButton onDismiss={onClose}/>`.
- Keep `role`/markup minimal; react-aria provides `overlayProps`. Preserve
  `placementClass` + width style. (Positioning stays CSS-class-based as today —
  do NOT pull in `useOverlayPosition` unless trivial; out of scope to re-anchor.)
- **VersionTrigger + ViewSwitcher depend on this** → Popover is a sub-foundation,
  migrate before them (same agent or ordered).

### 4.5 Tooltip — `useTooltipTrigger` + `useTooltip` (+ `useTooltipTriggerState`)
- Current is CSS-hover only (no keyboard focus, no delay, always in DOM). Migrate
  to react-stately `useTooltipTriggerState` + react-aria `useTooltipTrigger`
  (on the child trigger) + `useTooltip`. Show on hover AND keyboard focus; respect
  the global warmup/close delay react-aria provides.
- Keep `TooltipProps` (`content,kind,placement,children`) + `styles.tip`/kind/
  placement classes. The child becomes the trigger (wrap with the trigger props).

### 4.6 SegmentedControl — `useRadioGroup` + `useRadio` (single-select)
- Semantics today: `role=tablist`/`role=tab` but it is really a single-select
  control with no roving-tabindex. Migrate to a **radio group** (react-aria
  `useRadioGroup`/`useRadio` + `react-stately` `RadioGroupState` via
  `useRadioGroupState`) which gives arrow-key selection + roving focus for free.
- Keep `SegmentedControlProps` (`options,activeId,onSelect,ariaLabel`) and the
  `data-testid={`segmented-${id}`}` selectors (E2E depends on them). `activeId`→
  `value`, `onSelect`→`onChange`. Keep `styles.group/option/optionActive`.
- NOTE: this changes the exposed ARIA role from tab→radio. Update any test that
  asserted `role=tab` on this control in the same change.

### 4.7 ToggleChip — `useToggleButton` (react-stately `useToggleState`)
- Keep `ToggleChipProps` (`isOn,onToggle,label,categoryColor,hotkey,aria-label`).
  `isOn`→state, `onToggle`→`onChange`. Keep `role=switch`/`aria-checked` (react-aria
  `useToggleButton` with the element being a switch — verify it emits aria-checked;
  if it emits `aria-pressed` instead, keep the switch semantics explicitly).
- Keep `styles.chip/isOn/dot` + `--chip-color`.

### 4.8 VersionTrigger — `useButton` (+ react-aria menu when `menuItems`)
- Depends on migrated **Popover** + ideally a menu. Two modes:
  - no `menuItems`: trigger is a `useButton` that calls `onClick`. Keep
    `aria-haspopup="dialog"`.
  - `menuItems`: use `useMenuTrigger` + `useMenu`/`useMenuItem` (react-stately
    `useMenuTriggerState`) for arrow-key menu nav, rendered inside the migrated
    Popover. Keep `role=menu`/`menuitem` semantics + `aria-haspopup="menu"`/
    `aria-expanded`.
- Keep `VersionTriggerProps` + `pill`/`ghost` variants + `styles.*` + the chevron Icon.

### 4.9 ViewSwitcher — `useMenuTrigger` + `useMenu`
- Same menu migration as VersionTrigger's menu mode. Keep `ViewSwitcherProps`
  (`options,activeId,onSelect,label,ariaLabel,headerSlot`), `aria-current`, hints,
  the CSS-dot active marker, and `styles.*`.

### 4.10 Scrim, DocStats, Pill, Presence, SavePill — NO react-aria
- Non-interactive / pure presentational. `Scrim`'s `onClick` is a backdrop click
  helper used alongside an already-managed overlay — leave as a plain div (it is
  `aria-hidden` and not a focusable control). Do not migrate these.

## 5. Waves (dependency order)

- **Wave 1 (foundation, series):**
  - A1 — Button unification (§4.1). Blocks nothing structurally but is the
    riskiest call-site change; land + verify first.
  - A2 — Popover (§4.4). Sub-foundation for VersionTrigger + ViewSwitcher.
  - (A1, A2 are independent files → can run parallel, but BOTH must merge before Wave 2.)
- **Wave 2 (parallel, disjoint files):**
  - A3 — Modal (§4.2) + Drawer (§4.3) (shared overlay stack, one agent).
  - A4 — Tooltip (§4.5).
  - A5 — SegmentedControl (§4.6) + ToggleChip (§4.7) (both react-stately toggle/radio).
  - A6 — VersionTrigger (§4.8) + ViewSwitcher (§4.9) (both depend on A2 Popover).

## 6. Done criteria

- `grep -rL react-aria` over the interactive primitives returns empty (every
  interactive primitive imports a react-aria hook).
- One Button implementation; `Button` + `DsButton` both exported, both work, no
  visual flip for existing callers.
- `pnpm typecheck` (8/8) + `pnpm test:unit` green.
- New/updated E2E for any changed test selector (SegmentedControl role change).
- Live spot-check (Design + Lead judges): modal open/close + Esc + outside-click +
  focus return; popover dismiss; tooltip on keyboard focus; segmented arrow-keys;
  toggle chip; version/view menus arrow-key nav. Screenshots per surface.
- No behavioural regression in the app: Cesare drawer, command palette, export
  modals, dashboard filters, breakdown chips, viewbar version pills all still work.

## 7. Out of scope

- The `shell/*` composites (TopBar, Viewbar, FloatingDock, LeftRail, BottomDock,
  CommandPalette) — separate spec if they hand-roll behaviour. CommandPalette
  already mirrors a dialog pattern; audit later.
- Re-anchoring Popover positioning via `useOverlayPosition` (keep CSS placement).
- Any visual redesign — this is behaviour-only.
