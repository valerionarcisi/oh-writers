# Spec 51 — Cesare history as generated markdown (edits + sessions)

Status: **Planned** · Decided 2026-05-31 (PO) · Build AFTER the merge to main.

## Context

The PO wants the Cesare history — both the per-edit "Mostra/Nascondi" change record AND the
overall session history — to be persisted as **generated markdown**, not just runtime state. This
is consistent with the project's "the documents are the state" principle and the existing
context-`.md` files fed to the LLM: a markdown history is inspectable, versionable, deep-linkable,
diff-able, and reusable as model context.

Two markdown surfaces (both wanted):

### 1. Per-edit changelog markdown

Every agentic edit (the thing behind a "Mostra/Nascondi modifiche" card) produces a persisted
markdown changelog entry capturing **what changed**:

- the entity edited (soggetto / sinossi / scaletta / trattamento / sceneggiatura / logline / …),
- the tool + instruction that produced it,
- the version created (the `applyVersionLive` version id + the previous one),
- the word-level diff (before → after), the same `buildWordDiffSegments` data rendered as markdown
  (additions/removals) so the change is readable without the live UI.

This makes the "Mostra/Nascondi" history durable: today the diff is computed at click time and the
flash is transient (spec 47e). The markdown changelog is the *persistent* record behind it — open it
later, feed it back as context, or diff a chain of edits.

### 2. Per-session transcript markdown

Every Cesare session (`cesare_sessions`, spec 44/46) gets a generated markdown **transcript**:

- the conversation (user prompts + assistant replies),
- the inline step trace per turn (reading → reasoning → writing → done),
- the edits made in that session (links to the per-edit changelog entries above),
- timestamps + the entities touched.

The session transcript is the human-readable, reusable record of "what Cesare and I did in this
session" — surfaced on the session route (spec 46), reusable as context for a follow-up session.

## Design questions to resolve before building

- **Storage**: a new `cesare_edit_log` / `cesare_session_markdown` table (markdown text + metadata),
  or generated-on-read from existing data (messages + versions + diff segments)? Lean: generate from
  existing data + cache, so there's a single source of truth (the messages/versions) and the markdown
  is a derived, regenerable view — not a second store to keep in sync. (Mirrors the "documents are the
  state" rule.)
- **Granularity / linking**: per-edit MD entries linked from the session MD; the session MD linked
  from the session route. Deep-linkable.
- **Reuse as context**: the markdown plugs into the existing context-assembly (spec 38/40 local
  context) so a session can carry forward "what we changed last time" — but bounded (don't bloat the
  prompt; summarise older history).
- **Markdown shape**: reuse the existing context-md conventions; keep it framework-agnostic (the
  builders are pure functions in `domain`, per the boundary rule — NOT Effect; only the data loading
  that feeds them is Effect, per spec 48).

## Relation to existing work

- The per-edit diff data already exists: `buildWordDiffSegments` + the `ohw:doc-applied` /
  `ohw:live-diff-b64` markers (spec 47d) + `applyVersionLive`'s version ids (spec 48 W-E4). Spec 51
  formats that into persisted/derived markdown.
- The session messages already exist (`cesare_sessions` + chat persistence). Spec 51 renders them as
  a transcript.
- Pure markdown builders stay pure functions in `domain` (architecture boundary rule).

## Tests (OHW-051)

- After an edit, a changelog MD entry exists/regenerates with the entity, version ids, and the
  word-diff rendered as markdown (no raw HTML).
- A session's transcript MD renders the conversation + step trace + links to its edit entries.
- The markdown is regenerable from source data (delete cache → same output) — proving it's derived,
  not a divergent second store.
- History MD can be fed back as bounded context to a follow-up session.

## Out of scope

- A full version-control UI on top of the markdown (the Versions SplitDrawer, spec 49, covers
  version rollback).
