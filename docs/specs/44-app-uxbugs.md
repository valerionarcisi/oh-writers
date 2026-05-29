# Spec 44 — App UX bug log

Findings from WP-LEAD-WATCHER's live walk-through of `localhost:3000`
against `refactor/ux-notion-v3` (commit on branch
`refactor/ux-notion-v3-lead-watcher`, seed user
`test@ohwriters.dev`).

Severity scale:

- **blocker** — page is unusable or core Notion-style contract broken.
- **major** — clear regression, defeats a Spec 44 goal, but page still
  functions.
- **minor** — visible polish issue, no functional impact.
- **cosmetic** — colour / spacing / truncation; the screen still reads.

This file is a *log*, not a fix list. The conductor decides which tickets
become respawn briefs.

---

## TKT-LEAD-01 · all production pages · blocker

**What happens**: Almost every project page renders TWO bottom-right
command surfaces simultaneously:

| Page              | Legacy pill text                          | Spec 44 BottomDock |
| ----------------- | ----------------------------------------- | ------------------ |
| Breakdown         | `Ri-spogliare co...` (truncated)          | Yes                |
| Sceneggiatura     | `Esporta PDF`                             | Yes                |
| Soggetto          | `Esporta DO...` (truncated)               | Yes                |
| Budget            | `Rig...` (Rigenera, truncated)            | Yes                |
| Locations         | `LOCATION 0/2 Sincron...` (truncated)     | Yes                |
| Schedule          | `PIANO DI RIPRESA · Rigenera · E...`      | Yes                |
| Inquadrature      | `PIANO · Genera piano · Pre-fill · ...`   | Yes                |

