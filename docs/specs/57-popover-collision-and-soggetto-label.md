# Spec 57 — Collision-aware Popover + correct "Soggetto" label

Status: done
Owner: Valerio
Closes: BUGS **N-16** (logline "opens nothing") and **N-17** ("Soggetto missing from nav")
Branch: `fix/logline-n16-soggetto-nav-n17`

## Problem

### N-16 — logline popover "opens nothing in some state"

The logline lives in the `LoglinePill` trigger published into the TopBar centre slot.
Clicking it opens a `Popover`. In the normal 1440-wide owner state the popover opens
fine on all four prose pages (soggetto/synopsis/outline/treatment); screenplay has no
pill by design.

Root cause (measured live): the shared `Popover` primitive
(`packages/ui/src/primitives/Popover/Popover.tsx`) is **hand-positioned with absolute
CSS** — `position: absolute` inside the trigger's wrapper, placed `bottom-start` /
`bottom-end` / `bottom-center` with a **fixed pixel width** (logline = 480px) and **no
viewport-collision handling**. The popover's left edge anchors to the trigger and
extends `width` px to the right. The TopBar pill is horizontally centred, so at 1440 the
480px popover _just_ fits (`x≈684`, `684+480=1164 < 1440`). The moment the available
width shrinks — a narrower window, or a SplitDrawer/Cesare peek lane compressing the main
lane — the popover overflows the right edge and lands off-screen, so the user sees
nothing open.

Measured (Playwright, reused dev server):

| Viewport | popover box.x | x + width | In viewport?       |
| -------- | ------------- | --------- | ------------------ |
| 1440     | 684           | 1164      | yes                |
| 768      | 348           | 828       | **no** (off right) |
| 390      | 78            | 558       | **no** (fully off) |

The same latent overflow exists for the other four `Popover` consumers (ViewSwitcher,
ScreenplayEditorShell scene index, BreakdownPage underline + scene index).

### N-17 — "Soggetto" missing from the nav

It is not missing — it is **mislabelled in English**. `nav.soggetto`'s EN value is
`"Treatment outline"` (`packages/domain/src/i18n/keys/common.ts`) and
`DOCUMENT_TYPE_LABELS_EN.soggetto` is also `"Treatment outline"`
(`packages/domain/src/constants.ts`). With the shell rendering EN labels, Valerio saw
"Treatment outline" as the first Development item — colliding conceptually with the
separate "Treatment" item — and read it as "Soggetto is gone". IT was always correct
("Soggetto").

## Decisions

- **N-17 label:** EN label for `soggetto` becomes **"Soggetto"** — a borrowed
  industry term kept identical across locales, exactly like "Logline". Fixes both the
  i18n key and `DOCUMENT_TYPE_LABELS_EN`.
- **N-16 scope:** fix the **shared `Popover` primitive** (all 6 consumers), not just the
  logline. The primitive becomes collision-aware so it can never render off-screen.

## Design — collision-aware Popover

Adopt the pattern already proven in `DropdownMenu` (portal to `document.body` +
`getBoundingClientRect` + clamp/flip on layout & on scroll/resize), instead of CSS
sibling-relative absolute positioning. react-aria stays responsible for dismiss/focus
(`useOverlay`, `FocusScope`, `DismissButton`) — only _placement_ changes.

1. New pure helper `computeAnchoredPosition({ trigger, overlay, viewport, placement, margin, offset })`
   in `packages/ui/src/primitives/Popover/anchoredPosition.ts` returning `{ top, left }`:
   - horizontal anchor by placement: `bottom-start` → trigger.left; `bottom-end` →
     `trigger.right − overlay.width`; `bottom-center` → centre on trigger;
   - clamp `left` into `[margin, viewport.width − overlay.width − margin]`;
   - `top = trigger.bottom + offset`; if it overflows the bottom, flip above
     (`trigger.top − overlay.height − offset`), else clamp to `margin`.
   - Unit-tested in isolation (no DOM).
2. `Popover` gains a **required** `triggerRef: RefObject<HTMLElement | null>` prop. It
   renders into a portal, measures itself off-screen on first paint, then positions via
   the helper in `useLayoutEffect`, re-running on `resize` + capture-phase `scroll`.
   The `placement` prop and `width` prop are preserved; the three CSS placement classes
   and the wrapper-relative `position: absolute` are removed (popover is now
   `position: fixed`).
