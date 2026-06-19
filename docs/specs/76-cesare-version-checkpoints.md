# Spec 76 — Cesare version checkpoints: overwrite-by-default, mint-on-large

Fixes **BUG-N66**: iterative Cesare work floods the Versions list. A single "scrivi la
sceneggiatura" request produced 5–6 drafts before the right one; ongoing edits on a
soggetto/screenplay land `v13 · Cesare`, `v14 · Cesare`, `v15 · Cesare` … one row per turn.
The Versions surface becomes unusable — the signal (meaningful checkpoints the writer wants
to return to) drowns in noise (every intermediate AI keystroke).

## Owner decision (2026-06-11, confirmed 2026-06-15)

Applies to **every** narrative entity (soggetto, sinossi, scaletta, trattamento, sceneggiatura,
and every future Cesare-editable document).

1. **By default Cesare OVERWRITES the current version** with the new content — a surgical
   edit updates the active version in place instead of minting a new row.
2. **A NEW version is created only when:**
   - the **user explicitly asks** ("fanne una nuova versione", "salva questa versione", "tieni
     questa e parti da capo"), OR
   - the change is **large** — in that case Cesare **asks** ("Questa è una modifica
     importante: ne faccio una nuova versione?") and mints only on confirmation.
3. The **snapshot-before-apply invariant** (CLAUDE.md Agentic Edit Pattern point 3 — every AI
   mutation is revertible) is preserved by a **session/group checkpoint**, not a per-turn row:
   the first Cesare edit of a session captures a "before" checkpoint; subsequent edits in the
   same session overwrite the working version on top of it. Rollback returns to the checkpoint.

## Current behaviour (code-traced)

There are **two** version-creating seams and BOTH insert unconditionally — this is the flood:

- `apps/web/app/features/predictions/auto-version.effect.ts` → `applyVersionLive`
  (`acquireVersion` always `INSERT`s `number = max+1`). Used by every document-gen / propose
  tool in `cesare-document-tools.ts` (logline, soggetto, sinossi, scaletta, trattamento).
- `apps/web/app/features/predictions/cesare-tools.ts` → `persistDocumentContent`
  (inline, also `INSERT number = max+1`, label `Cesare · modifica N`).

A duplicate-content guard already fails when the new text is byte-identical to an existing
version, but two _different_ iterations still mint two rows.

`document_versions` has `(id, documentId, number, label, content, isDraft, createdBy,
createdAt, updatedAt)` with `unique(documentId, number)`. No column today records whether a
version is a user-meaningful checkpoint vs an in-place working copy.

## Design

### The decision lives in ONE place

Both seams converge on a single deep module so the policy can't drift between them. Introduce
**`commitCesareEdit`** (in `auto-version.effect.ts`, the existing acquireRelease module) which
replaces the unconditional INSERT with a **resolved version target**:

```
type VersionAction =
  | { kind: "overwrite"; versionId: string }   // update the active row in place
  | { kind: "mint"; label: string }            // INSERT a new numbered row
```

`persistDocumentContent` in `cesare-tools.ts` is refactored to call the same module (kills the
second seam — DRY, one policy).

### Classifying small vs large

Pure, unit-tested, no AI. `classifyEditSize(previousContent, nextContent): "small" | "large"`
using the existing `buildWordDiffSegments` (already imported here for the inline diff):

- Compute changed-word ratio = (added + removed words) / max(prevWords, 1).
- `large` when ratio ≥ **`LARGE_EDIT_RATIO` (0.4)** OR the absolute changed-word count ≥
  **`LARGE_EDIT_WORDS` (250)** (a big append to a short doc is still large).
- First write (empty previous content) is **always `mint`** — there is no current version to
  overwrite, and the first draft is a natural checkpoint.

Thresholds are named constants in one place, tuned against the real-use session, adjustable
without touching the flow.

### Resolving the action (precedence)

`resolveVersionAction(input): VersionAction` — pure, unit-tested:

1. **User explicitly asked for a new version** (`userRequestedNewVersion === true`, set by the
   intent classifier on phrases like "nuova versione", "salva questa versione") → `mint`.
2. **First write** (no current version) → `mint`.
3. **Large edit, confirmed** (`largeEditConfirmed === true`) → `mint`.
4. **Large edit, not yet confirmed** → the flow does NOT apply silently; it streams an **ask**
   (see below) and stops this turn. (Modelled as a third resolution `{ kind: "ask" }`.)
5. **Otherwise (small edit)** → `overwrite` the current active version.

So the resolver returns `overwrite | mint | ask`.

### The "ask" is a streamed turn outcome, not a modal

Per the tracer invariant (CLAUDE.md) Cesare always surfaces what it is doing. The large-edit
ask is a **streamed step** + a result card with two inline choices, NOT a native dialog (user
rule: never `window.confirm`). New stream event `ask_new_version` (added to
`cesare-stream-events.ts`):

- Cesare computes the next content, sees `classifyEditSize → large`, and instead of applying,
  emits `ask_new_version { entity, changedWordRatio }`.
- The chat renders: "Questa è una modifica importante (~N parole cambiate). La applico sulla
  versione corrente o ne creo una nuova?" with **[Sovrascrivi] [Nuova versione]**.
- The pending next-content is held for the follow-up turn (carried on the Cesare session, not
  a side draft tray — the edit is still applied LIVE once chosen, per the Agentic Edit
  Pattern). Choosing **Sovrascrivi** → `overwrite`; **Nuova versione** → `mint` (sets
  `largeEditConfirmed`).
- A user who pre-stated intent ("fanne una nuova versione, riscrivi tutto") never sees the ask
  — precedence rule 1 fires first.

### Overwrite mechanics + the session checkpoint

`overwrite` updates the **active** `document_versions` row's `content` (and `updatedAt`) in
place and mirrors it to `documents.content`. It does NOT bump `number` and does NOT insert.

To keep snapshot-before-apply: the **first overwrite of a session** first captures a checkpoint
by minting one row labelled `… · checkpoint` (the pre-session state), THEN overwrites the
working version. Session identity = the Cesare `sessionId` already on the request. A new
`document_versions.kind` column distinguishes rows:

```
kind: "checkpoint" | "working" | "manual"   -- text, default "manual"
```

- `manual` — user-made versions and explicit mints (unchanged semantics; the default keeps
  existing rows valid without backfill).
- `checkpoint` — the auto pre-session snapshot (what rollback targets).
- `working` — the live Cesare working version that overwrites collect into.

The Versions list collapses consecutive `working` rows behind their owning `checkpoint`, so
the writer sees one entry per meaningful checkpoint, expandable to the working history.

### Acquire/Release invariant is preserved

The acquireRelease structure in `applyVersionLiveEffect` is kept: on `overwrite`, `acquire`
captures the prior content of the working row (the compensation target) and `release` reverts
it on failure; on `mint`, behaviour is exactly today's. The rollback-on-error guarantee is
unchanged — only the steady-state "always INSERT" is replaced by the resolved action.

## Schema change

One additive migration: `ALTER TABLE document_versions ADD COLUMN kind text NOT NULL DEFAULT
'manual'`. Forward-only — existing rows become `manual`, which is correct (they predate the
checkpoint model and are all user-meaningful in the list). No backfill, no data migration of
the director's real versions.

## Out of scope

- The screenplay (`screenplay_versions` via `importAsActiveVersionTx`) is a **separate**
  version store with its own flood profile; this spec covers `document_versions` (narrative
  docs) only. Screenplay checkpointing is a follow-up once this lands and the model is proven.
  (BUG-N66 names both; the narrative flood is the worse offender and ships first.)
- Cross-session checkpoint pruning / retention policy.

## Implementation status (updated 2026-06-19)

The policy core + the overwrite/checkpoint engine + the explicit-intent mint all landed and are
tested. What remains is the streamed large-edit `ask` (its UI + the tool-layer wiring) and the
drawer collapse, plus the E2E. Verified against the code, not the plan.

**Done**

- `classify-edit-size.ts` (pure) + `resolve-version-action.ts` (pure, returns `overwrite |
mint | ask`) — both with passing unit tests, tagged `OHW-N66`.
- The acquireRelease engine in `auto-version.effect.ts`: `CommitOptions` (sessionId,
  userRequestedNewVersion, largeEditConfirmed), the overwrite-in-place path, and the
  first-overwrite-of-a-session `checkpoint`. NOTE: the deep module is named `applyVersionLive`
  (not `commitCesareEdit` as the Design section drafts it) and takes the policy via
  `CommitOptions`; the seam consolidation is expressed through that shared module + the shared
  `resolveVersionAction`, not a new function name. Treat the spec's `commitCesareEdit` as the
  conceptual name for this module.
- **Engine tests** for the new paths (overwrite-in-place, checkpoint-on-first-overwrite,
  rollback-restores-working) added to `auto-version.effect.test.ts`, tagged `OHW-N66`.
- `version-intent.ts` — `userRequestedNewVersion(instruction)` pure phrase matcher (+ test),
  threaded through `commitOptions` from all six Cesare document call-sites. Precedence rule 1
  is live: an explicit "nuova versione" instruction forces a mint and skips the ask.
- `document_versions.kind` (`manual` default) + `cesare_session_id` columns and migration.

**Remaining (a dedicated session — the streamed `ask` is the architecturally heaviest piece;
it moves the `ask` resolution UP to the tool layer where the step-event sink lives, so the
pure DB engine stays an apply-only module)**

1. **Slice 2 — the `ask`.** Today `acquireVersion` (auto-version.effect.ts, ~line 201, "Slice
   1" comment) degrades `action === "ask"` to mint. Move the resolve to the tool layer:
   - `ask_new_version { entity, changedWordRatio }` event in `cesare-stream-events.ts`
     (discriminatedUnion on `_tag`);
   - the document tool computes next content, classifies size, and on `ask`+unconfirmed emits
     `ask_new_version` via the step-event sink (the `(event) => Queue.unsafeOffer` callback
     threaded through `run.handle` in `cesare-stream.effect.ts`) and applies NOTHING this turn;
   - chat result-card `[Sovrascrivi] [Nuova versione]` (react-aria buttons, no native dialog);
     the choice drives the follow-up turn — Sovrascrivi→overwrite, Nuova versione→mint
     (`largeEditConfirmed`) — edit still applied LIVE per the Agentic Edit Pattern.
   - pending next-content carried on the Cesare session, not a side draft tray.
2. **Drawer collapse** — `VersionsSplitDrawer` groups `working` rows under their owning
   `checkpoint`.
3. **3 E2E** `OHW-N66` (below) — small-edit-overwrites, large-edit-asks, explicit-skips-ask.

## Tests

Tag prefix **OHW-N66**.

### Unit (Vitest)

- `classify-edit-size.test.ts` — small vs large at the ratio + absolute-count boundaries;
  empty-previous ⇒ treated as first write upstream; determinism.
- `resolve-version-action.test.ts` — every precedence branch: user-asked ⇒ mint; first write ⇒
  mint; large+confirmed ⇒ mint; large+unconfirmed ⇒ ask; small ⇒ overwrite.
- `auto-version.effect.test.ts` (extend) — overwrite updates the active row in place (no number
  bump, no new row); first overwrite of a session mints a `checkpoint` first; mint path
  unchanged; rollback-on-failure still reverts under both actions.

### E2E (Playwright, mock-ui)

- `[OHW-N66] small edit overwrites` — two consecutive small Cesare edits on the soggetto leave
  the Versions list at **one working entry under one checkpoint**, not three rows.
- `[OHW-N66] large edit asks` — a large rewrite streams `ask_new_version` and renders
  **[Sovrascrivi] [Nuova versione]**; choosing Nuova versione adds a row, Sovrascrivi does not.
- `[OHW-N66] explicit "nuova versione" skips the ask` — phrasing the request with "fanne una
  nuova versione" mints directly, no ask card.
- Cost-smoke unchanged (classification is AI-free).

## Files

- `apps/web/app/features/predictions/auto-version.effect.ts` — `commitCesareEdit`,
  `resolveVersionAction`, overwrite path, checkpoint-on-first-overwrite.
- `apps/web/app/features/predictions/classify-edit-size.ts` (new, pure).
- `apps/web/app/features/predictions/cesare-tools.ts` — `persistDocumentContent` routed through
  `commitCesareEdit` (second seam removed).
- `apps/web/app/features/predictions/cesare-stream-events.ts` — `ask_new_version` event.
- `apps/web/app/features/predictions/cesare-intent-classifier.*` — detect explicit
  "nuova versione" intent (sets `userRequestedNewVersion`).
- The Cesare chat result-card component — render the `ask_new_version` two-choice card.
- `packages/db/src/schema/document-versions.ts` + migration — `kind` column.
- The Versions SplitDrawer list — collapse `working` rows under their `checkpoint`.
