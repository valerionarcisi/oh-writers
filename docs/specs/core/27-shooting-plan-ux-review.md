# Spec 27 — Shooting Plan UX Review & Calendarizzazione Analysis

> Status: review · Date: 2026-05-17 · Owner: Valerio
> This is a design review document. No code changes are prescribed here — each finding that warrants implementation should produce a dedicated spec or be absorbed into spec 26b.

---

## Source material

Files analyzed:

- `apps/web/app/features/shooting-plan/components/ShootingPlanPage.tsx`
- `apps/web/app/features/shooting-plan/components/ParallelPlansEditor.tsx`
- `apps/web/app/features/shooting-plan/components/PlanTrack.tsx`
- `apps/web/app/features/shooting-plan/components/ShotBlock.tsx`
- `apps/web/app/features/shooting-plan/components/ShootingPlanDock.tsx`
- `apps/web/app/features/shooting-plan/server/shooting-plan.server.ts` (first 150 lines)
- `apps/web/app/routes/_app.tsx`
- `docs/specs/core/26-scalability-patterns.md`
- `docs/specs/core/mockups/shotplan-calendar-view.html`

---

## 1. Nav label — is "Inquadrature" correct?

**Verdict: No. "Inquadrature" is wrong and should be changed.**

### What the tool actually does

The shot planner is a **scheduling instrument** — its purpose is to determine how long each scene takes to film and, by implication, how many shooting days the project requires. The per-scene timeline (shot blocks on a ruler) exists to produce time estimates, not to manage shots as creative objects.

A director looking at this tool is answering: "Can I film scenes 12, 18, and 24 in one day?" An AD is asking: "Which scenes are still unplanned and where do they fit?" A producer is asking: "How many shooting days does this project need and what is the budget exposure?"

None of those mental models maps to "Inquadrature."

### Why "Inquadrature" fails

- **Inquadratura** in Italian film terminology specifically means a single camera frame or shot — the atomic unit of cinematography. It is a craft term used when discussing cinematography and shot design, not production scheduling.
- The current h1 inside the page already reads "Piano di ripresa" (line 129, `ShootingPlanPage.tsx`), which confirms the author knows the real name — it just didn't reach the nav label.
- In the section group definition at `_app.tsx` line 94, the label is "Inquadrature" while the icon is `camera` — both reinforce a "shot design" mental model, not a "scheduling" one.
- "Piano" is already taken by the Schedule section (line 93: `{ segment: "schedule", label: "Piano", icon: "clock" }`). This is the right reason to avoid "Piano" as-is — but it does not justify falling back to "Inquadrature."

### How the tool differs from "Piano" (schedule)

| | Schedule (`/schedule`) | Shooting Plan (`/shooting-plan`) |
|---|---|---|
| Unit | Shooting day | Scene / shot |
| Core action | Assign scenes to days | Design shot lists, estimate durations |
| Output | Strip board | Time estimates per scene |
| Primary user | AD, Producer | Director, DP, 1st AD |

The relationship is upstream/downstream: the shooting plan generates per-scene time estimates that the schedule consumes when building the strip board. They are complementary, not the same.

### Recommended label

**"Riprese"** is the best candidate. It is:
- Short (one word, same character count as "Schedule" equivalent in other tools)
- Unambiguous in Italian production vocabulary — "le riprese" means the filming itself, and everything in this tool is about planning the filming
- Distinct from "Piano" (schedule) and "Breakdown"
- Already used in the page's own eyebrow label ("Piano di ripresa", line 129)

Alternative worth considering: **"Piano riprese"** (two words, slightly more specific). Avoid:
- "Pianificazione" — too abstract, sounds like project management software
- "Giornate" — sounds like the day view only
- "Storyboard" — wrong domain entirely (storyboard is visual, shot plan is temporal)

**Change required in `_app.tsx`**: update both `SECTION_LABELS["shooting-plan"]` (line 44) and the item in `SECTION_GROUPS` (line 94) from `"Inquadrature"` to `"Riprese"`.

---

