# Spec 06g — Prose document versioning

Status: draft
Depends on: 06b (universal versioning), 06f (draft meta cross-doc)

## Why

Today every prose doc (logline, synopsis, outline, treatment) is a single
row per `(projectId, type)`. The real authoring workflow is iterative:
the writer drafts N loglines, picks the definitive one, then writes N
treatments off it, N synopses, etc. Without versioning the writer either
overwrites previous drafts or stuffs them into the same document body —
both lose history and make "go back to the version I had last week"
impossible.

Screenplay already solves this via `screenplayVersions` + a `currentVersionId`
pointer. We extend the same model to prose docs.

## Model

Generalize, don't duplicate. New table `documentVersions` mirrors
`screenplayVersions`:

```
documentVersions
  id            uuid pk
  documentId    uuid fk -> documents.id
  label         text         -- "v1", "Draft 2", free text
  content       text         -- the prose body (markdown / PM JSON)
  createdAt     timestamptz
  createdById   uuid fk -> users.id
```

`documents` gets a `currentVersionId uuid null` column. The doc row stays
as the canonical metadata holder (project, type, timestamps); the
`content` column on `documents` becomes derived ( = current version's
content) and is eventually dropped after migration.

Migration:

1. Add `documentVersions` + `documents.currentVersionId` (nullable).
2. Backfill: for every existing `documents` row, insert one
   `documentVersions` row with `label = "v1"`, copy `content`, set
   `documents.currentVersionId` to it.
3. Switch reads to go through `currentVersionId`.
4. (Later spec) drop `documents.content`.

## API

- `listDocumentVersions(projectId, type)` → `DocumentVersion[]`
- `createDocumentVersion(documentId, { label, content })` → new row,
  optionally pin it as current.
- `pinDocumentVersion(documentId, versionId)` → updates `currentVersionId`.
- `getDocument` (existing) returns the current version's content; gains
  `currentVersionId` + `currentVersionLabel` in the response.

All behind `createServerFn` with Zod + `requireUser` + permission check
(only owner/editor on a non-archived project can mutate; viewer reads).

## UI

- Each prose route gets a "Versions" button in the toolbar that opens a
  drawer (same component shape as the screenplay versions drawer from
  06c). Drawer lists versions newest-first, shows label + createdAt +
  "current" pin.
- Pin click → confirmation modal → `pinDocumentVersion` → drawer
  re-renders, editor reloads with the new content.
- "Save as new version" entry in the toolbar menu → prompts for a label,
  snapshots current editable content, pins the new version.
- Read-only viewing of past versions (click a non-current version) →
  editor enters read-only mode with a banner "Viewing v1 — Pin to make
  current".

## What this enables downstream

- Export PDF picks the pinned version per doc type → reproducible
  exports.
- Breakdown / schedule (specs 10+) consume the pinned screenplay version
  - pinned treatment / outline → no risk of mixing drafts.
- Diff between versions (future spec) becomes trivial because content is
  stored per-version.

## Out of scope

- Diff UI (separate spec).
- Branch / merge of versions (probably never).
- Per-version comments (separate spec, ties into review flow).
- Migration of `documents.content` removal (separate spec, blocked on
  reads being fully switched over).

## Open questions

- Label scheme: free text, auto-incremented "v1/v2/v3", or both? Lean
  toward "auto-default to vN, user can rename".
- Should pinning fire a real-time event so collaborators see the new
  current version immediately? Probably yes — same channel as screenplay
  version pin.
