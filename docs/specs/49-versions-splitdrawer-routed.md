# Spec 49 — Versions in SplitDrawer + everything routed (deep-linkable)

Status: **Planned** · Decided 2026-05-30 · Runs as a dedicated wave AFTER the Spec 47 fleet gate + report.

## Context

Spec 46 introduced the routed `?peek=` SplitDrawer (side-peek). Spec 44 left the
`VersionsDrawer` and the floating `CesareDrawer` as context-based overlays (not
routed). The product owner wants **every auxiliary surface to be routed** so any
state is a shareable/deep-linkable URL, and the Versions experience (list +
Confronta) to live inside the SplitDrawer on every page that has versions.

## Decisions (product owner, 2026-05-30)

1. **Everything routed — including Cesare.** Every SplitDrawer (Versions,
   Confronta, Notifications, future) AND the floating Cesare chat open/close via
   the router so the URL is shareable. Opening/closing is a search-param
   mutation, never pure context state. The floating Cesare stays visually
   floating, but its open state is reflected in the URL (deep-linkable), in
   addition to the central `/sessions/:sessionId` route A5 already shipped.
2. **Versions → SplitDrawer on every page with versions** (soggetto, sinossi,
   scaletta, trattamento, sceneggiatura, breakdown, budget, and any future
   versioned entity). The legacy `VersionsDrawer` overlay is retired as the
   primary surface.
3. **Confronta inside the same SplitDrawer — both modes.** Default "version vs
   current" (click a version → that version + diff against current). Plus a
   2-version side-by-side compare (select any two → old | new with highlighted
   diff) in the same panel. Not a separate overlay.

## Routing model

All surfaces use a routed search param (extends Spec 46 `?peek=`):

- `?peek=<in-app path>` — generic page side-peek (existing).
- `?versions=<entityRef>` (or reuse `?peek=` with a versions target) — opens the
  Versions SplitDrawer for the given entity on the current host page. The host
  page stays mounted and compresses; back/ESC/× clear the param.
- `?compare=<versionA>,<versionB>` (optional, layered on the versions peek) —
  selects two versions for side-by-side; absent → "vs current" mode.
- Cesare open state reflected in the URL (e.g. `?cesare=expanded|full` or the
  `/sessions/:id` route) so the floating chat is deep-linkable.

All params Zod-validated, same-project guarded, fail-closed (ignore + render
host alone). Browser back closes; deep-link opens already-open. `react-aria`
`useDialog`/`useOverlay` for the panel — mandatory, no hand-rolled dismiss.

### SplitDrawer state behaviour (canonical)

- **`open`** — host page stays mounted and **compresses** (left lane
  `min-width:0; flex:1`); the drawer takes the right ~50%. Drag-resize the left
  edge. Never floats.
- **`↗` expand → NAVIGATE to the real page.** Expand does **not** merely widen the
  panel — it performs a real route navigation to the peek target as a normal
  full-screen route (e.g. `…/soggetto?peek=…/screenplay` → navigate to
  `…/screenplay`). You leave the host context; the URL becomes the target page's
  own route (fully shareable/deep-linkable, browser-back returns to the host +
  peek). This is the load-bearing rule for `↗`.
- **`↙` step-back** — from the navigated full page, back to the split-on-host.
- **`×`** — clear the param; host page returns to full width.

## Components

- `SplitDrawer` (existing `packages/ui` primitive) — reused for Versions +
  Compare. One header pattern: title + state controls (`↗` full · `↙` step-back
  · `×`).
- `VersionsSplitDrawer` (new thin consumer) — list of versions (left) + the
  selected version / diff (right area), with a "Confronta" toggle:
  - **vs current** (default): one version vs `documents.currentVersionId`.
  - **side-by-side**: pick 2 → `old | new`, intra-line diff highlighted
    (`--ds-diff-add-* / --ds-diff-remove-* / --ds-diff-intra`).
- `<TargetPagePreview pageRef, traceMarkers, mode="trace"|"version"|"compare">`
  (Spec 44 shared contract) — extend with a `version`/`compare` mode so the same
  embedded render serves Cesare trace, single-version view, and 2-up compare.
- A small routed `useRoutedSurface` hook centralising the open/close → search
  param mutation, so no consumer hand-rolls context-only open/close (DRY: one
  place owns the URL↔surface mapping).

## Per-page wiring

Every versioned page mounts the Versions entry that opens `VersionsSplitDrawer`
via the router. The page compresses (main lane `min-width:0; flex:1`, drawer
lane token width ~50%) — it never floats.

Pages: soggetto, sinossi, scaletta, trattamento, sceneggiatura, breakdown,
budget (+ future). Confirm each page's versioning source before wiring.

## Tests (OHW-049)

- Routed open/close: setting `?versions=` opens the drawer + compresses the host
  (`getBoundingClientRect().width` drops, `>0`); ×/ESC/back restore; deep-link
  opens already-open; malformed/cross-project param → ignored, host alone.
- Confronta: "vs current" shows version+diff; selecting 2 → side-by-side diff
  visible; `?compare=A,B` deep-links the compare.
- Cesare deep-link: a URL with the Cesare-open param restores the chat surface.
- Sad: foreign/cross-project version id → not-found, no leak.
- Per page: each versioned page opens its Versions SplitDrawer via the router.

## Migration order (wave, AFTER Spec 47 gate)

- W1: `useRoutedSurface` + route param schemas (Zod, guards) + make `SplitDrawer`
  consumers routed.
- W2: `VersionsSplitDrawer` (list + vs-current) on one page (soggetto) end-to-end.
- W3: Confronta side-by-side mode.
- W4: roll out to every versioned page.
- W5: route the floating Cesare open state (deep-link).
- Each wave: Design → QA → Lead judge, bounce-backs, then user confirm.
- **Each wave ends with screenshots + video + report to the user.**

## Captured idea — "Scrivi tutto da zero con Cesare" (split drawer via floating icon)

Product idea (PO, 2026-05-30), to define later — NOT in this spec's build scope yet:

Let the user write a whole project from a single spunto with Cesare carrying them
through logline → soggetto → sinossi → scaletta → trattamento → sceneggiatura, each
generated/edited live. This runs in a **Cesare SplitDrawer** promoted from the
floating drawer via an icon (the `↗` "Apri come colonna" affordance A4 already added
is the entry point). Routed/deep-linkable per this spec; tracer always visible per the
CLAUDE.md product invariant. Open question to resolve before building: is this a
guided "write-from-zero" mode (a creation/onboarding flow) or just the same Cesare
chat opened in split — likely both, the split icon first (light, near-done via A4),
the guided mode as its own later spec.

## Out of scope

- Multiple simultaneous peeks (stack) — single surface at a time.
- Reintroducing a floating-only Versions overlay.