## 2. Information hierarchy — is the current layout right for calendarizzazione?

**Verdict: The current layout is correct for per-scene work but blind to the scheduling goal.**

### What the current layout provides

```
┌─────────────────────────────────────────────────────────────┐
│ View tabs: [Per scena] [Tutti i giorni]                     │
├─────────────────────────────────────────────────────────────┤
│ KPI bar: N scene · M inquadrature · Xh pianificate · …     │
├──────────────┬──────────────────────────────────────────────┤
│ Scene list   │ Script panel │ Parallel plan editor          │
│ (sidebar)    │              │                               │
│ · SC.1       │              │ [Plan A] [Plan B] [+]         │
│ · SC.2 ✓     │              │ ──────────────────────────    │
│ · SC.3       │              │ Ruler: 0h 1h 2h … 8h         │
│ …            │              │ [EWS][MS][CU] … ← shots      │
└──────────────┴──────────────┴────────────────────────────────┘
```

This layout is scene-centric. The user must click a scene to see its plan. It is the correct view for a director working shot-by-shot. It is the wrong view for an AD asking "how many shooting days do I need?"

### What calendarizzazione needs

The scheduling question has a different information shape:

1. **Coverage question**: "Which of my 100 scenes are unplanned?" — requires seeing all scenes at once with their planning status, not one at a time.
2. **Capacity question**: "How full is each shooting day?" — requires grouping scenes by day and showing a fill meter, not individual shot lists.
3. **Aggregate question**: "How many shooting days does this project require, and what is the total time?" — requires project-level totals, not per-scene KPIs.
4. **Imbalance question**: "Which days are overfull or underfull?" — requires a comparative view across all days simultaneously.

None of these are answered by the current layout. The "Tutti i giorni" tab placeholder is where the answer lives — but it currently shows only "Vista 'Tutti i giorni' — prossimamente." (`ShootingPlanPage.tsx` line 173).

### What the KPI bar shows vs what it should show

Current KPI bar (lines 136–168, `ShootingPlanPage.tsx`):
- Scene count — useful
- Total inquadrature — marginally useful at project level
- Total planned minutes — useful but formatted as duration, not as "Xh of Yh total (Z%)"
- Planned scene count — useful but secondary

Missing from the header:
- **Unplanned scene count** — the most urgent status indicator
- **Shooting day count** (actual vs needed) — the core scheduling metric
- **Daily average load** — tells you if the schedule is realistic
- **Completion percentage** — how far along is the planning work

The current header optimizes for "I just added a shot" feedback, not "How is my schedule health?"

### The sidebar's planning state signal is too weak

In `ShootingPlanPage.tsx` lines 184–209, the scene sidebar shows each scene as:

```
SC.1  INT. Location
● 8 shot · 1h 20m         ← planned
○ non pianificata          ← unplanned
```

At 100 scenes, this sidebar becomes a wall of text with no ability to group, filter, or sort. Specifically:

- No grouping by shooting day (the essential calendarizzazione grouping)
- No grouping by location (the second most useful grouping — all INT scenes at the same location cluster naturally)
- No filter (cannot say "show me only unplanned scenes")
- No sort (scenes are in screenplay order only, but for scheduling you might want to sort by estimated duration)
- The planned/unplanned status dot is useful but tiny — hard to scan at 100-scene scale

---

## 3. UX gaps — what's broken or confusing

### 3.1 The dock actions are wrong in the "Tutti i giorni" context

The dock (ShootingPlanDock.tsx) shows the same four actions regardless of which tab is active: Pre-fill da breakdown, Esporta, Stampa, Cesare.

In the calendar view, "Pre-fill da breakdown" has a different meaning (filling all unplanned scenes vs filling the selected scene). "Stampa" presumably prints a day-call-sheet, not the per-scene shot list. But there is no dock state change between tabs — the actions do not adapt.

Furthermore, `onPrefill`, `onExport`, and `onPrint` are all passed as `undefined` from `ShootingPlanPage.tsx` line 262:
```tsx
<ShootingPlanDock
  projectId={projectId}
  suggestedShotCount={0}
/>
```

