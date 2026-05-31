# Spec 44 — QA Acceptance · Iteration 2 Report

**Integration branch:** `integ/ux-notion-v3-qa-iter-1` @ `e9e6a4a` (= origin/refactor/ux-notion-v3 + fix-shell #12 + fix-split #13 + fix-cesare #14, merged + conflict-resolved)
**Date:** 2026-05-29 · **Jira:** TEST-878-2
**Conductor:** lead-qa-validator (Opus 4.8)
**Server:** revived after rebuilding `@oh-writers/db` dist (`cesareSessions` export was missing from compiled dist → 500s; not committed, dist is gitignored). `MOCK_AI=false`, real Anthropic key — generations hit the live API.

## Summary

- **Blockers: 1** (live-apply does not persist) · Majors: re-verify pending
- Convergence: **NOT reached** — one more focused fix-agent-cesare pass needed.

## What the 3 merged fixes delivered

- **fix-shell #12** — collapse → Image-5 model (rail width 0, hamburger overlay), `full` Cesare no longer fullscreen takeover, chevron relabeled. Unit 53/53. (Live re-verify deferred — see below.)
- **fix-split #13** — "Mostra modifiche" wired to a live inline-diff toggle (`body[data-cesare-diff]`). Unit 17/17.
- **fix-cesare #14** — sessions always-visible, context chip reactive + Italian aliases, `insertDraftVersion` → `applyVersionLive`. Unit 204/204.
- Merge conflict in `CesareSheet.tsx` (split `onToggleLiveDiff` vs cesare `onUndoDocApply`) resolved to keep BOTH. Web typecheck clean post-merge.

## Verified live (iter-2)

- **F1 — PASS** ✅ "Sessioni Cesare" visible with `cesare=closed` (was the major gate; fix confirmed via DOM assertion).
- **Server health — PASS** ✅ after db dist rebuild.
- **Merge integrity — PASS** ✅ typecheck green, both Cesare features coexist.
- **ChangeTrace renders — PASS** ✅ "5 passaggi ▾ / Aggiornato Soggetto / 1 MODIFICA / Mostra modifiche".
- **D3 dock icons in Cesare header — PASS** ✅ bell + TU avatar present in header when Cesare open.

## BLOCKER — agentic edit still does not land on the document

Repro: /soggetto, open Cesare, send "Genera il soggetto completo di Open Grezzo… applicalo al documento". Cesare runs 5 passaggi, replies "lo applico direttamente al documento / Aggiornato Soggetto / 1 MODIFICA". **But:**

- The open editor content is **unchanged** (still the "Milano, fine anni Novanta. Marta…" baseline) — before AND after a full page reload.
- **DB evidence** (`document_versions` for the soggetto doc `c8c572bf-…`):
  - `current_version_id` points at the 2026-05-28 14:15 non-draft baseline (the Marta text).
  - The newest versions are 07:01 and 06:33 **today, `is_draft: true`** (old draft-tray rows from iter-1).
  - **My iter-2 generation (~12:55) created NO new version at all.** Nothing was persisted.
- **Server log signature:** a server fn returned `{"result":{"isOk":true,"value":null}}` — a neverthrow `Ok(null)`: the apply path **reported success but persisted nothing**.

### Diagnosis

The fix correctly **stopped** creating `isDraft:true` rows (good — no new draft parked). But the replacement `applyVersionLive` does **not** actually create the live version / update `documents.currentVersionId` on the soggetto-generation tool path — it returns `Ok(null)` and writes nothing. The edit silently vanishes. fix-agent-cesare could not catch this because it had no working browser/auth to verify against (auth fixture 500 in its isolated server).

### Route → fix-agent-cesare (focused, isolated worktree)

- Files: `apps/web/app/features/predictions/cesare-document-tools.ts` (the `propose_*` / `applyVersionLive` handler), the document-edit skill, and the server fn that persists the version.
- Expected: a successful entity-update tool MUST insert a new **non-draft** `document_versions` row, set `documents.currentVersionId` to it, and the open editor must reflect the new content (live, via query invalidation) — confirmed by: (a) editor text changes, (b) a new `is_draft:false` row appears with `updated_at` ~now, (c) survives reload.
- Trace `↩ Annulla` must then revert `currentVersionId` to the captured previous version.
- **Verify in the real browser** (the dev server at :3000 is healthy now; use it) — do NOT mark done on unit tests alone. This bug passed unit tests but fails live.

## Deferred re-verification (not blockers, do next iter)

- Shell collapse Image-5 model live (hamburger popover, editor width stable) — unit-passed, browser-pending.
- `full` Cesare floating (not takeover) live.
- "Mostra modifiche" live-diff highlight (`body[data-cesare-diff]`) live — depends on a successful apply to diff against.
- Context chip reactive across English-slug navigation.
- Blocks H (notifications), I (persistence), J (floatingdock) — not yet reached.

## Note on process

Iter-1 fix-agents shared one working tree → branch-checkout thrash discarded in-place edits and stranded work. fix-shell self-migrated to a worktree to escape it. **Iter-2+ fix-agents must run with `isolation: worktree`.**
