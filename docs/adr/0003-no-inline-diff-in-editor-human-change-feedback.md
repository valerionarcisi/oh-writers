# No word-level diff in the editor: change feedback is human, not a code diff

Status: accepted · 2026-06-05

## Context

After a Cesare edit, the entity's editor (Soggetto, Sinossi, Trattamento, logline)
painted a word-level green/red diff inline (`CesareLiveDiff`, the "Mostra/Nascondi
modifiche" highlight). The audience is writers, directors and producers — not
programmers. A word-by-word "added _un_ before _open_" diff is code-review
language; it does not communicate a change to an author, and on a full rewrite
(every word is "added") it degrades to noise.

## Decision

There is **no word-level diff highlight in the editor — ever** (the
`CesareLiveDiff` green/red word painting is removed). Change feedback is
communicated in human terms, and is **adaptive to the size of the edit**.

**The banner is always the same** on every entity page — a discreet, persistent
banner: "✦ Cesare ha aggiornato il \<Entity>" with two actions:

- **"Vedi cosa è cambiato"** → opens the read-only split-preview: the final
  document text (clean, no marks) + a bullet summary of what changed. Same surface
  as a chat-session result card's "Vedi modifica".
- **"↩ Annulla"** → reverts the WHOLE edit (the entire Cesare turn) in one action,
  using the pre-edit snapshot `auto-version.effect` already creates. This is a
  single-level undo of "what Cesare just did" — NOT a per-block/per-tool accept-
  reject (that track-changes model is rejected). There is **no "accept"**: the
  edit is already applied live (ADR-0001); accepting = continuing.

The banner **persists until the author acts** (opens it, "Ho visto", starts
typing, or ↩ Annulla) — never a timeout, so an author returning later still knows
Cesare touched the document.

**What happens in the text is adaptive** to the share of the document Cesare
changed (computed from the existing `diff_segments`):

- **Surgical edit** (below threshold) → the **changed sentences/blocks** stay
  highlighted in place (block-level, gentle — never word-by-word). The highlight
  on a block clears when the author **edits that block** (or "Ho visto" clears all
  remaining); Cmd-Z on a block clears it too (the block is back to before). An
  author who leaves and returns still sees the not-yet-touched blocks highlighted,
  so the "where" is never lost.
- **Large rewrite** (at/above threshold) → **no in-text highlight** (highlighting
  ~everything would be noise, the original mistake). The text shows clean; the
  bullet summary in the split-preview is the way to understand what changed.

Threshold: surgical if Cesare changed **< ~40%** of the words (del+add over total),
rewrite otherwise. Tunable.

**True before/after comparison and version rollback** live in the Versions
surface, never the editor.

This replaces the legacy `DraftBanner` (promote/discard of `isDraft=true` drafts),
which is dead for narrative documents now that Cesare applies live.

## Consequences

- The editor text is never decorated; what the author reads is the document.
- The bullet "Cosa cambia" summary (Cesare's own words) is the human explanation,
  not a generated diff.
- The word-level `diff_segments` transport still exists and still feeds the
  split-preview's "final text" reconstruction; it simply is not painted as an
  inline highlight anymore.
- The screenplay's own scene-level proposed-edit flow is out of scope and
  unchanged.