All three callback props are unconnected. The dock renders action buttons that do nothing.

### 3.2 "Parallel plans" / scenarios — the concept is opaque to first-time users

The concept of multiple named scenarios ("Piano A", "Piano B") is powerful for directors who want to compare two coverage approaches. But:

- The name "Piano A" / "Piano B" is auto-assigned (`String.fromCharCode(65 + plan.scenarios.length)` in `ParallelPlansEditor.tsx` line 327) with no explanation of what "piani candidati" means.
- The CesarePlanBanner (visible when `plan.scenarios.length >= 2`) presumably helps, but a first-time user with zero scenarios sees none of it.
- The concept of "attivo" vs "nascosto" is introduced only after a user has more than one scenario — there is no onboarding at the single-scenario state.
- The `activeHiddenBanner` (lines 335–349) warns that the active plan is hidden, but only after the user has already hidden it by accident.

A first-time director landing on this page with a fresh scene sees: an empty sidebar item, a skeleton loader, and then a single "Piano A" track with no shots. There is no guidance on what to do next — the QuickAddToolbar is visible but not explained.

### 3.3 The tab order is backwards for the primary user goal

Current tab order: `[Per scena] [Tutti i giorni]`

For calendarizzazione, "Tutti i giorni" is the overview — it is where the user should land first to understand project scheduling health. "Per scena" is the drill-down — where you go to design a specific scene's shots.

The mockup at `shotplan-calendar-view.html` (line 675) already reverses this: `[Giorno 4] [Tutti i giorni] [Per scena]`, where "Tutti i giorni" is the active default. The implementation has this backwards.

### 3.4 Scene sidebar has no indication of scheduling day assignment

The sidebar shows planned scenes (with shot count and duration) but gives no indication of which shooting day each scene belongs to. A scene can be "pianificata" (has shots, has time estimate) without being assigned to a shooting day. The planning state has two distinct stages:

1. **Shot-listed**: scene has a shot plan with estimated duration
2. **Scheduled**: scene is assigned to a specific shooting day in the strip board

The current sidebar conflates these: `isPlanned` (line 186) only checks `totalMinutes !== null && shotCount > 0`, which means "has shots" — but that scene might still not be scheduled into any day. A scene can have shots and still not appear on the strip board.

This is a missing state: `● pianificata` vs `◑ pianificata, non schedulata` vs `○ non pianificata`.

### 3.5 The KPI bar title changes on scene selection — confusing

When a scene is selected, the h1 changes from "Inquadrature" (line 133) to `SC.X · INT. Location`. This turns the page-level KPI header into a per-scene breadcrumb. The KPI chips (scene count, shot count, total minutes) remain project-level, creating a mixed signal: the title says "we're looking at SC.12" but the metrics say "here is the whole project."

This context switch is disorienting. The selected scene should be indicated differently — either in a sub-header within the main column, or as a breadcrumb trail — not by replacing the page title.

### 3.6 The 8-hour ruler is not configurable and shows no danger zone

`ParallelPlansEditor.tsx` defines `RULER_HOURS = [0, 1, 2, 3, 4, 5, 6, 7, 8]` (line 45) as a fixed constant. A feature film can have 10–14 hour shooting days; a commercial might have 6. The ruler hardcodes 8 hours as the day budget.

`PlanTrack.tsx` does compute `overflowMinutes` (line 69) and shows a badge — that's the right idea — but the ruler itself gives no visual warning zone. There is no visual distinction between "safe" hours (e.g. 0–6h) and "red zone" hours (e.g. 7–8h) in the track.

Additionally, `SHOOTING_DAY_MINUTES` is a domain constant (imported from `@oh-writers/domain`) — it should be derivable from project settings, not hardcoded. The server already has per-project effort weights (`resolveWeights` in `shooting-plan.server.ts` lines 98–111), so per-project day length is architecturally supported; it just isn't exposed to the UI ruler.

### 3.7 The script panel column is always rendered but often useless

