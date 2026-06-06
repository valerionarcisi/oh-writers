# Spec 63 — Entity change feedback: in-editor card stack (the canonical agentic-edit surface)

Decided via `/grill-with-docs` (2026-06-05 / 2026-06-06). Canonical record:
`CONTEXT.md` + `docs/adr/0003` (+ ADR-0001 reconciliation). Applies to the prose
narrative documents (Soggetto, Sinossi, Trattamento, logline) AND the screenplay
(per-scene). Scaletta (outline) is out of scope.

## Principle

When the writer is ON the page Cesare just edited, the change is shown **inline,
never in the SplitDrawer** (the split would duplicate the document the writer is
already reading). The SplitDrawer is for the chat session only (editor not in
front of the user). The bell/NotificationCenter remains the "it happened
elsewhere" channel and navigates to the entity, where the same card is waiting.
Same visual language (the card), three entry points.

## The card

A discreet card above the editor: `✦ Cesare ha aggiornato il <Entity>` with:

- **"Vedi modifiche"** — ADAPTIVE, NEVER opens the split:
  - **surgical** edit (< ~40% of words changed) → underline the changed blocks in
    place in the editor (block-level, never word-by-word; toggle off on re-click).
  - **large rewrite** (>= ~40%) → expand the bullet "cosa cambia" summary INSIDE the
    card (underlining everything would be noise). Still no split.
- **"↩ Annulla"** — restores the document to the state BEFORE the turn began (the
  pre-turn snapshot), skipping any intermediate versions Cesare made mid-turn (e.g.
  on a version conflict). One level, whole turn. No "accept" (already applied).
- **× / "Ho visto"** — closes the card.

### Granularity

- **Prose docs**: one card **per Cesare turn** (the individual changes are the
  bullets inside; Annulla reverts the whole turn).
- **Screenplay**: one card **per scene** touched (scenes are separable; Annulla
  reverts that scene). Cards float pinned near their scene (`[data-scene-number]`),
  not stacked in one spot; an indicator jumps between edited scenes.

### Stack

Multiple cards **stack collapsed as an iOS-style pile**: only the **most recent
card** is shown in full, with 2–3 cards **hinted behind it** (stacked edges) and a
**"+N" badge**. **Clicking the top card FANS the stack OUT** — the cards cascade
downward, offset and overlapping, **newest on top**, each with its own **Mostra
modifiche** + **↩ Indietro** + **×**. Clicking again (or the top card) collapses
back to the pile. **Newest is always first/on top** — never inverted. There is no
‹ › carousel. The fan-out stays **in-page above the editor**, never an overlay,
never the split.

The stack lives in **browser-session memory** (a singleton store): survives
client-side routing (incl. the bell navigating to the entity) but **dies on tab
reload**. The durable history is the Versions surface. Live-only.

## Implementation

- **Store** (`cesare-live-edit-store.ts`, already created): singleton, per
  `documentType` (prose) / per scene (screenplay). Extend to hold a STACK per
  document (not just the latest), each entry carrying: label, segments, summary,
  and the **pre-turn versionId** for Annulla.
- **Pre-turn snapshot for Annulla**: (A) capture the open document's
  `currentVersionId` CLIENT-SIDE at message-send (deterministic, independent of how
  many edits/conflicts Cesare makes in the turn); (B) fall back to the first edit's
  `previous_version_id` marker when the entity's editor is not open (e.g. edit made
  from a chat session). The current bug — Annulla only closing the banner — is
  because it read the LAST marker's previous id; switch to (A)/(B).
- **Indietro** (the relabelled "Annulla") = `useSwitchToVersion(documentId)` to
  the pre-turn version. It restores the OPEN DOCUMENT in place (the editor
  re-syncs); it does **NOT** touch the SplitDrawer. The revert is async, so
  `onUndo` returns a Promise: the button shows a **small inline spinner** while
  the revert is in flight and the card dismisses **only once it resolves** (never
  optimistically; on failure the card stays). On the entity page the split is
  never involved in any banner action.
- **Mostra modifiche** = an **underline drawn ON the real document text** (a
  ProseMirror decoration over the changed ranges), toggled per-card. It is NOT an
  overlay layer floating above the prose, NOT a fullscreen modal, NOT the split.
  The earlier `CesareLiveDiff` overlay (a duplicated-text panel painted above the
  editor) is wrong for this — replace it with an in-document decoration so the
  highlight lives in the prose the writer is reading. On the entity page Mostra
  NEVER opens the SplitDrawer; the split is reserved for the chat surface only.
- **Card visual** = a **solid green-bordered card** (the agent/notification colour),
  not a double/outlined border. Same visual language as the notifications.
- **Annulla → relabel "Indietro"** = restores the document to the **pre-turn
  version** (a real revert via `useSwitchToVersion`) AND dismisses the card. The
  bug being fixed: Annulla used to open/affect the split instead of reverting the
  document. One level, the whole turn. The durable rollback also lives in Versions.
- Shared `FreeNarrativeEditor` / `NarrativeProseMirrorView` so all prose docs get it
  for free; the screenplay editor mounts the per-scene variant.
- **Chat result card uses the SAME in-document highlight on the entity page.**
  When the floating chat sits over the page's OWN editor, the card's "Mostra
  modifiche" does the **same in-document underline** as the banner (not the split):
  `CesareSheet.handleShowChanges` calls `setHighlight(docType, addedFragments)`
  when `documentTypeMatchesPage(docType, page)`, and `handleHideChanges` calls
  `clearHighlight`. For a cross-domain edit on a DIFFERENT page, or a routed chat
  session with no editor in front, it still opens the read-only split-preview.
  (Superseded the earlier `suppressShowChangesForPage` hide — the button is kept
  and re-wired to the highlight, per Valerio 2026-06-06.)
- The bell (N-33) carries the same "✦ Cesare ha aggiornato …" content + a "Vai"
  that routes to the entity.

## Tests

- Unit: surgical-vs-rewrite classifier at the threshold; pre-turn snapshot capture.
- E2E (`OHW-063`): surgical edit → card + "Vedi modifiche" underlines the changed
  block; rewrite → card + "Vedi modifiche" expands bullets (no split). ↩ Annulla
  restores the pre-turn text. Stack: two turns → two stacked cards, ‹ › navigates,
  Annulla on the older one restores that turn's pre-state. Stack survives a
  client-side route change, clears on reload.
