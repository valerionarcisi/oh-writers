# Spec 22 — Piano di Ripresa (Shot Planning)

> **Status:** draft
> **Date:** 2026-05-12
> **Depends on:** Spec 12c (scene effort + schedule), Spec 10 (breakdown)

---

## Problem

The schedule currently assigns a single `estimated_hours` value per scene — either auto-calculated from page count or set manually as a scalar override. This is a weak proxy: a 1-page car chase takes a full day; a 4-page dialogue in one room shoots in two hours. More importantly, the schedule gives the director and DoP no space to plan _how_ they will shoot each scene — which angles, which camera movements, how many setups — and this planning directly determines how long the day takes.

---

## Overview

A new dedicated section **"Piano di Ripresa"** (sidebar, between Breakdown and Schedule) where the director and DoP:

1. Work day by day — select a shooting day and see all its scenes balanced on a timeline (compare C)
2. Drill into a scene — build its shot list as draggable blocks on a real-time axis (compare B)
3. Define multiple coverage scenarios per scene (Plan A = full coverage, Plan B = minimal) and switch the active one
4. See transition slots between shots — automatic gaps inferred from shot-to-shot differences, fully editable

The **total minutes** of the active scenario (shots + transitions) syncs silently to `strips.estimated_hours`, replacing the single manual override.

---

## Navigation Structure

```
Sidebar: Piano di Ripresa
  └── Day picker (GG 1, GG 2, ...) with hours used / 8h capacity
        └── Day view (compare C): horizontal bar per scene showing total time
              └── Click scene → Scene timeline (compare B)
                    └── Plan A / Plan B / + scenario tabs
                          └── Shot blocks + transition slots (drag & drop)
```

Shot plans are linked to `scene_id` and can be created before a schedule exists. The **day navigation** (day picker, compare C) requires a schedule — if no schedule is present the page shows an empty state with a link to generate one. Scene shot lists can be built at any time.

---

## Data Model

### New tables

#### `shot_plans`

One per scene. Exists independently of the schedule so shot planning can begin before scheduling is finalized.

```typescript
export const ShotPlanSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  sceneId: z.string().uuid(),
  activeScenarioId: z.string().uuid().nullable(), // null = no active plan yet
});
```

#### `shot_plan_scenarios`

Plan A, Plan B, etc. A scene can have multiple scenarios; only the active one feeds the schedule.

```typescript
export const ShotPlanScenarioSchema = z.object({
  id: z.string().uuid(),
  shotPlanId: z.string().uuid(),
  name: z.string().min(1).max(50), // "Piano A", "Piano B"
  position: z.number().int(), // tab order
});
```

#### `shots`

Individual shots within a scenario. `estimatedMinutes: null` means auto-resolved from the effort weights lookup.

```typescript
export const ShotSizeSchema = z.enum([
  "EWS",
  "WS",
  "MS",
  "MCU",
  "CU",
  "ECU",
  "INSERT",
  "OTS",
  "TWO_SHOT",
  "POV",
]);

export const CameraMovementSchema = z.enum([
  "STATIC",
  "PAN",
  "TILT",
  "DOLLY",
  "HANDHELD",
  "STEADICAM",
  "CRANE",
  "DRONE",
  "ZOOM",
]);

export const CameraLabelSchema = z.enum(["A", "B", "C", "D"]);

export const ShotSchema = z.object({
  id: z.string().uuid(),
  scenarioId: z.string().uuid(),
  position: z.number().int(),
  shotSize: ShotSizeSchema,
  cameraMovement: CameraMovementSchema,
  estimatedMinutes: z.number().min(1).max(480).nullable(), // null = auto
  notes: z.string().nullable(),
  cameraLabel: CameraLabelSchema.default("A"),
});
```

#### `transition_slots`

Gaps between consecutive shots. `afterShotId` points to the shot that precedes the gap. `isManual: true` protects the slot from being overwritten by auto-inference.

```typescript
export const TransitionTypeSchema = z.enum([
  "SETUP_CHANGE", // rig/position change inferred from shot diff
  "MAKEUP_COSTUME", // inferred from breakdown elements on next shot's actors
  "BREAK", // manually added (lunch, regulatory, etc.)
  "TRAVEL", // between locations on same day (future)
]);

export const TransitionSlotSchema = z.object({
  id: z.string().uuid(),
  scenarioId: z.string().uuid(),
  afterShotId: z.string().uuid(),
  type: TransitionTypeSchema,
  estimatedMinutes: z.number().min(1).max(240).nullable(), // null = auto from weights
  ruleId: z.string().nullable(), // which rule generated it (null for manual)
  isManual: z.boolean().default(false),
  label: z.string().nullable(), // auto-generated or user-set description
});
```

