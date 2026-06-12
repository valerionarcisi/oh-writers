# Spec 75 — Cesare versioning policy: one working version per turn group

**Status**: approved — implemented in lane B of stabilization wave 2
**Bug**: BUG-N66 (ALTO — version flood: v13/v14/v15 "Cesare · modifica" + 5-6 drafts for one request)
**Supersedes**: the per-turn auto-version wording of the Agentic Edit Pattern point 3 (CLAUDE.md + Spec 44)

## Owner policy (decided 2026-06-11, not up for debate)

Applies to ALL narrative parts: soggetto, sinossi, scaletta, trattamento, sceneggiatura.

1. **Default: Cesare OVERWRITES the current version** with surgical edits. Iterating with
   Cesare does NOT grow the version list.
2. **A NEW version is created ONLY when the user explicitly asks for one**
   ("fanne una nuova versione", "crea una v2", …).
3. **For a LARGE change Cesare may ASK the user** instead of deciding alone
   ("È una modifica importante: la applico alla versione attuale o ne creo una nuova?").

## Reconciliation with the auto-version invariant

The Agentic Edit Pattern (point 3) requires every AI mutation to be revertible via a
pre-apply snapshot. The old implementation satisfied it by inserting a NEW version on
EVERY turn — that is the flood. The new contract keeps revertibility with **one
checkpoint per turn group**:

