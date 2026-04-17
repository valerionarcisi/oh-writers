# Spec 12 — Unified Versions Drawer

Supersedes `06b-versions-panel.md`. Extends `10-version-viewing-marker.md`
and `11-versions-row-popover.md`.

Introduces a **single, context-aware versions drawer** used by every long-form
writing surface in Oh Writers: the screenplay editor and the four narrative
documents (logline, synopsis, outline, treatment). The drawer is an overlay
anchored to the right edge, resizable, and drives its content from a scope
discriminator so the same component renders screenplay versions or document
versions depending on where it is opened.

## Context

Spec 06b gave the screenplay editor an inline versions panel dropping in
between the toolbar and the editor surface. That panel is screenplay-only and
consumes vertical real estate above the editing area.

The writer needs version control on every authored surface, not just the
screenplay. Loglines are rewritten a dozen times, synopses are iterated with
the AI assistant, outlines are branched into multiple structural attempts.
Shipping a bespoke versions UI per surface would fragment the experience and
duplicate server/client code four times.

This spec consolidates:

- A **new `documentVersions` DB table** covering the four document types.
- A **`VersionScope` discriminated union** that identifies what is being
  versioned.
- A **`VersionsDrawer` component** rendered as a right-side overlay,
  resizable, scope-aware.
- A **unified hook family** — `useVersionsForScope`, `useAddVersion`,
  `useRenameVersion`, `useDuplicateVersion`, `useDeleteVersion`,
  `useRestoreVersion`, `useViewVersion` — that hides the screenplay vs.
  document dispatch.

The existing `screenplayVersions` table stays untouched. This spec does not
migrate data or unify the two server-side tables: they keep their type-
specific columns (`pageCount`, `yjsSnapshot` for screenplays; plain
`content` for documents). The unification is in the **API and the UI**, not
the storage.

## User Story

> As a writer, I'm editing the synopsis. I click **Versioni** in the doc
> toolbar. A drawer slides in from the right, narrow by default, listing the
> versions of this synopsis. I drag its edge to widen it. I rename a row
> inline, duplicate another — the editor opens on the duplicated synopsis.
> I close the drawer, jump to the screenplay editor, open **Versioni**
> again: the drawer opens at the same width, but now lists **screenplay**
> versions. Same component, same shortcuts, different scope.

## Scope model

### The discriminator

```ts
export type VersionScope =
  | { kind: "screenplay"; screenplayId: string }
  | {
      kind: "document";
      documentId: string;
      docType: "logline" | "synopsis" | "outline" | "treatment";
    };
```

Zod schema in `packages/domain/src/version-scope.schema.ts`, type inferred.

### Scope → dispatch

Every hook below accepts a `VersionScope` and dispatches internally:

| Hook                  | `screenplay` dispatch        | `document` dispatch                |
| --------------------- | ---------------------------- | ---------------------------------- |
| `useVersionsForScope` | `listVersions(screenplayId)` | `listDocumentVersions(documentId)` |
| `useAddVersion`       | `createManualVersion`        | `createManualDocumentVersion`      |
| `useRenameVersion`    | `renameVersion`              | `renameDocumentVersion`            |
| `useDuplicateVersion` | `duplicateVersion`           | `duplicateDocumentVersion`         |
| `useDeleteVersion`    | `deleteVersion`              | `deleteDocumentVersion`            |
| `useRestoreVersion`   | `restoreVersion`             | `restoreDocumentVersion`           |
| `useViewVersion`      | `getVersion`                 | `getDocumentVersion`               |

Dispatch uses `match(scope).with({ kind: "screenplay" }, ...)` via
`ts-pattern`. Query keys are namespaced: `["versions", "screenplay",
screenplayId]` vs `["versions", "document", documentId]`.

## Database

### New table `document_versions`

Migration: `pnpm db:migrate:create document_versions`.

```ts
// packages/db/src/schema/documents.ts (append)
export const documentVersions = pgTable("document_versions", {
  id: uuid("id").defaultRandom().primaryKey(),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  label: text("label"),
  content: text("content").notNull(),
  isAuto: boolean("is_auto").notNull().default(false),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type DocumentVersion = typeof documentVersions.$inferSelect;
export type NewDocumentVersion = typeof documentVersions.$inferInsert;
```

No `pmDoc`, no `pageCount`, no `yjsSnapshot` — documents are plain text.

### Retention

Matches `screenplayVersions`: at most **50 auto-saves per document**, pruned
FIFO by `createdAt` when the threshold is crossed. Manual versions are never
auto-deleted.

## Server

New file `apps/web/app/features/documents/server/document-versions.server.ts`
mirroring `screenplay-editor/server/versions.server.ts`:

