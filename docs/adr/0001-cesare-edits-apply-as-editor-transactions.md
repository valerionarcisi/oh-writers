# Cesare edits apply to the open prose editor as a native transaction; the live-diff marker is the before/after transport

Status: accepted · 2026-06-05

## Context

A Cesare edit to a narrative document used to land in the editor indirectly: the
tool wrote the new content to the DB, the document query was invalidated, the
refetched content flowed back into the editor through the `value` prop, and the
ProseMirror view replaced its whole doc. This DB→query→prop round-trip is the root
cause of the "flash-then-revert" bug (the autosave races the resync and can clobber
the applied draft) and it pollutes the undo stack (every `value` change re-fires a
full `replaceWith`). The user wants a Cesare edit to behave **exactly as if a human
typed it**: native **Cmd-Z** undoes it, Cmd-Shift-Z redoes it.

## Decision

When the modified entity's prose editor is open, a Cesare edit is applied **as one
ordinary ProseMirror transaction in that editor** — the editor is the source of
truth while it is open. The `value` prop / DB-resync is **no longer the channel for
Cesare edits**; the DB remains only the persistence layer (auto-created version +
autosave of the resulting transaction).

The **before/after content needed to build that transaction is already transported**
by the existing `ohw:live-diff-b64` marker: its word-level `diff_segments`
(`{op: "eq"|"add"|"del", text}`) reconstruct both the previous text (eq+del) and the
new text (eq+add), keyed per `documentType`. No new transport is needed — the
step-trace stream (`reading`/`writing`/`done`) carries only the entity ref and is
NOT extended.

This mechanism is **identical for every prose narrative editor** — Soggetto,
Sinossi, Trattamento, and the logline — because they all render through the shared
`NarrativeProseMirrorView` / `LoglinePill`, which already mount the per-`documentType`
live-diff consumer. There is no per-feature variant.

> **Superseded in part by ADR-0003.** The "Mostra/Nascondi modifiche" word-level
> in-editor highlight described below is **removed** — a word-by-word diff is
> programmer language. Change feedback on the entity page is now the adaptive
> banner + block-level highlight of ADR-0003. The "rollback lives only in
> Versions, no inline Annulla" stance below is also relaxed by ADR-0003: a single
> **"↩ Annulla"** on the banner reverts the WHOLE edit (one level, not per-tool),
> using the same pre-edit snapshot. The live-apply core of THIS ADR (edit = one
> editor transaction, Cmd-Z undo) is unchanged.

"Mostra/Nascondi modifiche" stays an in-editor highlight that follows the **entity
Cesare modified** (not the open page) and is contextual to the applied state:
**Nascondi** when the edit is present, **Riapplica** (re-issues the same edit as a
fresh transaction) once the writer has pressed Cmd-Z — so the suggestion is never
lost to the fragile redo stack.

## Scope / explicit no-s

- **Scaletta is excluded.** It is a structured outline (`OutlineEditor`, JSON), not
  prose; a word-level text diff/transaction does not apply. Its Cesare-edit UX is a
  separate concern.
- **The screenplay is excluded for now.** It keeps its existing scene-level
  proposed-edit accept/reject flow (ADR may follow when it is unified).
- **The `TargetPagePreview` trace / accept-reject SplitDrawer is removed** as the
  change-review surface for narrative documents — it contradicts the live-apply
  contract. The SplitDrawer survives only as a read-only page-preview opened from
  inside a chat session.

## Consequences

- Eliminates the flash-then-revert race by construction (one writer, the editor) and
  keeps the undo stack clean (one edit = one undo).
- The autosave canonical dirty-check (Spec 61) is still useful as a belt-and-braces
  guard but is no longer load-bearing for the revert bug.
- A Cesare edit made while the target editor is **not** open still persists to the DB;
  when the writer later opens / navigates to that entity, "Mostra" highlights it
  there (or opens the SplitDrawer preview when in the chat session).
