# Spec 26 — Scalability Patterns

> Status: active · Date: 2026-05-16 · Owner: Valerio

---

## 1. The problem

A feature film has ~110 scenes, 500–1000 shots, 20–40 shooting days. A TV episode has 30–50 scenes, 8–15 days. The current UI was designed and tested against small projects (10–20 scenes). At real-world scale several views become unusable.

| View | Breaks at | Root cause |
|------|-----------|------------|
| Breakdown matrix | ~30 scenes | Flat table — 120 scenes × N categories = thousands of cells rendered at once |
| Outline / Scaletta | ~40 scenes | All cards always expanded, no virtualization |
| Shot planner "All days" | ~10 days | Linear timeline — 30+ days is a wall of content |
| Schedule strip board | ~50 scenes | Flat row-per-scene scroll |
| Budget flat table | Scales fine | Already grouped by category |

---

## 2. Principles (apply everywhere, in this order)

### P1 — Group, never list
Never show a raw list of 100+ items. Always group by a meaningful domain entity:
- Scaletta → Act
- Schedule / Shot plan → Shooting day
- Breakdown → Scene group or shooting day
- Budget → Category (already done)

The user navigates groups, drills into items on demand.

### P2 — Progressive disclosure
Every list must support two densities:
- **Compact** (`density: compact`): number + title only, single row height (~32px)
- **Expanded** (`density: expanded`): full card with metadata

Default to compact for lists > 20 items. The user switches explicitly or the UI detects viewport height.

### P3 — Search and filter are first-class
With 120 scenes, search is mandatory everywhere — not a nice-to-have. Every list view must have:
- Keyboard-accessible search (⌘F or visible input)
- At minimum: filter by title/number
- Ideally: filter by status, location, character

### P4 — Aggregate progress indicators
Instead of showing 120 scene cards, show `Atto I: 32 scene · 8 completate` with a progress bar. Drill-down is on-demand. Aggregates are always visible; raw lists are one click away.

### P5 — Virtualize long lists
Any list that can exceed 50 items must use CSS `content-visibility: auto` at minimum, or a JS virtual scroller (react-virtual) when row heights are variable. This is a rendering performance rule, not a UX rule.

---

## 3. Per-module plan

### 3.1 Breakdown matrix (spec 26a — shipped)
- `content-visibility: auto` on each row → renders only visible rows
- `contain-intrinsic-size` set to approximate row height to preserve scroll position

### 3.2 Shot planner calendar view (spec 26b)
Add a **Calendar Grid** view to the shot planner as the "Tutti i giorni" tab:
- 7-column week grid (Mon–Sun)
- Each day cell shows: day number, location thumbnail (if any), scene count, shot count, duration bar (filled/total)
- Click a day → drill into the existing `ShootingPlanPage` day view
- Empty days shown as muted cells (not hidden — gaps matter in production)
- Current day highlighted with `--ds-action` left border

This replaces the current flat "all days" linear scroll.

### 3.3 Outline / Scaletta (spec 04b — partially done)
- Act collapse/expand already implemented ✓
- Add compact density toggle: icon button in act header switches all cards in that act to single-line mode
- Virtualize if total scene count > 60 (react-virtual)

### 3.4 Schedule strip board
- Already grouped by shooting day ✓
- Add week-level collapse (fold all days in a week into a summary row)
- Add scene count + status progress bar per day header

---

## 4. Design tokens for scale

No new tokens needed. Use existing:
- `--ds-text-faint` for muted/empty cells
- `--ds-surface-alt` for alternating row backgrounds (zebra striping at scale)
- `--ds-line-soft` for separator lines in compact mode
- `--ds-action` for progress fill and active indicators

---

## 5. Out of scope

- Pagination (infinite scroll preferred over page numbers — this is a creative tool, not a data grid)
- Export to Excel (belongs in a future data export spec)
- Real-time collaboration cursors on large lists (handled by Yjs layer, not this spec)

---

## 6. Tests

Each scalability fix must include a unit or E2E test that validates behavior at scale:
- Breakdown matrix: render 100 scenes without timeout
- Shot planner calendar: render 30-day grid, click day, assert navigation
- Outline compact mode: toggle density, assert card height changes
