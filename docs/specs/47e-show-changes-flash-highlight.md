# Spec 47e — Mostra/Nascondi modifiche: transient flash highlight (no Annulla)

Status: **Planned** · Decided 2026-05-30 (PO, from live audit). Supersedes the 47b/47d
"persistent diff overlay + Annulla" behaviour for the document-edit case.

## The behaviour the PO wants (definitive)

The edit is **always applied** to the document — the document always holds the new version.
"Mostra / Nascondi modifiche" is a **transient flash highlight**, not a persistent on/off overlay
and not a toggle that changes which version is saved.

- **Default state (right after Cesare finishes):** the change is already applied and live in the
  editor (consistent with "the editor updates live while Cesare works").
- **Click "Mostra modifiche":** flash a **green** highlight on the changed/added words, then it
  **fades out** after a short delay. The document stays on the new version.
- **Click "Nascondi modifiche":** briefly show the **previous** text with a **red** highlight
  (what was there before / what was removed), then it **fades out**. The document still stays on
  the new version — Nascondi is a peek at "how it was", not a revert.
- **Re-click "Mostra":** re-applies the green flash again. Toggleable, but each click is a
  short-lived flash that fades, not a stuck state.
- **The document always keeps the change when you leave / close the chat.**
- **"↩ Annulla" is REMOVED** — the toggle covers "see what changed" and "see how it was"; there is
  no separate revert affordance in this flow. (Version history still exists via the Versions
  SplitDrawer, Spec 49 — that's the place to truly roll back, not an inline Annulla.)

## Why this also fixes the "Maximum update depth" bug

The current 47d highlight component drives a persistent on/off state via `setState` in a `useEffect`
whose dependency changes every render → an infinite re-render loop ("Maximum update depth exceeded"
on Mostra). Re-modelling the highlight as a **fire-and-forget transient flash** (start animation →
auto-clear after a timeout, no persistent reconciled state feeding back into an effect) removes the
loop by construction.

## Implementation notes

- Reuse `buildWordDiffSegments` (utils) + the `ohw:live-diff-b64` per-document markers (47d). What
  changes is the CLIENT rendering: instead of a persistent highlight bound to a toggle state, render
  a **transient flash**:
  - Mostra → paint green word marks on the additions, start a CSS fade-out (e.g. ~1.5–2.5s via a
    `--ds-duration` token), then clear. No state that an effect reconciles every render.
  - Nascondi → momentarily swap in the previous text with red marks on the removals, fade out, then
    restore the applied (new) text. The applied document content is never actually changed by
    Nascondi — it's a visual peek.
- The flash is driven imperatively (start-on-click + timer-clear), NOT a derived `useEffect` that
  re-subscribes each render. `prefers-reduced-motion` → show the highlight briefly without transform,
  or skip the fade.
- Remove the `Annulla` button + its handler from the ChangeTrace / Step Block for this flow. Keep
  the `applyVersionLive` auto-versioning server-side (so Versions history still has the prior
  version) — only the inline Annulla affordance goes.
- Per-document keying (47d) stays: opening another touched doc and clicking Mostra flashes that
  doc's own diff.

## What to remove / change

- Remove `Annulla` from the inline trace card (`ChangeTrace` / Step Block).
- Replace the persistent `data-cesare-diff` on/off highlight with the transient flash in
  `CesareLiveDiff` (the in-document highlight component from 47d).
- Fix the `Maximum update depth exceeded` loop (it disappears with the transient model).

## Tests (OHW-047e)

- After an edit, the document already shows the new content (applied live).
- Click "Mostra" → green marks appear on additions, then fade away (assert they appear then are
  gone after the fade window); the document content is unchanged (still the new version).
- Click "Nascondi" → red marks / previous text flash, then fade; afterwards the document still holds
  the NEW version (Nascondi did not revert it).
- No "Maximum update depth exceeded" console error during Mostra/Nascondi (regression assert).
- The inline `Annulla` button no longer exists.
- Cross-doc: open another touched doc → Mostra flashes that doc's diff.

## Out of scope

- True rollback — lives in the Versions SplitDrawer (Spec 49), not inline here.
