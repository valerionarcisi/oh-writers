# Spec 06b — Versions Panel (inline)

Sub-spec of `06-toolbar-popover.md`. The "Versioni" menu entry no longer
navigates to `/screenplay/versions`: it toggles an inline panel that slides in
between the toolbar and the editor surface.

The full-page versions route (`_app.projects.$id_.screenplay.versions.tsx`)
stays in place for now — the inline panel is a lighter companion UI. Layout
will be revisited once production stabilises.

## Context

- Users are constantly in the editor; jumping to a separate route to inspect
  versions breaks flow.
- The three operations the user needs on a fast loop are **Add version**
  (snapshot current content), **Rename** (fix a label), **Duplicate**
  (branch off an existing snapshot).

## User Story

> As a writer, I click "Versioni" in the toolbar menu and a panel drops in
> below the toolbar, showing every version with inline actions. I can add a
> new version, rename one, or duplicate one, without leaving the editor.

## Behaviour

1. Menu entry "Versioni" opens/closes the panel. Button reflects state
   (`aria-expanded`).
2. Panel renders between `ScreenplayToolbar` and the page shell. It does NOT
   unmount the editor — the ProseMirror view stays alive behind it.
3. Panel lists all versions, grouped: **Manual** first, then **Auto-saves**.
4. Each row: label (editable via "Rename"), timestamp, page count, row
   actions: **Rename**, **Duplicate**, **Delete**.
5. Header row has **+ New version** trigger → inline label input → creates
   manual version with current content.
6. Esc closes the panel; clicking outside the panel body keeps it open
   (editor is behind, writer may still want to edit with panel open).

## Server

Two new `createServerFn` calls:

- `renameVersion({ versionId, label })` → updates `screenplayVersions.label`.
  Errors: `VersionNotFoundError`, `InvalidLabelError`, `DbError`.
- `duplicateVersion({ versionId, label })` → inserts a new manual version
  copying `content`/`pageCount` from the source; `isAuto: false`,
  `createdBy: currentUser`. Errors: `VersionNotFoundError`, `DbError`.

Schemas in `screenplay-versions.schema.ts`, errors reuse the existing file.

## UI

- New component `VersionsPanel.tsx` in `features/screenplay-editor/components/`.
- Mounts as a sibling of `ScreenplayToolbar` inside `ScreenplayEditor.tsx`.
  State (`isPanelOpen`) lifted to the editor so the toolbar menu can toggle it
  via prop.
- CSS Module with its own panel surface — shadow, subtle border, slides in
  with `translate` + `opacity` transition (respecting
  `prefers-reduced-motion`).

## Tests

Playwright, tagged `[OHW-107..109]`:

- **OHW-107** Menu "Versioni" toggles the panel, does not navigate.
- **OHW-108** Add version from panel creates a row.
- **OHW-109** Rename + duplicate actions update the list.

## Files

- `docs/specs/06b-versions-panel.md` (this file)
- `apps/web/app/features/screenplay-editor/screenplay-versions.schema.ts`
  (add `RenameVersionInput`, `DuplicateVersionInput`)
- `apps/web/app/features/screenplay-editor/screenplay-versions.errors.ts`
  (add `InvalidLabelError`)
- `apps/web/app/features/screenplay-editor/server/versions.server.ts`
  (add `renameVersion`, `duplicateVersion`)
- `apps/web/app/features/screenplay-editor/hooks/useVersions.ts`
  (add `useRenameVersion`, `useDuplicateVersion`)
- `apps/web/app/features/screenplay-editor/components/VersionsPanel.tsx` (new)
- `apps/web/app/features/screenplay-editor/components/VersionsPanel.module.css` (new)
- `apps/web/app/features/screenplay-editor/components/ToolbarMenu.tsx`
  (replace `goToVersions` with `onToggleVersions` prop)
- `apps/web/app/features/screenplay-editor/components/ScreenplayToolbar.tsx`
  (thread `onToggleVersions` + `isVersionsPanelOpen` through)
- `apps/web/app/features/screenplay-editor/components/ScreenplayEditor.tsx`
  (own panel state, render panel)
- `apps/web/app/features/screenplay-editor/index.ts` (export `VersionsPanel`)
- `tests/editor/toolbar-menu.spec.ts` (update OHW-105)
- `tests/editor/versions-panel.spec.ts` (OHW-107..109)
