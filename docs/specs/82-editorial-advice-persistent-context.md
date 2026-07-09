# Spec 82 — Editorial advice review becomes persistent Cesare context

Status: **Draft**

## Context

[[Spec 81]] classifies every Cesare editorial note and lets the writer mark it
`authorial_choice` / `ignored` / `resolved` / `approved`. Today that memory lives only
in `localStorage` (`use-editorial-advice-memory.ts`), keyed by a content fingerprint
(`length + head + tail` of the doc). Two consequences:

- it does not survive a new browser/device, and resets on nearly any edit near the
  head/tail of the document (fingerprint changes → all statuses wiped)
- Cesare's next pass has no memory of what the writer already decided, so the same
  "authorial choice" can resurface as a fresh note next session

Bug #101 fixed a Scaletta hang; #99 fixed an over-permissive prompt that always said
"OK editoriale". Both taught the same lesson: Cesare must show real notes and must not
re-litigate settled ones. This spec is the second half — persisting the writer's
decisions so they actually stick.

## Decision

A writer's "Segna" action on an editorial-advice card is stored in the DB, keyed to a
**project + document + text anchor**, not to the whole-document content fingerprint.
It is reused as context in two places:

1. **Anti-repetition**: before generating new advice, the prompt receives the list of
   already-decided notes (anchor + type + status) for that document, with an explicit
   instruction not to re-raise a settled point at the same anchor unless the anchored
   text itself changed.
2. **"OK editoriale" decision**: the model is told which real problems/risks the writer
   has already dismissed (`ignored`/`authorial_choice`), so it does not count a
   dismissed note as unresolved when deciding whether the document is clean overall.

### Explicit non-goal (guardrail against reopening #99)

This is **decision memory, not a suppression switch**. The persisted context tells
Cesare "the writer already decided X at this spot" — it never tells Cesare "stop
looking for problems" or "always answer OK". A new problem at a new anchor, or the
same anchor after the underlying text changed, is evaluated fresh with the full [[Spec
81]] grounding rules. The prompt addition is additive context, not a replacement for
rung 6 of `GROUNDING_RULES` (no advice-for-obligation) or rung 9 (must surface at least
one real problem/risk when one exists). If the anchored text changed, the old decision
is stale and does not suppress a new note there.

## Data model

New table `editorial_advice_decisions`:

```
id               uuid, pk
project_id       uuid, fk → projects.id, cascade
doc_type         text        -- narrative doc type, or "screenplay"
scene_id         uuid, fk → scenes.id, nullable, cascade
                 -- set only for screenplay-scoped advice; null for narrative docs
area             text        -- EditorialAdviceArea, e.g. "structure", "tone"
anchor_text      text        -- the `find`/`snippet` the advice was anchored to
title_fingerprint text       -- normalized title (reuses adviceFingerprint's
                                normalizeText), catches re-raised notes whose anchor
                                text is absent (narrative docs rarely set `find`)
status           text        -- EditorialAdviceStatus: authorial_choice | ignored |
                                resolved | approved
created_at       timestamp
updated_at       timestamp

unique (project_id, doc_type, scene_id, area, anchor_text, title_fingerprint)
```

Rationale for the key: anchoring to `contentFingerprint` was the bug (any edit near
doc head/tail invalidates everything). Anchoring to `(area, anchor_text,
title_fingerprint)` survives unrelated edits elsewhere in the document and only goes
stale when the specific passage the note was about changes — which is exactly when the
old decision _should_ stop applying.

`anchor_text` falls back to the empty string when advice carries no `snippet`/`find`
(some narrative notes are prose-level, not text-anchored); `title_fingerprint` alone
still dedupes those against literal re-raises.

Migration: `pnpm db:migrate:create` in `packages/db`, one new file, additive only (no
existing column touched).

## Server contract

New `createServerFn`s in `features/predictions/` (this domain already owns
editorial-advice types):

- `recordEditorialAdviceDecision` (mutation) — upsert on the unique key above, called
  from the same place `setAdviceStatus` runs today (replaces the localStorage write,
  does not duplicate it — see Migration below)
- `listEditorialAdviceDecisions` (query) — `(projectId, docType, sceneId?)` →
  decisions for that scope, passed into `buildPromptInput` (narrative) and the
  screenplay-polish equivalent to render the anti-repetition block

Both go through `withProjectAccess`, matching every other project-scoped server fn in
this codebase.

## Prompt contract

`buildPromptInput` (and the screenplay-polish counterpart) appends a block only when
decisions exist:

```
Note già decise dall'autore (non riproporle nello stesso punto, a meno che il passaggio
citato sia cambiato):
- [structure] "svolta pentimento" → scelta autoriale
- [tone] "apertura più lirica" → ignorata
```

This is appended after the grounding rules and the document body, so it reads as
context about prior review, not as an instruction that overrides rungs 6/9 of
`GROUNDING_RULES`.

## Migration from localStorage

`use-editorial-advice-memory.ts` is replaced by a hook that reads
`listEditorialAdviceDecisions` (via TanStack Query) and writes through
`recordEditorialAdviceDecision`. No dual-write, no backfill — existing localStorage
decisions are not migrated (they were never meant to survive; this spec is what makes
them durable going forward). `EditorialAdviceStack`'s `rememberedStatuses` prop shape
is unchanged, so `MarginNotesColumn`, `NarrativeCesarePanel`, and
`ScreenplayCesarePanel` only change their memory hook's data source, not their render
logic.

## Tests

- **Unit** (`packages/domain`): decision key derivation (anchor/title-fingerprint
  fallback), anti-repetition block formatting — OHW-410
- **Unit** (`apps/web` server): `recordEditorialAdviceDecision` upsert semantics
  (same key twice → one row, status updated) — OHW-411
- **Unit**: `buildPromptInput` includes the decisions block only when decisions exist,
  omits it otherwise (no empty "Note già decise:" header) — OHW-412
- **Integration/mock**: a note marked `ignored` in one Cesare pass does not reappear
  with the same anchor in the next pass on unchanged text; a genuinely new problem at a
  different anchor still surfaces — OHW-413
- **E2E** (Playwright, mock AI): mark a Soggetto note as "scelta autoriale", reload the
  page, confirm the status persists (DB-backed, not localStorage) — OHW-414
