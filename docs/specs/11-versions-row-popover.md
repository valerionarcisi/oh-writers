# Spec 11 — Versions row: inline rename, row-click view, popover actions

Refines `06b-versions-panel.md` and extends `10-version-viewing-marker.md`.
Reshapes each row in the `VersionsPanel` around three interactions:

1. **Click the row** to view the snapshot (read-only).
2. **Pencil icon** next to the label to rename inline with optimistic update.
3. **`⋯` menu** anchored to the right of the row, containing **Duplica** and
   **Elimina**.

The inline "Visualizza / Rinomina / Duplica / Elimina" button strip is gone.

## Context

The four inline buttons introduced in 06b are noisy and they duplicate the
affordance the writer already expects from a list: _click a row to open it_.
Spec 10 added view mode; this spec makes it the default row interaction and
collapses housekeeping into a single per-row menu.

Duplicate is the writer's real branching tool: _"fork this version and keep
writing"_. Until now duplicate only cloned the row; it did not change what the
writer was editing. That was a dead-end action. This spec wires duplicate to
the live draft so the writer lands straight into the copy.

## User Story

> As a writer, I click **Versioni**. The panel lists my versions. I click the
> first row — the editor switches to view mode on that snapshot. I click
> **Torna alla bozza** and I'm back on my live draft. I click the pencil next
> to _"Auto-save"_, the label turns into an input, I type _"Opening beat"_
> and press Enter — the label flips immediately, no loading state. I open the
> row's **⋯** menu, click **Duplica** — a new row appears labeled
> _"Opening beat (copy)"_ **and my editor is now on that copy**, fully
> editable. I write a new line, save. I open the menu on an old row, click
> **Elimina**, confirm, the row disappears.

## Behaviour

### Row click → view mode

1. The whole row is a clickable target (cursor: pointer).
2. Clicking a row enters view mode on that version. Dirty-draft confirm from
   Spec 10 applies unchanged.
3. Clicking the row currently in view mode does nothing (already active).
4. Keyboard: `Enter` / `Space` on a focused row triggers the same action.
5. The row carries `role="button"` and a descriptive `aria-label`
   ("Visualizza Draft 1").

### Pencil icon → inline optimistic rename

1. A pencil icon sits immediately after the label. Click it → label becomes
   an inline `<input>` pre-filled with the current label.
2. Enter commits the rename. Escape cancels. Blur commits.
3. The rename is **optimistic**:
   - On mutate, the row's label flips instantly in the query cache.
   - On success, the server-confirmed label replaces the optimistic one.
   - On error, the original label is restored and an error toast shows.
4. Clicking the pencil must NOT trigger the row-click view action — stop
   propagation.
5. Empty or whitespace-only labels are rejected client-side (no mutation).

### `⋯` menu → Duplica + Elimina

1. `⋯` button on the right of the row opens a popover anchored to its right
   edge. Reuse `useMenuPopover` (same pattern as `ToolbarMenu`).
2. Menu items:
   - **Duplica** — calls `duplicateVersion`, then **switches the live draft
     to the new version** (see below).
   - **Elimina** — confirm dialog (`window.confirm`), then
     `deleteVersion`.
3. Opening the menu must not trigger row-click.
4. Esc or outside click closes the popover.

### Duplicate = branch into live draft

This is the behaviour change vs. 06b.

1. `duplicateVersion` still inserts a new manual version with label
   `"{sourceLabel} (copy)"` (or `"Auto-save (copy)"` when the source has no
   label). If the writer is currently in view mode, exit view mode first.
2. After the mutation resolves, the editor's **live draft content is
   replaced** with the duplicated version's content. The writer can
   immediately edit it; autosave resumes on the next keystroke and will
   save into `screenplays` (not into the snapshot row).
3. If the live draft was dirty before duplicating, the same dirty-confirm
   as Spec 10 applies ("Salva e duplica" / Cancel).
4. The newly duplicated row appears at the top of the list (desc by
   `createdAt`). It is **not** highlighted as "viewing" — the writer is
   editing its content as a live draft, not viewing a snapshot.

