# Spec 47d — Live diff: inline word highlight on ALL involved documents

Status: **Planned** · Decided 2026-05-30 (PO, from live screenshot review). Supersedes the
overlay-popup live-diff behaviour shipped in 47b FIX 4.

## Problem (observed live)

"Mostra modifiche" currently renders a **separate floating overlay panel** ("✦ Modifiche · v2")
on top of the page, showing the diff with **raw HTML tags visible** (`<p>`, `</p>`) and the change
detached from the real document. This is wrong on three counts:

1. The overlay popup is not wanted — the change must be shown IN the real document, inline.
2. Raw HTML markup (`<p>…</p>`) must never be shown to the user — words only.
3. The highlight must appear on EVERY document the edit touched (soggetto, sinossi, trattamento,
   sceneggiatura, …), not only the currently open one.

## Contract (canonical — applies to every Cesare edit)

1. **Mostra modifiche** → the change is highlighted **inline inside the real document** as a
   green word-level highlight (additions). Removals shown per the diff style (struck/red), but the
   default user-facing emphasis is the green "this is what changed". NO separate overlay panel.
2. **Words, not markup.** The diff is computed and rendered at the *text/word* level. The user never
   sees HTML tags. Block markup (`<p>`, headings) is stripped/normalised before diffing and never
   surfaced.
3. **Nascondi modifiche** → removes the highlight and returns the document to the previous visual
   state (the highlight overlay clears; the applied content stays unless the user hits ↩ Annulla,
   which reverts the version).
4. **All involved documents.** If an edit touched multiple entities, EACH of them shows the green
   inline highlight when opened, and stays highlighted until Nascondi/Accetta/Annulla. "Tutti = tutti":
   soggetto, sinossi, scaletta, trattamento, sceneggiatura, and any future entity. Opening a touched
   doc while "Mostra modifiche" is active shows its highlight; the highlight is keyed per document.

## What to remove

- The floating "✦ Modifiche · v2" overlay panel (the popup in the screenshot). Delete it as the diff
  surface. The Step Block / ChangeTrace card in the chat keeps only the `Mostra/Nascondi modifiche` +
  `Annulla` controls and a one-line summary — NOT the full diff dump, and never raw HTML.

## Implementation notes

- The diff transport already exists: `buildWordDiffSegments` (utils) + the `ohw:live-diff-b64` marker
  (per touched entity) + `CesareLiveDiff` overlay component. Repurpose `CesareLiveDiff` to paint the
  highlight **inside the document body** (the editor's rendered prose), not as a top-left floating panel.
- Diff at word level on the **plain text** (strip block tags first) so no `<p>` ever shows.
- Emit one live-diff marker **per touched document** (`{ documentType, segments }[]`), so the shell can
  arm a highlight for each. The highlight for a given doc renders when that doc's body is mounted.
- `body[data-cesare-diff="on"]` stays as the global "diff mode armed" flag; per-doc highlight keyed by
  document id/type. Nascondi clears the flag + all per-doc highlights.
- Keep ↩ Annulla = revert the auto-created version (existing behaviour) — distinct from Nascondi.

## Tests (OHW-047d)

- Edit a single doc → Mostra shows green word highlight INSIDE the document prose (not an overlay
  panel); no raw `<p>` text anywhere; Nascondi clears it.
- Cross-entity edit (e.g. soggetto + sinossi) → open each → each shows its own green highlight while
  diff mode is armed.
- The old floating "Modifiche" overlay panel is gone (assert it does not render).
- Annulla reverts the version; Nascondi only hides the highlight.

## Build

A focused agent, after the current consolidation. Reuses the live-diff transport; the work is
(a) delete the overlay panel, (b) render inline-in-document word highlights, (c) per-touched-document
keying, (d) strip block markup so only words show.