### Effort weights — JSON column on `schedules`

```typescript
export const ShotEffortWeightsSchema = z.object({
  // Shot setup times (minutes) by size + movement key e.g. "WS_STATIC"
  WS_STATIC: z.number().default(45),
  WS_DOLLY: z.number().default(90),
  WS_CRANE: z.number().default(120),
  MS_STATIC: z.number().default(25),
  MCU_STATIC: z.number().default(20),
  CU_STATIC: z.number().default(20),
  ECU_STATIC: z.number().default(15),
  OTS_STATIC: z.number().default(20),
  INSERT_STATIC: z.number().default(15),
  HANDHELD_ANY: z.number().default(15), // overrides movement-specific for handheld
  STEADICAM_ANY: z.number().default(30),
  CRANE_ANY: z.number().default(120),
  DRONE_ANY: z.number().default(90),
  // Transition times (minutes)
  transition_rig_change: z.number().default(20),
  transition_shot_size_jump: z.number().default(15),
  transition_makeup: z.number().default(30),
  transition_costume: z.number().default(20),
});

export type ShotEffortWeights = z.infer<typeof ShotEffortWeightsSchema>;
```

Default values are hardcoded in `packages/domain/src/schedule/effort-weights.ts`. Per-schedule overrides stored in `schedules.effort_weights jsonb`.

---

## Domain — Pure Functions

All in `packages/domain/src/schedule/shot-plan.ts`. No framework imports, fully portable.

```typescript
// Resolve minutes for a single shot (override > lookup > fallback)
export const resolveShotMinutes = (
  shot: Pick<Shot, "shotSize" | "cameraMovement" | "estimatedMinutes">,
  weights: ShotEffortWeights,
): number => {
  if (shot.estimatedMinutes !== null) return shot.estimatedMinutes;
  // Check HANDHELD_ANY / STEADICAM_ANY / CRANE_ANY / DRONE_ANY overrides first
  const movementKey = `${shot.cameraMovement}_ANY` as keyof ShotEffortWeights;
  if (movementKey in weights) return weights[movementKey] as number;
  const key =
    `${shot.shotSize}_${shot.cameraMovement}` as keyof ShotEffortWeights;
  return (weights[key] as number | undefined) ?? weights.MS_STATIC;
};

// Infer transition slots between two consecutive shots
export const inferTransitions = (
  shotA: Shot,
  shotB: Shot,
  breakdownElements: BreakdownElement[], // elements for actors in shotB
  weights: ShotEffortWeights,
): InferredTransition[] => {
  /* ... */
};

// Compute total minutes for a scenario
export const computeScenarioTotal = (
  shots: Shot[],
  transitions: TransitionSlot[],
  weights: ShotEffortWeights,
): number => {
  /* sum resolvedMinutes for all shots + transitions */
};
```

### Transition inference rules

| Rule ID          | Trigger                                                           | Default minutes             |
| ---------------- | ----------------------------------------------------------------- | --------------------------- |
| `rig_change`     | `cameraMovement` changes between DOLLY/CRANE ↔ HANDHELD/STEADICAM | `transition_rig_change`     |
| `shot_size_jump` | shotSize distance > 2 steps (WS→CU or CU→WS)                      | `transition_shot_size_jump` |
| `makeup`         | next shot's actors have makeup/hair breakdown elements            | `transition_makeup`         |
| `costume`        | next shot's actors have costume breakdown elements                | `transition_costume`        |

Rules are evaluated in order; multiple can fire for the same pair of shots. Each produces a separate `TransitionSlot` with its own `ruleId`.

---

## Sync to Schedule

On every mutation that changes the active scenario's shots or transitions:

```typescript
const syncStripEffort = async (
  db: Db,
  sceneId: string,
  scheduleId: string,
  weights: ShotEffortWeights,
): Promise<void> => {
  const totalMinutes = await computeActiveScenarioTotal(db, sceneId, weights);
  const totalHours = totalMinutes / 60;
  await db
    .update(strips)
    .set({ estimatedHours: totalHours })
    .where(and(eq(strips.sceneId, sceneId), eq(strips.scheduleId, scheduleId)));
};
```