## Server

No new server functions. Existing `duplicateVersion` and `deleteVersion`
already cover the needs. `saveScreenplay` handles the post-duplicate
autosave of the new content back into the screenplay row.

## UI changes

- `VersionsPanel.tsx`
  - Row becomes a clickable container (`role="button"`, `tabIndex=0`).
  - Remove the inline Visualizza/Rinomina/Duplica/Elimina buttons.
  - Replace with: label + pencil icon + `⋯` trigger.
  - Active-view row keeps the `data-viewing` highlight from Spec 10.
- New component `VersionRowMenu.tsx` — tiny popover with Duplica + Elimina,
  reuses `useMenuPopover`.
- `VersionsPanel.module.css` — row becomes flex with label on the left,
  actions (pencil, `⋯`) flush right. Hover state on the row itself.

## Hooks

- `useRenameVersion` gains optimistic behaviour via `onMutate` +
  `onError` rollback pattern:
  - `onMutate({ versionId, label })`: snapshot current cache, write the
    optimistic label into `["versions", screenplayId]`.
  - `onError`: restore snapshot.
  - `onSettled`: invalidate to re-sync with server.
- `useDuplicateVersion` accepts an `onBranchReady` callback (or returns
  the duplicated version to the caller) so `ScreenplayEditor` can swap
  the live draft content after success.

## ScreenplayEditor integration

- New handler `handleDuplicateAsLiveDraft(version)`:
  1. If dirty → confirm.
  2. If view mode → exit view mode first.
  3. Call `duplicateVersion`.
  4. On success, set `content` and `pmDoc` to the duplicated version's data
     (fetched from the mutation response). The next autosave tick persists
     it into `screenplays`.

## Tests

Playwright, tagged `[OHW-160..166]`, new file
`tests/editor/versions-row.spec.ts`:

- **OHW-160** Row click enters view mode (banner visible, editor read-only).
- **OHW-161** Row click on dirty draft → confirm dialog, dismiss keeps state.
- **OHW-162** Pencil icon opens inline editor, Enter commits, label flips
  instantly (optimistic), then persists after reload.
- **OHW-163** `⋯` menu opens, contains Duplica and Elimina, Esc closes it.
- **OHW-164** Duplica creates a new row AND the editor becomes the copy
  (banner gone, typing works, content matches the duplicated version).
- **OHW-165** After duplicate + edit, saving writes into the live screenplay
  (not into a version row — count of manual versions stays stable).
- **OHW-166** Elimina with confirm removes the row; dismiss confirm keeps it.

## Files

- `docs/specs/11-versions-row-popover.md` (this file)
- `apps/web/app/features/screenplay-editor/components/VersionsPanel.tsx`
  (row becomes clickable, drop inline button strip, add pencil + `⋯`)
- `apps/web/app/features/screenplay-editor/components/VersionsPanel.module.css`
  (row-as-button hover, pencil / trigger styling)
- `apps/web/app/features/screenplay-editor/components/VersionRowMenu.tsx` (new)
- `apps/web/app/features/screenplay-editor/components/VersionRowMenu.module.css` (new)
- `apps/web/app/features/screenplay-editor/hooks/useVersions.ts`
  (optimistic `useRenameVersion`; duplicate returns branched version)
- `apps/web/app/features/screenplay-editor/components/ScreenplayEditor.tsx`
  (handle duplicate-as-live-draft + dirty confirm)
- `apps/web/app/features/screenplay-editor/index.ts` (export `VersionRowMenu`)
- `tests/editor/versions-row.spec.ts` (OHW-160..166)

## Constraints

- Reuse `useMenuPopover`, `--color-*` tokens, `--radius-md`.
- No new server functions.
- Optimistic rename must roll back on error — never leave the UI with a stale
  label.
- Click targets must not overlap: pencil and `⋯` must stop propagation so the
  row-click view action does not fire.
- Respect `prefers-reduced-motion` for popover and any row hover animation.
- Commit: `[OHW] feat: versions row popover + inline rename + duplicate branch`.