3. Update all 6 consumers to pass a `triggerRef`:
   - `LoglinePill` — already has `triggerRef`; pass it.
   - `ViewSwitcher` — already has `triggerRef`; pass it.
   - `VersionTrigger` — already has `triggerRef`; pass it.
   - `ScreenplayEditorShell` scene-index — add a `useRef` to the trigger button.
   - `BreakdownPage` underline + scene-index — add `useRef`s to the two trigger buttons.

Public interface stays narrow (same props + `triggerRef`); the deep change (collision
handling) is hidden inside the primitive — every consumer benefits without per-call CSS
hacks.

> Note: `DropdownMenu` carries parallel reposition logic; unifying it onto
> `computeAnchoredPosition` is a future cleanup, out of scope here to keep the blast
> radius to the `Popover` family.

## Validation (Definition of Done)

- **Unit:** `anchoredPosition.test.ts` — start/end/centre anchoring, left clamp on
  narrow viewport, vertical flip when no room below.
- **E2E (regression for N-16):** `tests/documents/logline-popover-viewport.spec.ts` —
  open the logline popover at 1440, 768, and 390 wide and assert the popover's bounding
  box is fully inside the viewport each time. (Replaces the throwaway repro spec.)
- **Re-verify the other popovers** open and stay on-screen (screenshot recap):
  ViewSwitcher, VersionTrigger menu, screenplay scene index, breakdown underline.
- **Gates:** typecheck, lint, existing `logline-manual` + agentic logline specs, the
  Popover unit test, DS-consistency guard — all green.
- Screenshots in the final recap; entries moved to DONE in `docs/BACKLOG.md` and the
  N-16/N-17 BUGS entries closed with the fixing commit.

## Review notes

- Body-portaling moved the popover out of its trigger's local stacking context, so
  the old `z-index: 60` would have rendered it _below_ `--z-overlay`/`--z-modal`.
  Raised to `9999` to match the `DropdownMenu` body-portal primitive.
- Known minor (accepted): if a consumer's viewbar collapses on scroll while a popover
  is open, the anchor can drift for one frame until the next scroll/resize tick (the
  reposition listener catches it). Not applicable to the TopBar-hosted logline.

## Result (as built)

- **6 consumers** updated (not 5 — `VersionTrigger` also uses the primitive):
  LoglinePill, ViewSwitcher, VersionTrigger, ScreenplayEditorShell scene-index,
  BreakdownPage underline + scene-index.
- The primitive now portals to `document.body`, positions via
  `computeAnchoredPosition` in a `useLayoutEffect` (re-running on resize + capture
  scroll), and additionally caps width with `max-inline-size: calc(100vw - 16px)` —
  needed because a _fixed_ `width` (480px) still overflowed a 390px viewport even after
  horizontal clamping; the cap shrinks it to fit.
- N-17: corrected the EN `soggetto` label in four places — `nav.soggetto`,
  `DOCUMENT_TYPE_LABELS_EN`, `shell.trace.kind.soggetto`, `versions.scope.soggetto` —
  all now "Soggetto" (matching the borrowed-term treatment of "Logline").
- **Gates:** typecheck clean; lint clean; `anchoredPosition` (7) + `Popover` (8) +
  full `@oh-writers/ui` (237) and `@oh-writers/web` (1713) unit suites green;
  DS-consistency guard green; `logline-popover-viewport` (3) + `logline-manual` E2E
  green on a fresh server; the other popovers re-verified on-screen with screenshots.
- **Pre-existing/unrelated:** several E2E specs (e.g. `versions-interactions`,
  `screenplay-editor-ux`, parts of `breakdown-*`, `l10n-leaks`) fail in the local
  environment, with a run-to-run-variable failure set, on a **clean baseline** too. The
  common root for the versions specs is the flaky `testProjectId` fixture
  (`tests/fixtures.ts:102`) waiting on the dashboard "Non fa ridere" project link —
  not touched by this change. Logged here so it isn't mistaken for a regression.
