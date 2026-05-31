# Spec 51 — Cesare history as generated markdown (edits + sessions)

Status: **Built** · Decided 2026-05-31 (PO) · Implemented 2026-05-31.

## Implementation notes (2026-05-31)

- **Messages persisted** in a new `cesare_messages` table (migration `0035_cesare_messages.sql`):
  `id`, `session_id` (FK → `cesare_sessions`, cascade), `role`, `content`, `metadata` (jsonb:
  the live step trace + the per-edit version markers), `created_at`. Persisted in the send path
  (`cesare-chat-store.tsx` calls `persistTurn` after a turn settles) and re-hydrated on session
  open (`thread/hydrate` reducer action, no-op if the thread already has bubbles so an in-flight
  turn is never clobbered). Server fns live in `features/predictions/messages/messages.server.ts`
  (neverthrow CRUD per the Spec 48 boundary — no LLM/external resource).
- **Pure md builders** live in `packages/domain/src/cesare-history/`: `buildEditChangelogMarkdown`
  / `buildEditChangelogListMarkdown` (changelog), `buildSessionTranscriptMarkdown` (transcript),
  `buildHistoryContextSummary` (bounded context). Framework-agnostic, no Effect/Drizzle/browser.
  Additions render `**bold**`, removals `~~strikethrough~~` — no raw HTML.
- **Effect loaders** in `features/predictions/messages/cesare-history.effect.ts` gather the
  DERIVED sources from `cesare_messages` + `document_versions` (the changelog diff is RECOMPUTED
  via `buildWordDiffSegments` from the two version rows — nothing reads stored markdown). Exposed
  through `cesare-history.server.ts` (`getSessionChangelogMarkdown`, `getSessionTranscriptMarkdown`)
  returning `ResultShape`. No cache table — the markdown is regenerable (unit-tested).
- **Context reuse**: `loadHistoryContextSummary` appends a bounded "CRONOLOGIA MODIFICHE" block
  (capped to the most recent edits) to the system prompt via `assembleSystemPromptV2`'s optional
  `historyContext` arg in the V2 handler. Degrades to null on any failure — never breaks a turn.

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
flash is transient (spec 47e). The markdown changelog is the _persistent_ record behind it — open it
later, feed it back as context, or diff a chain of edits.

### 2. Per-session transcript markdown

Every Cesare session (`cesare_sessions`, spec 44/46) gets a generated markdown **transcript**:

- the conversation (user prompts + assistant replies),
- the inline step trace per turn (reading → reasoning → writing → done),
- the edits made in that session (links to the per-edit changelog entries above),
- timestamps + the entities touched.

The session transcript is the human-readable, reusable record of "what Cesare and I did in this
session" — surfaced on the session route (spec 46), reusable as context for a follow-up session.

## Decided value + approach (PO, 2026-05-31)

**Both uses are wanted** — and they share one derivation:

1. **Continuity between sessions (Cesare remembers).** The markdown history is fed back as bounded
   context so sessions are continuous, not amnesiac. This is the strongest win; it plugs into the
   existing context-`.md` assembly (spec 38/40).
2. **Inspectable record for the human.** The same markdown is a readable/shareable document of "what
   Cesare changed" and "what happened this session".

**Architecture decision (non-negotiable): the markdown is a DERIVED VIEW, never a separate store.**
The markdown is **generated on-read** from the single source of truth (with an optional cache that is
regenerable, never authoritative). NO `cesare_edit_log` / `cesare_session_markdown` table that lives
its own life — that would be a second source of truth that drifts (the classic anti-pattern; violates
DRY and "the documents are the state"). If a cache is added, deleting it must reproduce identical
markdown.

### Prerequisite discovered (2026-05-31): chat messages are NOT persisted yet

Codebase reality check before building: the source of truth differs per surface.

- **Per-edit changelog MD — derivable NOW.** `documentVersions` + version ids (W-E4) + the
  `diff_segments`/`ohw:doc-applied` data (47d) are already persisted. The changelog MD derives from
  these immediately.
- **Per-session transcript MD — needs message persistence first.** Today only `cesare_sessions`
  (id/title/timestamps, `packages/db/src/schema/cesare-sessions.ts`) exists — there is **no messages
  table**; the conversation lives in-memory in `useCesareChat`. To derive a session transcript we must
  FIRST persist the messages (a `cesare_messages` table FK'd to `cesare_sessions`: role, content,
  step-trace metadata, timestamp). This is a real prerequisite, not optional.

**Build order within Spec 51:** (1) persist chat messages (the missing source of truth), (2) per-edit
changelog MD from versions+diff, (3) per-session transcript MD from the now-persisted messages, (4)
feed bounded history MD back as context. Step 1 is the gate for step 3.

## Design questions to resolve before building

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