- `listDocumentVersions({ documentId })`
- `getDocumentVersion({ versionId })`
- `createManualDocumentVersion({ documentId, label })`
- `renameDocumentVersion({ versionId, label })`
- `duplicateDocumentVersion({ versionId, label })`
- `deleteDocumentVersion({ versionId })`
- `restoreDocumentVersion({ versionId })` — copies version content back into
  the live `documents` row.

Same patterns: `requireUser`, `toShape`, `ResultAsync`, typed errors in
`document-versions.errors.ts` (`DocumentVersionNotFoundError`,
`InvalidLabelError`, `CannotDeleteLastManualError`, `ForbiddenError`,
`DbError`).

Schemas in `document-versions.schema.ts`.

## Drawer component

### Anatomy

```
        ┌─ right edge of viewport ─┐
┌───────┤                          │
│       │ ◂ [drag handle]          │
│ app   │   VersionsDrawer         │
│ body  │   (overlay, right-anchored)
│       │   width = resizable      │
│       │                          │
└───────┤                          │
        └──────────────────────────┘
```

- Overlay: `position: fixed; inset-block: 0; inset-inline-end: 0;
z-index: var(--z-overlay)`.
- Width: `min-inline-size: 280px`, `max-inline-size: 600px`, default
  `360px`. Resizable by dragging the **left edge handle**.
- Opens with a slide-in from the right (translate-x) + opacity transition.
  Respects `prefers-reduced-motion`.
- Does **not** push the layout — it floats over the editor. Clicking
  outside does NOT close it (writer may keep typing with it open, same
  rationale as 06b). Esc closes it.

### Header

Fixed at the top: title "Versioni", close button (`✕`),
`+ Nuova versione` button with inline label input. Header content does
not scroll with the list.

### Row

Inherits Spec 11 design:

- Whole row clickable → enters view mode on that version (screenplay) or
  swaps doc content into view mode (documents, see below).
- Pencil icon → inline optimistic rename.
- `⋯` menu → Duplica + Elimina.
- `data-viewing="true"` highlight when active in view mode.

### Footer

Minimal: shows active scope label ("Scena corrente" / "Synopsis", etc.)
for orientation when drawer is narrow.

## Persisted UI state

Both the drawer's width and its open/closed state are **global, app-wide**,
persisted in `localStorage` under a single key:

```ts
// key: "oh-writers:versions-drawer"
type PersistedDrawerState = {
  isOpen: boolean;
  width: number; // clamped 280..600
};
```

Open/close from synopsis at 420px → switch to screenplay → drawer opens
at 420px.

A tiny Zustand store (or plain React context + `useSyncExternalStore`) owns
this state. Default: Zustand — the drawer is consumed from both global
route layouts and per-editor toolbars, so a non-local store keeps the wiring
simple.

## Integration points

### Screenplay editor

- `ScreenplayToolbar.onToggleVersions` — unchanged signature — now flips
  the global drawer store instead of a local `isVersionsPanelOpen`.
- `ScreenplayEditor.tsx` drops its own `isVersionsPanelOpen` state and the
  inline `<VersionsPanel>` mount. The drawer is rendered at the route
  layout level.
- Scope passed to the drawer: `{ kind: "screenplay", screenplayId }`.

### Document editors (logline, synopsis, outline, treatment)

- `NarrativeEditor` toolbar gains a **Versioni** button (icon + label),
  same visual weight as the Save button.
- Clicking it toggles the drawer with scope
  `{ kind: "document", documentId, docType }`.
- View mode for documents: `content` of the editor `<textarea>` is
  replaced with the snapshot content, the textarea becomes `readOnly`, a
  banner (reused `VersionViewingBanner`) sits above it.
- Restore writes back into the `documents.content` column (existing
  `saveDocument` flow handles autosave resume).

### Drawer mount

Mount the drawer once, at the **project-shell route layout**
(`apps/web/app/routes/_app.projects.$id.tsx`). The drawer subscribes to
the global store and reads the **active scope** from a second store or
from a URL-derived selector. Proposal: the drawer takes a `scope` prop
from whichever editor renders it; when no editor is active the drawer
auto-closes.

Cleaner alternative (selected): each editor registers its scope with the
drawer store on mount and clears it on unmount. The drawer reads the
current scope from the store and renders nothing if no scope is active.

## Duplicate = branch into live draft

Carried over from Spec 11 — applies to both scopes:

- Screenplay: duplicated version becomes the editor's live draft
  (`content` + `pmDoc` swap).
- Document: duplicated version's content replaces the active document's
  content in the editor, autosave resumes on the next keystroke and
  persists to the `documents` row.

The duplicated row still lands at the top of the list.

## Optimistic rename

Carried over from Spec 11 — `onMutate` writes into cache, `onError`
restores snapshot, `onSettled` invalidates. Same logic in both dispatch
branches.

## Tests

