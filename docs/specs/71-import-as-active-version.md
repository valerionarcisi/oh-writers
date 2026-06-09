# Spec 71 — Import creates a NEW version that is immediately ACTIVE

Status: **Done** (2026-06-09, verified live: import → new active "Versione 2" with full
content, old "v13" preserved & restorable, no autosave clobber). Branch `feat/versions-delete-and-current`. Builds on
Spec 70 (coord extraction, the import now produces correct Fountain) and Spec 63 (the save
fix, canonical-dirty + single publisher). Glossary: _active version_ = the version
`screenplays.current_version_id` points at; the editor reads its content via `getScreenplay`.

## Why

Owner requirement: **"quando importo una versione devo vederla subito attiva altrimenti
faccio confusione."** Import must land as a new, immediately-active version.

Today `handleCreateVersionThenImport` does the wrong thing:

1. `createManualVersion` checkpoints the **current** (pre-import) content into a new named
   version — correct as a _preserve_, but it does NOT change the active pointer.
2. `setContent(imported)` pushes the imported Fountain into local React state, which reaches
   the DB only through the autosave/CRDT of the **still-active original** version.

Net effect: the imported text overwrites the _original_ active version, while the freshly
created version holds the _old_ draft. Backwards from the requirement, and fragile (it leans
on autosave timing + CRDT seeding of a room that is already populated with the old content).

## Goal

A single deterministic server operation: **import → insert a new version whose content is the
imported Fountain → point `current_version_id` at it → mirror into `screenplays` → seed its
CRDT empty so the editor seeds it from the imported content on remount.** The previous draft
is preserved untouched in its own version row (it was the active version; it simply stops
being current).

This is `createBlankVersion` with content instead of empty — same activation mechanics,
already proven for the "+ Nuova versione" flow.

## Mechanics (why this seeds correctly)

- `screenplay_versions` has **no `pm_doc` column** — only `content` + `yjs_snapshot`. The new
  version stores `content` (imported Fountain) **and a server-seeded `yjs_snapshot`**.
- The version-scoped realtime room (`screenplay:{id}:{versionId}`) loads its CRDT from the
  version's `yjs_snapshot` (`apps/ws-server/src/persistence.ts`).
- The editor remounts on version change via `key={currentVersionId}`
  (`_app.projects.$id_.screenplay.index.tsx`). The server sets `screenplays.pm_doc = NULL`
  so a legacy reader rebuilds from Fountain, and `getScreenplay` returns the **active
  version's** content (now the imported one).

### Why the snapshot is seeded server-side (not left NULL) — the clobber fix

The original plan left `yjs_snapshot = NULL` and relied on the **first client to seed the
fragment** from its PM doc. Measured live, that loses data: on remount the editor can observe
an **empty fragment**, seed empty, and the autosave then **persists the empty state OVER the
imported content** (verified: server received `content.length=16190`, but the row ended up
length 1 after a `saveScreenplay` fired immediately after the import). The client-seed path
races the remount + autosave.

Fix: `importAsActiveVersionTx` builds the CRDT snapshot **server-side** from the imported
Fountain (`yjs-seed.server.ts`: `fountainToDoc(content)` → `prosemirrorToYDoc(doc,
"prosemirror")` → `Y.encodeStateAsUpdate`). The room then loads **already-populated**; the
client sees a **non-empty fragment** (`isFragmentEmpty === false`) so it never re-seeds, and
the autosave's canonical dirty-check (Spec 63) matches the loaded content — no clobber. The
XML fragment key MUST stay in sync with the client's (`yjs-plugins.ts` → `"prosemirror"`).
`screenplays.yjs_state` is mirrored to the same snapshot so a legacy (non-version-scoped)
room also loads the imported content.

## Scope

### Server — `importAsActiveVersion` (versions.server.ts)

Input `{ screenplayId, label, content }` (Zod, content is the resolved Fountain). The write
half is extracted as `importAsActiveVersionTx(tx, params)` (testable deep core). In one tx:

1. `nextVersionNumber` + `pickNextColorFor` (same as the other create paths).
2. `yjsSnapshotFromFountain(content)` → the server-seeded CRDT snapshot (see clobber fix).
3. Insert `screenplay_versions` row: `{ content, pageCount: estimate, yjsSnapshot: snapshot,
label, number, draftColor, draftDate: today, createdBy }`.
4. `update(screenplays)` set `{ content, pmDoc: null, yjsState: snapshot,
currentVersionId: inserted.id, pageCount, updatedAt, *Stale: true }`.
5. `syncScenesFromFountain(tx, screenplayId, content)` so breakdown sees the imported scenes.
6. Clone breakdown forward from the previously-active version (reuse
   `cloneBreakdownToNewVersionInline`) so the import keeps prior tagging where text matches.

Returns `ScreenplayView` (stripped). Reuses `resolveScreenplayAccess` for auth (edit).

### Hook — `useImportAsActiveVersion` (useVersions.ts)

Invalidate: `["versions", id]`, `["screenplays"]` (active), `["screenplay-current-version", id]`.
Mirrors `useCreateBlankVersion`.

### Editor — `handleCreateVersionThenImport` (ScreenplayEditor.tsx)

Replace the `createManualVersion + setContent` body with a single
`importAsActiveVersion.mutate({ screenplayId, label: nextVersionLabel, content: fountain })`.
**Remove** the `setContent(fountain)` — activation + remount-via-`key` drives the content;
setting local state would double-apply. The "overwrite current" path (no new version) keeps
`setContent` (it is editing the live active version in place, which is what the user chose).

## Round-trip contract

import (coord-correct Fountain, Spec 70) → new active version → editor remounts showing the
imported content → export matches. Confirmed parser correctness lives in Spec 70; this spec
only guarantees the imported content becomes the active version and renders.

## Tests (per layer, E2E-first per DoD)

- Unit (`import-as-active-version.test.ts`): the server fn inserts a new version with the
  imported content, points `current_version_id` at it, clears `screenplays.pm_doc` +
  `yjs_state`, mirrors content, marks downstream stale, keeps the prior draft row intact.
- Unit: number/color continuation (new version = max+1, next color in cycle).
- E2E (OHW-071): import a PDF as a new version → the version chip shows the new version,
  the editor shows the imported content, the prior draft is still listed in Versions and
  still holds the old text. (Joins the import E2E suite tracked under N-31.)

## Related

- Spec 70 (coord extraction — produces the correct Fountain this spec activates).
- Spec 63 (save fix — canonical-dirty makes the post-remount editor non-dirty on the
  imported content, so no phantom autosave fights the seed).
- `createBlankVersion` / `restoreVersion` (the activation mechanics this mirrors).
- N-31 test debt (import E2E not in CI).
