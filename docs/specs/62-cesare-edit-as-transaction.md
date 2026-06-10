# Spec 62 — Cesare narrative edit applies as a native editor transaction + unified Mostra/Nascondi

Decided via `/grill-with-docs` (2026-06-05). Canonical record: `CONTEXT.md` +
`docs/adr/0001-cesare-edits-apply-as-editor-transactions.md`.

Applies to **prose narrative documents** — Soggetto, Sinossi, Trattamento, logline.
Scaletta (structured outline) and the screenplay are out of scope.

## What is wrong today

1. A Cesare edit reaches the editor via a DB→query→`value`-prop round-trip, not as
   an editor transaction. This causes flash-then-revert and a dirty undo stack, and
   Cmd-Z does not undo a Cesare edit like a human keystroke.
2. "Mostra/Nascondi modifiche" is only a transient **overlay panel**
   (`CesareLiveDiff` paints a floating `<p>`), not a highlight inside the real prose;
   and on the full-page / chat-session surface it opens the **`TargetPagePreview`
   accept/reject tray** ("modalità trace · 1 modifica in sospeso · Accetta/Rifiuta"),
   which contradicts the live-apply contract.

## Target behaviour

### Apply (point 1)

When the modified entity's prose editor is open, the Cesare edit is applied as **one
ProseMirror transaction** in that editor (the editor is the source of truth while
open). The before/after text comes from the existing `ohw:live-diff-b64` marker's
`diff_segments` (before = eq+del, after = eq+add). The `value`-prop resync is no
longer the channel for Cesare edits; the DB stays persistence only. Native **Cmd-Z**
undoes it; **Cmd-Shift-Z** redoes it.

### Mostra / Nascondi / Riapplica (points 2, 3)

A single in-editor highlight mechanism for all prose docs, following the **entity
Cesare modified** (not the open page):

- **On the modified entity's page** → highlight inline in that editor. No
  SplitDrawer.
- **In the chat session** (`SessionConversationPage`) → open the SplitDrawer with a
  **read-only page-preview** of the modified entity + inline highlight in the
  preview. NOT the accept/reject tray.
- **On any other page** → navigate to the modified entity's page, then highlight
  inline.

The button is contextual to the applied state:

- edit present → **Nascondi** (peek prior text, fades; change stays);
- edit removed via Cmd-Z → **Riapplica** (re-issues the same edit as a fresh
  transaction — never relies on the redo stack).

### Kill (point 4) — DONE (2026-06-05)

Removed the `TargetPagePreview` trace / accept-reject SplitDrawer surface for
narrative documents. The SplitDrawer `trace` payload (with
`traceMarkers`/`onAccept`/`onReject`/`onAcceptAll`/`onRejectAll`) is replaced by a
read-only `preview` payload carrying `liveDiffs`, rendered by the new
`SplitDrawerPreviewBody` (green additions / struck-through red removals, no
footer, no "in sospeso" count). The screenplay's own scene-level proposed-edit
accept/reject is untouched. `ensurePageTraceRegistry` / `TargetPagePreview` are no
longer wired into the shell.

## Implementation map (files)

- `apps/web/app/features/app-shell/cesare-live-diff-store.ts` — already carries
  per-`documentType` `segments`; extend to model the contextual Mostra/Nascondi/
  Riapplica state (applied vs removed) rather than a one-shot flash only.
- `apps/web/app/features/documents/components/NarrativeProseMirrorView.tsx` — apply
  the Cesare edit as a transaction (replace the `value`-prop channel for Cesare
  edits); host the in-prose highlight; wire Cmd-Z naturally (history plugin already
  present).
- `apps/web/app/features/app-shell/components/CesareLiveDiff.tsx` — highlight inside
  the prose, not a floating panel.
- `apps/web/app/features/predictions/cesare-show-changes.ts` +
  `components/CesareSheet.tsx` + `components/SessionConversationPage.tsx` — surface
  routing per the rule above; drop the `TargetPagePreview` accept/reject branch.
- `packages/ui/src/composites/TargetPagePreview/*` — repurpose to a read-only
  preview (remove accept/reject) or retire for the narrative case.

## Tests

- Unit: reconstruct before/after from `diff_segments`; surface-routing decision per
  (page-open | chat-session | other-page).
- E2E (`OHW-062`): Cesare edits Soggetto → text applied; **Cmd-Z reverts it**
  (native undo) → "Mostra" button becomes **Riapplica** → click re-applies. From the
  chat session, "Mostra" opens a read-only preview (no Accetta/Rifiuta tray).
