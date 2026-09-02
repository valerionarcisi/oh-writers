# Spec 86 — Versions split-view compare

Status: **Planned**. Refines ADR-0004 (does not reopen it). Owner: Valerio.

## Context

Ask: while writing, see the CURRENT document (screenplay/narrative, live and
editable) in one half of the screen and a PREVIOUS version (read-only) in the
other half, at the same time.

This is closer to already-shipped than new: opening **Versions** (Spec 66 /
ADR-0004) already renders the main editor compressed-but-live in the main track
while the `SplitDrawer` lane shows a version's read-only, formatted content —
master→detail, one click away, no restore required to just look. ADR-0004
explicitly reserved this exact case: _"If a genuine 'compare two' need
resurfaces it returns as a deliberate, separate affordance — not the default."_
This spec is that resurfacing, scoped to reusing the existing surface rather
than building a parallel one.

## Decision

**No new SplitDrawer payload kind, no new route, no diff.** The Versions
master→detail surface (`VersionsSplitDrawer`, `features/versions`) IS the
split-view: clicking a version already opens it read-only beside the live main
editor, and "Indietro" returns to the list without forcing "Attiva" (restore).
This spec's work is closing the gap between "technically possible" and "usable
for side-by-side reading while writing":

1. **Verify the main editor stays interactive** (scroll + type) while a version
   detail is open in the lane — today's compression (ADR-0002) implies this but
   it is unverified for this specific use case. If typing is blocked or the
   main column becomes too narrow to read comfortably, fix that — do not build
   a second surface.
2. **No pressure to Attiva.** Confirm the detail view reads as "reference", not
   "you must restore or discard" — `Attiva`/`Indietro` stay available but
   neither is forced (already true in the current UI; this is a verification
   item, not new code, unless testing finds otherwise).
3. **Explicitly out of scope** (ADR-0003 + ADR-0004 still hold): no word-level
   diff, no highlighting, no second "Compare" entry point separate from
   Versions, the old version stays read-only (never editable).

If live-measurement (per `docs/conventions/ui-ux-research.md`) finds the main
column too narrow to write comfortably next to an open version detail, widen
the `SplitDrawer` lane's default width for the `versions` payload kind only —
a CSS/layout change in `features/app-shell`, not a new feature.

## Domain & files

- `apps/web/app/features/versions/components/VersionsSplitDrawer.tsx` — no
  structural change expected; verification target.
- `apps/web/app/features/app-shell/split-drawer-context.tsx` +
  `use-unified-split-navigation.ts` — lane width, only if step 1 above finds a
  real gap.

## Tests (OHW-085)

- `tests/versions-split-view-compare.spec.ts`
  - open a screenplay/narrative doc with ≥2 versions → open Versions → click an
    old version → main editor is still visible, scrolled, and **accepts
    keystrokes** (types into the live doc without closing the drawer).
  - the old version's pane renders read-only formatted content (no input
    accepts text there).
  - **Indietro** returns to the list without mutating anything (no Attiva
    fired).
  - regression: no diff/highlight markup renders anywhere in either pane.
- Live measure + screenshot (both panes, both document kinds) before closing
  the spec, per `docs/conventions/ui-ux-research.md`.

## Definition of Done

E2E green · live screenshot of the two-pane layout for both narrative and
screenplay · `docs/BACKLOG.md` updated · this spec updated if implementation
reveals the lane needs a real width/layout change.
