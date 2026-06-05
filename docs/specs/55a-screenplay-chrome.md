# Spec 55a — Screenplay editor chrome (TopBar actions + borderless page)

Status: APPROVED (sub-spec of [Spec 55](55-shell-action-standard.md), Narrative Walk A5).
Scope: the screenplay surface only (`/projects/:id/screenplay`). Bugs: **N-18** (white
frame), **N-19** (element tabs + missing import/export, action placement).

## Problem

The screenplay editor predates the Spec 55 TopBar action standard and carries two
chrome problems the user flagged on the walk:

- **N-18** — The centered screenplay page is wrapped in a white frame. Two layers
  cause it: the `ScreenplayEditorShell` `.editorSlot` (a bordered, rounded card) wraps
  the editor, and the editor's own `.pageShell` carries a `box-shadow`. The user wants
  only the centered text page — no card chrome around it.
- **N-19** — Page actions are scattered and inconsistent with Spec 55:
  - An in-editor `actionsBar` renders an `Esporta PDF ▾` dropdown plus a `⋯`
    `ToolbarMenu` (import PDF/Fountain, export Fountain, renumber, title page) mid-page,
    right above the canvas — exactly the "azioni in giro" pattern Spec 55 retires.
  - The shell separately publishes its OWN ad-hoc TopBar `ActionsMenu` (Esporta/Focus/
    Versioni) via `useTopBarSlotPublisher`, NOT through the A1 context-action registry,
    and the route never wires `onExport`/`onFocusToggle` — so that menu is near-empty and
    **import is entirely missing from the TopBar**.
  - The element-type tabs (SCENE/ACTION/CHARACTER/…) are plain `<button>`s in a
    `role="toolbar"` strip without react-aria toolbar semantics (no arrow-key roving
    focus), so they "look hardcoded / buggy".

## Decision

One pattern, page-specific tools — the screenplay registers its actions through the A1
registry and renders them in the TopBar `ActionsMenu`, exactly like soggetto.

### 1. Registry (`packages/domain`)

Add a `screenplay` segment to `CONTEXT_ACTIONS` with descriptors, and the missing
`EXPORT_FOUNTAIN` / `IMPORT_PDF` ids (`IMPORT_FOUNTAIN` already exists):

- `EXPORT_PDF` (order 10) — opens the production-format export picker (PDF/FDX via the
  existing `EXPORT_FORMATS` set).
- `EXPORT_FOUNTAIN` (order 20) — client-side `.fountain` download.
- `IMPORT_PDF` (order 30) — PDF import picker.
- `IMPORT_FOUNTAIN` (order 40) — Fountain import picker.
- `VERSIONS` (order 90) — opens the Versions surface.

No new feature gate (all formats ship in every market today; SIAE is a soggetto-only
concern). The resolver already drops descriptors the page does not wire a handler for, so
disabled/absent actions never render.

### 2. Web binding (consumed inside the editor)

`ScreenplayEditor` owns the export/import machinery (PM `content`, `hasContent`, version
creation, file inputs, modals). It therefore builds the `ContextActionHandlers`, calls
`useContextActions("screenplay", handlers)`, and publishes the resulting `ActionsMenu`
into the TopBar `actions` slot via `useTopBarSlotPublisher` — the single home. The
in-editor `actionsBar` (export dropdown + `ToolbarMenu` trigger) is removed; the import
file inputs + confirm dialogs + error banners + export modals stay (mounted invisibly),
driven by the TopBar menu items.

The shell stops publishing its own `topBarActionsNode`; `onExport`/`onFocusToggle`/
`onOpenVersions` props are dropped from `ScreenplayEditorShell` (the Viewbar Indice +
element chips + version pill + Cesare toggle stay).

Focus mode keeps its keyboard shortcut (`Ctrl/Cmd+Shift+F`) and the in-editor exit
button; it is not a TopBar action (it is an editor-local view toggle, not an
export/import/versions document action).

### 3. Element tabs — react-aria toolbar (`ScreenplayElementChips`)

Wrap the chip strip in `useToolbar` and each chip with roving `tabIndex` so arrow keys
move focus across the element types (react-aria mandate). Visual design (dot + label +
active accent) unchanged.

### 4. Borderless page (N-18)

- `ScreenplayEditorShell` renders the editor directly (no `.editorSlot` card): drop the
  border + `border-radius` + `overflow:hidden` background wrapper.
- The editor `.pageShell` drops its `box-shadow`; the screenplay page is the only surface
  allowed `--radius-none` (per CLAUDE.md) — the page is a flat centered text column on the
  `--ds-bg` canvas, no frame.

## Tests

- Unit: extend `packages/domain/src/actions/context-actions.test.ts` for the `screenplay`
  segment (order + that unknown stays `[]`). `keys.test.ts` stays green (new keys both
  locales).
- E2E (`tests/screenplay-editor/`): the screenplay page has no `.editorSlot` frame; the
  element tabs roving-focus works; export PDF, export Fountain, import PDF, import
  Fountain, Versioni are all reachable from the TopBar `screenplay-actions-menu`.
- Migrated specs: `audit-export-import`, `screenplay-export`, `screenplay-export-formats`,
  `toolbar-menu`, `pdf-import*`, `import-version-choice`, `versions-drawer` open their
  trigger from the TopBar menu instead of the retired in-editor chrome; the modal/dialog/
  file-picker assertions are unchanged.

## Out of scope

- Redesigning the export modals or the versions drawer (placement only).
- The production pages (N-28).
- ~~A clickable "enter focus mode" affordance + localising the in-editor "Exit
  Focus" button.~~ **DONE in N-32** (`fix/n32-focus-toggle`): a Viewbar **Focus**
  button dispatches `screenplay:toggleFocusMode` (touch/iPad can enter focus
  without a keyboard); the exit button reads `screenplay.shell.exitFocus`. Focus
  stays editor-local (not a TopBar action) — the button lives in the Viewbar, the
  editor keeps owning the state.