The Spec 44 BottomDock is bottom-right with bell · avatar · gear ·
✦ Cesare; the legacy `FloatingDock` (or each page's own action pill)
floats slightly left of it. The two compete for the user's eye and the
truncated labels look broken on first paint.

**Expected (mockup + Notion)**: One and only one bottom-right command
surface per spec. TKT-01 was raised exactly for the Breakdown case; it
was marked closed by `[OHW-044-E]` but the regression is much wider:
every per-page action pill is still mounted.

**Suggested fix**: Move the per-page primary actions either (a) into the
Top Strip on the right, or (b) into a header overflow menu on the
relevant feature (RecapStrip's `•••`, ScheduleHeader, etc.). The
BottomDock owns the bottom-right corner globally. WP-C is the natural
owner for each page; WP-DESIGN should approve the new placement.

**Screenshots**:

- `mockups/notion-reference/ohw-bug-breakdown-double-dock.png`
- `mockups/notion-reference/ohw-bug-budget-double-dock.png`
- `mockups/notion-reference/ohw-bug-locations-double-dock.png`
- `mockups/notion-reference/ohw-bug-schedule-double-dock.png`
- `mockups/notion-reference/ohw-bug-inquadrature-multi-dock.png`

---

## TKT-LEAD-02 · Cesare drawer header · major

**What happens**: When the Cesare drawer is `expanded` or `full`, the
header reads:

`✦ Cesare · Sessione ▼ · SCENEGGIATURA · SC.1 · ↗ ↙ − ×`

The **bell, avatar, gear icons** that Spec 44's drawer-header diagram
explicitly lists (`🔔 V ⚙` between the context chip and the
drawer-state controls) are **not mounted in the Cesare drawer**. They
remain in the BottomDock — which is hidden when Cesare is open — so when
Cesare is open the user has *no* affordance for notifications, profile
menu, or settings.

**Expected (mockup + Notion)**: The spec is explicit (§Cesare Panel /
§Drawer header): "Window-control icons rightmost: bell, avatar, gear
(carried from Dock when state ≠ closed), then drawer-state controls
(`↗ ↙ − ×`)." This is also the spec's stated reason the BottomDock can
be safely hidden when Cesare is open.

**Suggested fix**: WP-B / WP-DESIGN — extend the `CesareDrawer` header
slot to embed bell, avatar, gear before the window controls when state
≠ closed. The bell click should open the same notification SplitDrawer
as the dock bell; the avatar button should open the same account
popover; the gear should route to settings.

**Screenshots**:

- `mockups/notion-reference/ohw-cesare-expanded.png`
- `mockups/notion-reference/ohw-cesare-full.png`

---

## TKT-LEAD-03 · soggetto editor column · blocker

**What happens**: The Soggetto page renders the prose column **one
character/syllable per line** (`Mila ↩ no, ↩ fine ↩ anni ↩ Nova ↩ nta.`).
The text is unreadable. This appears to be a `word-break` / `width` bug
on the editor column when the margin-notes column is mounted alongside.

**Expected (mockup + Notion)**: The Soggetto / Sinossi / Trattamento
pages should render their prose at full reading width (Spec 44 Pages
mitigation: "margin notes column to the right of the page" — the page
column should remain `min(720, 80%)` wide). The margin column should
adapt to the remaining space, not steal width from the page.

**Suggested fix**: WP-C — investigate `apps/web/app/features/documents/...`
column CSS, specifically the grid template for the document + margin
combo. Likely a missing `min-width: 0` on the prose column inside a flex
parent, causing the column to collapse to its content's longest unbroken
token.

**Screenshot**: `mockups/notion-reference/ohw-bug-soggetto-text-wrap.png`

---

## TKT-LEAD-04 · soggetto tab row · major

**What happens**: The Document Type tabs at the top of the Soggetto /
Sinossi pages render the active tab name **twice** — once in its
position in the tab row and again after `TRATTAMENTO`. Observed on
Sinossi: `SOGGETTO · SINOSSI · SCALETTA · TRATTAMENTO · SINOSSI · VI…`.
The trailing duplicate is likely a versioning / breadcrumb leak.

**Expected (mockup + Notion)**: Each tab name appears exactly once in
the tab row. The Spec 44 Top Strip second-row legend is for Sceneggiatura
only.

**Suggested fix**: WP-C / WP-A — the duplicate is either (a) the tab
component repeating the active tab name as a label, or (b) the
TopStrip's `elementLegend` slot accidentally rendering on document
pages. Audit the TopBar's per-view slot wiring.

**Screenshot**: `mockups/notion-reference/ohw-bug-sinossi-duplicate-tab.png`

---

## TKT-LEAD-05 · sceneggiatura element legend missing · major

**What happens**: The Sceneggiatura page does NOT render the Element
Legend row (`SCENE · ACTION · CHARACTER · DIALOGUE · PAREN ·
TRANSITION`). The Top Strip only shows: `Indice 1/9 ▾ · ○ BIANCO (1ª
STESA) 2026-05-29 · VERSI…`.

**Expected (mockup + Notion)**: Spec 44 glossary "Element Legend —
second row of the Top Strip, only on Sceneggiatura. Hosts SCENE ·
ACTION · CHARACTER · DIALOGUE · PAREN · TRANSITION legend + Indice +
Focus + Esporta."

**Suggested fix**: WP-A / WP-C — verify the TopBar `elementLegend` slot
is being supplied by ScreenplayPage. The "Esporta PDF" pill in the
bottom-right legacy dock suggests the legend's actions were misplaced
into the bottom; they should live in the legend row instead.

**Screenshot**: `mockups/notion-reference/ohw-bug-screenplay-no-legend.png`

---

## TKT-LEAD-06 · dashboard project filter tabs stack vertically · major

**What happens**: On the `/dashboard` view, the project filter tabs
(`TUTTI 2 / PERSONALI 1 / CONDIVISI 1 / ARCHIVIATI 0`) render in a
**vertical column** on the left side, with the project list pushed to
the right. The "TUTTI I PROGETTI" heading wedges between the tab column
and the project cards.

**Expected (mockup + Notion)**: Filter chips render as a horizontal
row above the project list. The current layout looks like a flex-row
that collapsed to a column due to width constraints, but viewport is
756px wide — well above mobile thresholds. The dashboard layout did
not get the Spec 44 polish pass that the project home got.

**Suggested fix**: WP-C / WP-DESIGN — fix the dashboard's filter row to
use a horizontal flex layout with wrap; the project cards grid should
fill the remainder. This is a dashboard-only regression — the project
home (`/projects/<id>`) renders correctly.

**Screenshot**: `mockups/notion-reference/ohw-bug-dashboard-tabs-stacked.png`

---

## TKT-LEAD-07 · LeftRail project label is `…` on all pages · minor

**What happens**: The LeftRail's project name label below the workspace
header is rendered as `…` (an ellipsis) instead of the actual project
name (e.g. "Team Thriller"). The dropdown chevron is present, but the
button label is empty.

**Expected (mockup + Notion)**: The project name should appear; if the
viewport truncates, it should truncate at the end of the readable name
(`Team Thrill…`) not collapse to a single ellipsis.

**Suggested fix**: WP-A — verify the LeftRail's project-picker button
binds to the active project's title rather than a default placeholder.
Likely a `??` operator misuse where `currentProject?.title ?? '…'` is
falling through.

**Screenshot**: visible in every screenshot — most clearly in
`ohw-project-home.png`.

---

## TKT-LEAD-08 · top strip breadcrumb is truncated · cosmetic

**What happens**: The top strip breadcrumb shows the page title with
the first letter cut off (`anorámica` for Panoramica, `noramica` for
Panoramica on other pages, `inossi`, `udget`, etc.). This is a clipping
bug — the page title text gets clipped by the rail-collapse chevron's
hit-area.

**Expected (mockup + Notion)**: The breadcrumb should clear the
chevron's bounding box and render the full title.

**Suggested fix**: WP-A / WP-DESIGN — pad the breadcrumb's left edge
to match the chevron's bounding box, or move the chevron off the
breadcrumb baseline. Easy CSS fix.

**Screenshot**: every page screenshot.

---

## TKT-LEAD-09 · italian URL slugs return 404 · cosmetic

**What happens**: Direct navigation to `/sinossi`, `/sceneggiatura`,
`/calendario` returns "Not Found". The rail buttons navigate correctly
to the English slugs `/synopsis`, `/screenplay`, `/schedule`, so the
user sees correct content when using the rail.

**Expected (mockup + Notion)**: Either the Italian slugs work as
aliases (preferred — UI is Italian, the URLs should not require
English knowledge), OR the rail uses the Italian slugs natively.

**Suggested fix**: Out of Spec 44 scope — this is an i18n consistency
issue. Recommend opening a follow-up spec for URL aliasing.

**Screenshot**: `ohw-bug-sinossi-duplicate-tab.png` (after the fallback
navigation).

---

## TKT-LEAD-10 · locations toolbar overlaps map · minor

**What happens**: On the Locations page, the map's overlay icons
(layer toggle, add-pin, etc.) render on top of the map's "Cerca un
luogo…" search bar. The search input is partially hidden behind these
overlays.

**Expected (mockup + Notion)**: Map overlays should sit below the
search bar or on the opposite corner; the search bar should always
be unobstructed.

**Suggested fix**: WP-C — z-index / placement of the map overlay
toolbar (Leaflet's overlay group) needs to respect the search bar
position.

**Screenshot**: `mockups/notion-reference/ohw-bug-locations-double-dock.png`

---

## Top 5 priorities (recommended for the conductor)

1. **TKT-LEAD-01** (blocker) — fix the universal double-dock first;
   every page is visibly broken.
2. **TKT-LEAD-03** (blocker) — Soggetto column is unreadable; this is
   the main writing surface.
3. **TKT-LEAD-02** (major) — Cesare drawer is missing bell/avatar/gear;
   spec contract violated.
4. **TKT-LEAD-05** (major) — Sceneggiatura missing Element Legend;
   Spec 44 deliverable missing.
5. **TKT-LEAD-04** (major) — duplicate tab name on Sinossi looks
   buggy on every doc page.

---

## Counts by severity

| Severity   | Count |
| ---------- | ----- |
| blocker    | 2     |
| major      | 4     |
| minor      | 2     |
| cosmetic   | 2     |
| **total**  | 10    |