Triggered by: `updateShot`, `addShot`, `deleteShot`, `updateTransition`, `addTransition`, `deleteTransition`, `setActiveScenario`.

---

## Compare Modes

### Compare C — Day balance view

Top section of the Piano di Ripresa page. For the selected shooting day:

- One horizontal bar per scene, width proportional to total active scenario minutes
- Color: grey if no shot plan, colored if planned, red if overflows 8h capacity
- Shows scene number, location abbreviation, total time label

### Compare A — Scenario comparison

Selecting a scene opens the scene timeline. Multiple scenario tabs (Piano A, Piano B) let the director build alternative coverage plans. Only the active scenario (marked with a checkmark) feeds the schedule. Switching the active scenario triggers `syncStripEffort`.

---

## AI Integration (Cesare)

Button "Suggerisci shot" on the scene timeline. Calls Cesare with:

- Scene text (fountain)
- Breakdown elements (cast, props, VFX, stunts)
- Page count

Cesare returns a suggested `ShotPlanScenario` (list of shots). This is inserted as a new scenario (e.g., "Piano A — Cesare") leaving any existing scenarios untouched. The director accepts, modifies, or discards it.

Uses `MOCK_AI=true` during development (response from `mocks/ai-responses.ts`).

---

## Server Functions

All in `features/shooting-plan/server/shooting-plan.server.ts`.

```typescript
// CRUD for shot plans / scenarios / shots / transitions
getShotPlan(sceneId);
createShotPlanScenario({ shotPlanId, name });
setActiveScenario({ shotPlanId, scenarioId }); // triggers syncStripEffort
addShot({ scenarioId, shot }); // triggers syncStripEffort
updateShot({ shotId, patch }); // triggers syncStripEffort
deleteShot({ shotId }); // triggers syncStripEffort
reorderShots({ scenarioId, orderedIds }); // triggers inferTransitions + sync
addTransition({ scenarioId, afterShotId, transition });
updateTransition({ transitionId, patch }); // triggers syncStripEffort
deleteTransition({ transitionId }); // triggers syncStripEffort
suggestShotList({ sceneId, scenarioName }); // Cesare call
getEffortWeights({ scheduleId });
updateEffortWeights({ scheduleId, weights }); // triggers full recalc for schedule
```

---

## UI Components

New feature folder: `features/shooting-plan/`

| Component            | Description                                               |
| -------------------- | --------------------------------------------------------- |
| `ShootingPlanPage`   | Page root, day picker sidebar + main area                 |
| `DayBalanceTimeline` | Compare C — horizontal bars per scene for a day           |
| `SceneShotTimeline`  | Compare B — real-time axis with shot + transition blocks  |
| `ShotBlock`          | Draggable shot on the timeline, color = shotSize category |
| `TransitionBlock`    | Transition slot between shots, color = type               |
| `ShotDetailPanel`    | Sidebar for editing a selected shot's fields              |
| `ScenarioTabs`       | Plan A / Plan B tab bar + active indicator                |
| `EffortWeightsTable` | Editable table in schedule settings                       |

Drag-and-drop: native HTML5 drag API (same pattern used in the strip board). No external DnD library.

---

## DB Migration

Migration `0020_shot_plans.sql`:

- `shot_plans` table
- `shot_plan_scenarios` table
- `shots` table
- `transition_slots` table
- `schedules.effort_weights jsonb` column (nullable, falls back to domain defaults)

---

## Testing

### Vitest (unit)

Critical functions in `packages/domain/src/schedule/shot-plan.test.ts`:

- `resolveShotMinutes` — all lookup paths including `_ANY` overrides
- `inferTransitions` — all 4 rule types, edge cases (same setup = no transition)
- `computeScenarioTotal` — sum correctness with mixed auto/manual minutes

### Playwright (E2E)

In `tests/shooting-plan.spec.ts`:

- Add shot list to a scene, verify strip effort updates on schedule
- Switch active scenario, verify effort changes on schedule
- Add manual transition, verify it persists after shot reorder
- Cesare suggestion flow (mock mode)

---

## Out of Scope

- Carry-over shots across days (split scene across two days)
- Call sheet generation from shot list
- Export shot list to PDF / CSV
- Location travel slots between scenes on the same day (transition type `TRAVEL` is defined in the enum but not implemented)
- Per-scenario cast call list