> **The first Cesare edit of a turn group inserts ONE new version (the "working
> version") and repoints `documents.current_version_id` at it. The version that was
> current before the group is left untouched — it IS the "before" checkpoint. Every
> subsequent Cesare edit in the same group overwrites the working version's content
> in place. Rollback = activate the pre-group version from the Versions SplitDrawer,
> exactly as today.**

### Why this shape — two designs considered

- **A. Overwrite current + snapshot-before row**: Cesare mutates the user's current
  version in place; the first edit of a group copies the old content into a new
  "checkpoint" row. Rejected: the checkpoint row gets a HIGHER number than the
  current version while holding OLDER content (list reads backwards), and Cesare
  mutates rows the user authored.
- **B. One Cesare working version per group** (chosen): user-authored version rows are
  never mutated; the before-snapshot needs no extra row (it is the previous version,
  already in the list); numbering stays chronological; the collapse is literally
  "consecutive Cesare versions collapse into one". Fewer moving parts.

### Turn group — precise definition

A Cesare edit **reuses (overwrites) the document's current version** iff ALL hold:

1. the turn carries a Cesare **session id** (threaded from the chat client — both the
   floating drawer and the session page create a real session before sending);
2. the document's current version row was created by Cesare **in the same session**
   (`document_versions.cesare_session_id` matches);
3. the working version is **fresh**: `now − updatedAt < 30 min`
   (`CESARE_VERSION_GROUP_TTL_MS`) — reopening an old session days later never
   silently overwrites old work;
4. the model did **not** request a new version (`versioning` tool param, below).

Otherwise the edit **inserts** a new working version (stamped with the session id)
and repoints the document at it — the previous version becomes the group checkpoint.

**Group ends** (next edit starts a new working version) when:

- the user activates another version, duplicates one, or creates one from scratch
  (the current pointer no longer matches — falls out of conditions 1-3 for free);
- the user **renames** the working version or sets its **colour/date meta** — that is
  the user claiming it; `renameVersion`/`updateVersionMeta` clear
  `cesare_session_id` on the row;
- a different Cesare session (same or another user) edits the document;
- the 30-minute freshness window lapses;
- the user explicitly asks for a new version.

**Documented tradeoff**: manual typing into the document does NOT end the group. The
Yjs persistence path makes Cesare-applied content and hand-typed content
indistinguishable server-side, so detecting "manual edit" reliably would require new
bookkeeping for a marginal case. Mid-burst manual tweaks are folded into the working
version; everything before the group stays protected by the checkpoint, and the TTL
bounds the exposure window.

When no session id reaches the server (defensive fallback, non-chat callers), every
edit inserts a version — the pre-N66 behaviour, never less safe.

## Detection: explicit request and large change

- **Explicit request** → a `versioning` parameter on every document write tool
  (`apply_text_edit`, `expand_section`, `compress_section`, `write_logline`,
  `propose_logline_from_screenplay`, `propose_synopsis_from_screenplay`,
  `propose_soggetto_v2`, `propose_scaletta_from_soggetto`,
  `propose_treatment_from_narrative`):
  `versioning?: "overwrite" | "new"` — default `"overwrite"`. The system prompt
  instructs the model to set `"new"` ONLY when the user explicitly asks for a new
  version (examples in the guidance). The server honours it verbatim: `"new"` forces
  the insert path. The freshly inserted version still carries the session id, so the
  burst CONTINUES on it ("fanne una nuova versione più cupa" → "sistema il secondo
  paragrafo" lands on the new version, not on a third one).
- **Large change** → model-side judgment, prompt-driven (no server heuristic — the
  server never second-guesses the policy). Guidance heuristic: a full rewrite of an
  already-substantial document (not a first generation, not a surgical edit) counts
  as large. In that case, when the user did NOT ask for a new version, Cesare must
  ASK in chat before calling the tool, with the canonical copy:
  **"È una modifica importante: la applico alla versione attuale o ne creo una
  nuova?"** — and route the answer to `versioning`.

## Version naming (Italian UI copy)

- **Working version (group)**: `Cesare · {documento}` with the latest instruction as
  hint — e.g. `Cesare · soggetto (più asciutto)`. Built by
  `buildCesareVersionLabel(docType, hint)`. The label is REFRESHED on every
  overwrite turn so it always describes the latest edit. Replaces both
  `draft Cesare · …` and `Cesare · modifica N`.
- **Explicit-request version**: the model-supplied `label` param when the tool has
  one and the model provided it (e.g. `propose_soggetto_v2` → "v2 più cupa"),
  otherwise `buildCesareVersionLabel` as above.
- **Ask-the-user path**: no version artifact — the question above is chat copy; the
  answer routes to one of the two cases.

## Implementation

- `packages/db/src/schema/document-versions.ts` — new nullable column
  `cesare_session_id` (FK → `cesare_sessions.id`, `on delete set null`); migration
  `0039_document_versions_cesare_session.sql`.
- `apps/web/app/features/predictions/auto-version.effect.ts` — the single write path:
  - `resolveVersionWriteMode` (pure): `{intent, cesareSessionId, currentVersion(now)}`
    → `"overwrite" | "insert"`, with `CESARE_VERSION_GROUP_TTL_MS = 30 min`;
  - acquire/use/release handles BOTH modes: insert (as before, + session stamp) and
    in-place overwrite (captures prior content+label, restores them on failure);
  - duplicate guard: insert mode checks all versions (unchanged); overwrite mode
    checks only against the working version's own current content (an in-place
    overwrite cannot flood, and the model may legitimately return to pre-group text).
- `apps/web/app/features/predictions/cesare-tools.ts` — `persistDocumentContent`
  now delegates to `applyVersionLive` (one write path, no parallel
  `Cesare · modifica N` insert); document-edit executors accept and forward the
  versioning options.
- `apps/web/app/features/predictions/cesare-document-tools.ts` — handlers thread
  `{cesareSessionId, intent}`; tool schemas gain `versioning`; labels via
  `buildCesareVersionLabel`.
- Threading: `CesareInputSchema.sessionId` (optional uuid) → `handleAskCesareV2` →
  `SkillBuildContext.cesareSessionId` → document-gen/document-edit skills →
  executors. Client: `StreamCesareInput.sessionId` sent by the chat store (real
  session UUID, `null` while pending). The legacy `UniversalToolContext` gains the
  same field.
- `apps/web/app/features/documents/server/versions.server.ts` — `renameVersion` and
  `updateVersionMeta` clear `cesareSessionId` (user claims the version).
- Prompt guidance (document-gen + document-edit skills): the versioning policy block,
  the `versioning:"new"` examples, and the canonical ask-the-user copy.
- Tracer invariant untouched: step events stream exactly as before; only the version
  bookkeeping under `writing{entity}` changes.

### Out of scope (follow-up)

The sceneggiatura **draft-proposal** path (`cesare-screenplay-tools.ts`,
`screenplay_versions` with `isDraft: true`, promote/discard flow) is covered by the
POLICY but keeps its mechanics for now: it does not apply live and its drafts are
explicit user-reviewed proposals. Collapsing consecutive same-session screenplay
drafts is filed as a follow-up (BACKLOG) so this lane stays surgical. The N66 flood
observed in real use came from the document-versions path (per BUG-N67 the
"screenplay" request actually wrote the Trattamento).

## Tests

| Tag       | File                                                              | Scenario                                                                                                                                                                                                                                                                                                                     |
| --------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [OHW-075] | `apps/web/app/features/predictions/auto-version.effect.test.ts`   | happy: same session + fresh + overwrite intent → `"overwrite"`; insert when session null / mismatch / stale / intent `"new"`; overwrite updates the row in place (no insert) and refreshes label; sad: forced overwrite failure → release restores prior content+label; duplicate guard per mode; empty-content guard intact |
| [OHW-075] | `apps/web/app/features/predictions/cesare-document-tools.test.ts` | `resolveVersionIntent`: absent/`"overwrite"` → overwrite, `"new"` → new, junk → overwrite (default); `buildCesareVersionLabel` happy + empty/overlong hint                                                                                                                                                                   |
| [OHW-075] | `tests/cesare-versioning-policy.spec.ts` (mock-ui)                | happy: 2 consecutive Cesare edits in one drawer session → exactly ONE new "Cesare ·" version (count collapses); explicit "fanne una nuova versione" → a SECOND version appears; sad: versions list never shows `Cesare · modifica N` flood rows                                                                              |

The mock scenario for the explicit path scripts `versioning: "new"` — it proves the
server honours the param. The model's real-world decision to set it is prompt-driven
and only verifiable with a real-AI smoke (out of scope for mock E2E, same stance as
N67's lane).