In the selected-scene view (`ShootingPlanPage.tsx` lines 214–249), the ScriptPanel column is rendered between the scene sidebar and the shot plan. This column takes up significant horizontal space.

For most users doing calendarizzazione (estimating how long scenes take), the script text is reference material — useful occasionally, not continuously. It should be collapsible or hidden by default, revealing itself on demand. The current `storageKey` prop suggests collapsibility was considered, but the column's width is always reserved.

---

## 4. Concrete improvements ranked by impact

### Improvement 1 — Rename nav label from "Inquadrature" to "Riprese"

**Problem**: The label misdescribes the tool as a shot-design catalog. The real purpose is production scheduling.

**Fix**: Change `SECTION_LABELS["shooting-plan"]` and the `SECTION_GROUPS` item in `_app.tsx` from `"Inquadrature"` to `"Riprese"`. Update the page eyebrow label in `ShootingPlanPage.tsx` (line 129) to be consistent.

**Effort**: S — two string changes in two files, no logic change.

**Server function required**: No.

---

### Improvement 2 — Make "Tutti i giorni" the default tab and implement it

**Problem**: The calendar view is the calendarizzazione entry point. It is currently a placeholder, and even when it is implemented (spec 26b), the tab order puts it second, forcing users to click away from the wrong default.

**Fix**:
- Change the default `activeTab` state in `ShootingPlanPage.tsx` (line 41) from `"per-scena"` to `"tutti-i-giorni"`.
- Implement the calendar view per spec 26b, using the mockup at `docs/specs/core/mockups/shotplan-calendar-view.html` as the design reference.
- Keep "Per scena" as the second tab — it is the drill-down, not the overview.

**Effort**: M for tab order (S if just the default), L for the full calendar implementation.

**Server function required**: Yes — a new `getShootingPlanCalendar(projectId)` server function that returns days with scene assignments, per-day shot count, per-day duration, and fill percentage. The data model already has enough to compute this from existing `shots`, `shotPlanScenarios`, and `scenes` tables.

---

### Improvement 3 — Strengthen the KPI bar for scheduling health

**Problem**: The current KPI bar reports raw counts (N scene, M inquadrature) with no scheduling context. A user cannot tell how healthy the plan is without counting manually.

**Fix**: Replace or extend the KPI chips with:
- **Scene coperte**: `X / Y scene` with a mini progress bar (X = scenes with shot estimates, Y = total scenes)
- **Giorni necessari**: derived from `ceil(totalPlannedMinutes / SHOOTING_DAY_MINUTES)` — tells the user how many days their current plan requires
- **Media per giornata**: `totalPlannedMinutes / plannedDays` — tells them if the load is realistic
- Remove the raw "inquadrature" chip from project-level header — it belongs in the per-scene view, not the overview

No change to the structure: still a flex row of chips. Just different data.

**Effort**: S — pure UI change, the computed values come from existing `SceneWithPlanSummary` data already fetched at line 37.

**Server function required**: No — computed client-side from existing data.

---

### Improvement 4 — Add filter and grouping to the scene sidebar

**Problem**: At 100 scenes, the sidebar is an unsorted, unfiltered wall. The user cannot find unplanned scenes quickly.

**Fix**:
- Add a filter toggle at the top of the sidebar: `[Tutte] [Non pianificate]` — one click to see only scenes needing work
- Add a sort option: screenplay order (default) vs. estimated duration (longest first, for scheduling heavy days first)
- Optionally: group by location when switching to a "per location" sort mode (scenes at the same location are often shot on the same day)

**Effort**: M — UI change only. Filter and sort are client-side operations on the already-fetched `scenes` array (line 43 in `ShootingPlanPage.tsx`).

**Server function required**: No — all filtering happens client-side.

---

### Improvement 5 — Connect the dock actions

**Problem**: `ShootingPlanDock` renders three action buttons (`Pre-fill`, `Esporta`, `Stampa`) that have `undefined` callbacks — they do nothing when clicked.

