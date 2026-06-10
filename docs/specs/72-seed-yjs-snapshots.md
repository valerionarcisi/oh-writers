# Spec 72 — Seed-time CRDT snapshots (BUG-N53)

## Problem

The DB seed writes human-readable content (`screenplay_versions.content`,
`documents.content`) but never the CRDT the realtime editor actually loads:

- screenplay version rooms (`screenplay:{id}:{versionId}`) load
  `screenplay_versions.yjs_snapshot` → NULL on a fresh seed
- narrative rooms (`document:{id}`) load `documents.yjs_state` → NULL on a
  fresh seed

A NULL CRDT means the room is "fresh" and relies on the FIRST connecting
client to seed it from its ProseMirror doc. That client seed races the editor
mount/remount + autosave (the exact race Spec 71 closed for imports): the
editor can observe an empty fragment, seed empty, and the autosave then
persists the empty state over the seeded content. Observed live: project
`…010` soggetto had `content` length 0 and a 2-byte (empty) `yjs_state` —
the 1118-char seed template was clobbered. The screenplay variant is BUG-N53
(editor blank, scene index 1/1, Esporta PDF disabled).

## Fix

Mirror Spec 71's `yjsSnapshotFromFountain` at seed time: after the DB seed,
populate every NULL CRDT server-side from the seeded content, so no room ever
depends on the client-seed race.

### Pieces

1. **`apps/web/app/features/documents/server/yjs-seed.server.ts`** —
   `yjsStateFromNarrativeContent(content)`: plain text → narrative
   ProseMirror doc (mirror of `htmlToDoc`'s non-HTML branch: `\n\n+` →
   paragraphs, `\n` → hard_break, whitespace collapsed the way ProseMirror's
   DOMParser would, so the seeded doc serialises to the same canonical HTML
   the Spec 61 dirty-check derives from `content`) → `prosemirrorToYDoc` →
   `Buffer`. Always builds with the headings-enabled schema (a plain-text
   build only emits paragraph/hard_break/text, identical in both flavours;
   the superset stays valid for soggetto's headings-enabled free editor).
   Returns `null` for empty content and for HTML content (needs a DOM; the
   client seed handles it, status quo).
2. **`apps/web/scripts/seed-yjs-snapshots.ts`** (tsx) — for every
   - `screenplay_versions` row with non-empty `content` and NULL
     `yjs_snapshot` → `yjsSnapshotFromFountain(content)`
   - `documents` row of type soggetto/synopsis/treatment (the types whose
     editor binds a ProseMirror view to the `document:{id}` room; outline
     renders the plain-React OutlineEditor and logline has no PM surface, so
     seeding their CRDT would only create a stale shadow copy) with
     non-empty `content` and NULL `yjs_state` →
     `yjsStateFromNarrativeContent(content)`
     and writes the snapshot. Idempotent: only NULL CRDTs are touched, a live
     CRDT is never overwritten. An already-exported `DATABASE_URL` wins over
     `apps/web/.env` (CI and the test-db setup inject their own).
3. **Shared fragment key** — `XML_FRAGMENT` is now exported from
   `features/realtime/lib/yjs-plugins.ts` (the client source of truth) and
   imported by both seed helpers (documents + screenplay-editor), instead of
   three hardcoded `"prosemirror"` copies that could drift.
4. **Wiring** — root `db:seed` / `db:seed:reset` chain the script after the
   db-package seed (`pnpm --filter @oh-writers/web seed:yjs`). CI (qa.yml)
   uses the root scripts, so it picks the chain up automatically.
5. **Drive-by fixes**
   - `packages/db/src/seed/reset.ts` was missing the `import "../load-env"`
     side effect, so `pnpm db:seed:reset` only worked where `DATABASE_URL`
     was already exported (CI). It now loads `apps/web/.env` like
     `seed/index.ts` does.
   - `scripts/dev-nuke.sh` deletes every `dist/` but never rebuilt the
     workspace packages before seeding (and `pnpm dev` needs them too); it
     now runs `pnpm --filter './packages/*' build` after the fresh install.
     `scripts/dev-up.sh` builds them only when `packages/*/dist` is missing
     (fresh clone safety).

### Non-goals / known remaining surfaces

- `screenplays.yjs_state` (legacy non-version room): seeded screenplays all
  have `current_version_id`, so the editor always opens the version-scoped
  room. Skipped.
- HTML narrative content: server-side DOM parsing (jsdom) not worth it for
  seed fixtures that are all plain text. Plain text that genuinely starts
  with `<` is also skipped (same heuristic as the client's `htmlToDoc`).
- The E2E harness reseed paths (`tests/global-setup.ts`,
  `tests/breakdown/helpers.ts`, `scripts/test-db-setup.sh`) call the
  db-package seed directly and skip the yjs step. Harmless today: the
  Playwright harness runs without a ws-server, so the editor is
  non-realtime and reads `content` directly (see BUG-N42 TEST DEBT). When
  the harness grows a ws-server, point those at the root `db:seed:reset`.
- Production write paths that update `documents.content` without touching
  `yjs_state` (Cesare narrative agentic edit, narrative version switch) can
  still leave a realtime room serving stale content. That is the Spec 62
  (Cesare edit as transaction) front, not a seed concern — but
  `yjsStateFromNarrativeContent` is the helper those paths will want.

## Tests

- `apps/web/app/features/documents/server/yjs-seed.server.test.ts` (Vitest):
  - happy: paragraphs/hard_breaks round-trip; whitespace collapsing matches
    the client's DOM parse; the real soggetto template round-trips lossless
  - sad: empty/whitespace content → null; HTML content → null; blank wrapped
    lines never produce schema-invalid empty text nodes
- Proof at the DB layer: `pnpm db:seed:reset` →
  `screenplay_versions.yjs_snapshot` non-NULL for every non-empty version
  and `documents.yjs_state` non-NULL for every non-empty
  soggetto/synopsis/treatment.
- Live: seeded screenplay renders its scenes with realtime ON; seeded
  soggetto renders the template; reload stable, DB byte sizes unchanged
  after editor sessions (no clobber, no growth). (The pre-existing
  `tests/editor/import-version-choice.spec.ts` suite needs `hasContent`
  true and is unblocked by this; it stays out of CI per N-31.)