Playwright, tagged `[OHW-170..179]`, new file
`tests/editor/versions-drawer.spec.ts`:

- **OHW-170** Drawer opens from screenplay toolbar; width defaults to 360px.
- **OHW-171** Drag left edge resizes; width persists after reload.
- **OHW-172** Drawer open-state persists across a full page reload.
- **OHW-173** Switch from screenplay to synopsis — drawer lists synopsis
  versions; rows from screenplay are gone.
- **OHW-174** `+ Nuova versione` in synopsis creates a `documentVersions` row.
- **OHW-175** Pencil rename on a synopsis version is optimistic (instant
  label swap, persists after reload).
- **OHW-176** `⋯` → Duplica on synopsis: new row at top AND textarea content
  equals the duplicated version's content (writer can edit).
- **OHW-177** Row click on a screenplay version enters view mode
  (banner + read-only editor from Spec 10).
- **OHW-178** `⋯` → Elimina on a document version: confirm dismiss keeps row,
  confirm accept removes it.
- **OHW-179** Esc closes the drawer regardless of scope.

Where behaviours are already covered by Spec 10 / 11 tests for screenplay
rows, re-run them against the drawer mount path (no duplication — same
test IDs).

## Files

### New

- `docs/specs/12-versions-drawer.md` (this file)
- `packages/domain/src/version-scope.schema.ts` (zod + type)
- `packages/db/src/schema/documents.ts` (append `documentVersions`)
- `packages/db/migrations/XXXX_document_versions.sql` (Drizzle migration)
- `apps/web/app/features/documents/document-versions.schema.ts`
- `apps/web/app/features/documents/document-versions.errors.ts`
- `apps/web/app/features/documents/server/document-versions.server.ts`
- `apps/web/app/features/documents/hooks/useDocumentVersions.ts`
- `apps/web/app/features/versions/` — new shared feature folder:
  - `components/VersionsDrawer.tsx`
  - `components/VersionsDrawer.module.css`
  - `components/VersionRow.tsx`
  - `components/VersionRow.module.css`
  - `components/VersionRowMenu.tsx`
  - `components/VersionRowMenu.module.css`
  - `hooks/useVersionsForScope.ts`
  - `hooks/useAddVersion.ts`
  - `hooks/useRenameVersion.ts`
  - `hooks/useDuplicateVersion.ts`
  - `hooks/useDeleteVersion.ts`
  - `hooks/useRestoreVersion.ts`
  - `hooks/useViewVersion.ts`
  - `state/drawer-store.ts` (Zustand store: open, width, activeScope)
  - `state/drawer-store.test.ts`
  - `index.ts`
- `tests/editor/versions-drawer.spec.ts` (OHW-170..179)

### Modified

- `apps/web/app/features/screenplay-editor/components/ScreenplayEditor.tsx`
  (drop inline `VersionsPanel`, toggle global drawer via store)
- `apps/web/app/features/screenplay-editor/components/ScreenplayToolbar.tsx`
  (`onToggleVersions` now calls into the drawer store)
- `apps/web/app/features/screenplay-editor/index.ts`
  (stop exporting `VersionsPanel` — deprecated; kept in tree for one
  release behind a `@deprecated` JSDoc tag)
- `apps/web/app/features/documents/components/NarrativeEditor.tsx`
  (add Versioni button, view-mode read-only handling)
- `apps/web/app/features/documents/components/OutlineEditor.tsx`
  (same)
- `apps/web/app/routes/_app.projects.$id.tsx`
  (mount `<VersionsDrawer />` once at the project shell)

### Removed (eventually, not in this PR)

- `apps/web/app/features/screenplay-editor/components/VersionsPanel.tsx`
  — kept for one release, deleted in a follow-up once no routes consume it.

## Constraints

- Reuse tokens only — `--color-*`, `--radius-md`, `--shadow-lg` for the
  drawer elevation, `--z-overlay` for stacking.
- No third-party drawer library. Native CSS + a small pointer-event
  handler for the resize drag.
- Width clamping on both drag and `localStorage` rehydration.
- No `border-radius: 0` — spec 06b uses `--radius-md`, keep consistent.
- View mode on documents reuses `VersionViewingBanner` unchanged —
  component already takes `label` + `createdAt` + callbacks.
- Every new server fn: `requireUser`, Zod validation, `ResultShape`
  boundary.
- Optimistic rename rollback MUST fire on both dispatch branches.
- Commit: `[OHW] feat: unified versions drawer (screenplay + documents)`.

## Out of scope

- Merging `screenplayVersions` and `documentVersions` into one table — not
  worth the migration cost; the discriminator lives in the API layer.
- Cross-scope diff (screenplay vs synopsis) — nonsensical.
- Comments/annotations on versions — separate spec.
- Branch management UI (the `screenplayBranches` table already exists but
  is orthogonal to snapshots).