**Fix**:
- Connect `onPrefill` to the existing `applyPattern` / `getOrCreateInitialPlan` flow for the current scene, or to a new "batch prefill all unplanned scenes" server function.
- Connect `onExport` to a scene-by-scene PDF or CSV export (new server function required).
- Connect `onPrint` to `window.print()` with a print-specific CSS stylesheet, or to a generated PDF.
- The dock label changes per active tab: "Piano" in per-scena view, "Calendario" in tutti-i-giorni view.

**Effort**: M per action. `onPrint` is S (window.print). `onPrefill` is M (exists logically, needs wiring). `onExport` is L (new server function + format decision).

**Server function required**: Yes for export. No for print.

---

### Improvement 6 — Add a visual danger zone to the 8-hour ruler

**Problem**: The ruler is a flat 0–8h bar with tick marks. There is no visual signal that 7h+ is dangerous. The overflow badge on each track ("`+30m oltre giornata`") only appears after overflow — it does not warn proactively.

**Fix**:
- Color the ruler's rightmost 25% (6–8h) in `--ds-warning` (amber) as a background gradient
- At 7.5h+, switch the fill to `--color-error`
- Make `SHOOTING_DAY_MINUTES` a project-level setting (already architecturally supported via `resolveWeights`) and expose it in a project settings panel

**Effort**: S for the CSS danger zone. M for making the day length configurable from settings.

**Server function required**: No for CSS. Yes for configurable day length (extend the schedule settings endpoint).

---

### Improvement 7 — Fix the header title context switch

**Problem**: Selecting a scene replaces the page h1 (line 133 in `ShootingPlanPage.tsx`) with the scene heading. This mixes page-level and entity-level information.

**Fix**:
- Keep the page h1 as "Piano di ripresa" (or the updated label) at all times.
- Show the selected scene as a sub-heading or inline label inside the `main` column, above the `BlockingCard` and `ParallelPlansEditor`. This is where the scene context belongs — not in the page header.
- The KPI bar chips remain project-level at all times.

**Effort**: S — move the scene heading from the header into the main content area.

**Server function required**: No.

---

### Improvement 8 — Add a "third planning state" indicator to sidebar scenes

**Problem**: A scene can have shots (planned) but not be assigned to a shooting day in the strip board. The current binary `● pianificata / ○ non pianificata` misses this intermediate state.

**Fix**:
- Add a third status: `◑ stimata, non schedulata` — the scene has a shot-plan time estimate but has not been assigned to a shooting day in the schedule.
- This requires the sidebar to cross-reference the schedule data. A new server function `getScenesSchedulingStatus(projectId)` would return a map of sceneId → `"unplanned" | "estimated" | "scheduled"`.
- The sidebar renders a three-state indicator per scene.

**Effort**: L — requires a new server function and a schema join (scenes + shotPlans + scheduleSceneAssignments).

**Server function required**: Yes.

---

## 5. Summary ranking

| # | Improvement | Impact | Effort | Server fn? |
|---|---|---|---|---|
| 1 | Rename nav label to "Riprese" | High | S | No |
| 2 | Make "Tutti i giorni" the default tab | High | S–L | Yes (calendar data) |
| 3 | Rework KPI bar for scheduling health | High | S | No |
| 5 | Connect dock actions | Medium–High | M–L | Yes (export) |
| 4 | Add filter + sort to scene sidebar | Medium | M | No |
| 7 | Fix header title context switch | Medium | S | No |
| 6 | Danger zone on ruler | Medium | S–M | No |
| 8 | Three-state planning indicator | Low–Medium | L | Yes |

Items 1, 3, and 7 are trivial S-effort changes with disproportionately high UX return. They should ship before spec 26b (calendar implementation). Item 2 (calendar implementation) is the long-term fix for calendarizzazione — it should not be built before items 1, 3, 7 are done, since those clarify what the tool is before adding new surface area.

---

## 6. Spec 26 section 3.2 — proposed update

The following replaces section 3.2 in `docs/specs/core/26-scalability-patterns.md`:

---

### 3.2 Shot planner calendar view (spec 26b) — updated

**Context**: The shot planner serves two distinct user goals:

- **Shot design** (director / DP): design a coverage pattern for each scene, estimate shot durations. Tool: "Per scena" tab.
- **Calendarizzazione** (AD / producer): determine how many shooting days the project requires, how full each day is, which scenes are unplanned. Tool: "Tutti i giorni" tab.

The current implementation serves shot design adequately. Calendarizzazione support is missing.

**Preconditions before calendar implementation**:
- Rename nav label from "Inquadrature" to "Riprese" (`_app.tsx` lines 44 and 94).
- Fix the page h1 context switch (remove scene heading from page header, move to main content column).
- Rework the KPI bar to show scheduling health metrics: coverage ratio (scenes estimated / total), derived day count, average load per day.
- Make "Tutti i giorni" the default active tab.

**Calendar Grid view**:
- Default view when entering the section (activeTab default: `"tutti-i-giorni"`).
- Layout: week sidebar (left, 200px) + 7-column week grid (right), per the mockup at `docs/specs/core/mockups/shotplan-calendar-view.html`.
- Week sidebar lists shooting weeks with per-week stats (days, scenes, shots, hours/capacity). Scrolls independently. Active week highlighted on scroll via IntersectionObserver.
- Each day cell contains: shooting day number badge, primary location (truncated), scene count pill, shot count pill, duration bar (planned / day capacity).
- Day capacity defaults to 8h (`SHOOTING_DAY_MINUTES`). Must be overridable per project via schedule settings — the domain layer already supports per-project effort weights, this extends that pattern.
- Cells above capacity (>90% fill) show an amber warning dot (`.day-warning`). Cells at 100%+ fill change the duration bar to `--color-error`.
- Empty days (no scenes assigned) show as dashed muted cells — they are visible, not hidden. Gaps matter in production scheduling.
- Weekend cells are visually differentiated but not hidden.
- Click a day cell → navigate to a day-scoped view (route: `/projects/:id/shooting-plan/day/:dayNumber`) showing that day's scenes and their shot plans. This route does not exist yet and must be specced separately.

**Server function required**: `getShootingPlanCalendar(projectId)` — returns:
```typescript
interface ShootingPlanCalendarDay {
  shootingDayNumber: number;
  calendarDate: string | null;      // ISO date, null if unscheduled
  sceneIds: string[];
  sceneCount: number;
  shotCount: number;
  plannedMinutes: number;
  capacityMinutes: number;          // from project settings, default 480
  primaryLocation: string | null;   // most common location for that day
  isFull: boolean;                  // plannedMinutes >= capacityMinutes
  isOverCapacity: boolean;          // plannedMinutes > capacityMinutes
}

interface ShootingPlanCalendar {
  weeks: Array<{
    weekNumber: number;
    dateRange: { start: string; end: string } | null;
    shootingDays: ShootingPlanCalendarDay[];
    totalScenes: number;
    totalShots: number;
    totalPlannedMinutes: number;
    totalCapacityMinutes: number;
  }>;
  unscheduledSceneCount: number;    // scenes with shots but no day assignment
  unplannedSceneCount: number;      // scenes with no shots at all
  totalShootingDays: number;
  derivedDaysNeeded: number;        // ceil(totalPlannedMinutes / capacityMinutes)
}
```

**Scalability**: The calendar view is inherently grouped by week — it implements Principle P1 (Group, never list) from spec 26 section 2. 30 shooting days = 6 week groups, each with up to 5 day cells. This does not require virtualization. The week sidebar is the navigation mechanism at scale (P4: aggregate progress indicators).

**Tests**:
- Unit test `getShootingPlanCalendar` with 30 days across 6 weeks: assert week grouping, scene counts, capacity calculation.
- Playwright `[OHW-026b-01]`: Navigate to shooting plan section, assert "Tutti i giorni" tab is active by default, assert week grid renders.
- Playwright `[OHW-026b-02]`: Click a day cell with scenes, assert navigation to day view.
- Playwright `[OHW-026b-03]`: Day at 100% capacity shows warning dot, duration bar in error color.
