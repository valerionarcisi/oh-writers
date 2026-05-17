# Spec 27b — Scene Effort

## Problem

Shot count is a proxy for scene complexity, but it doesn't capture difficulty invisible to the shot list: stunt work, VFX, large cast, difficult location, night shoot. The scheduler needs a weight per scene to produce realistic day estimates.

## Solution

A **1–5 effort score** on each scene, editable inline in the Inquadrature (shooting-plan) scene sidebar. The score is a manual override that the scheduler multiplies against a base time-per-shot constant to compute estimated shooting hours.

## Effort scale

| Value | Label        | Meaning                                      |
|-------|--------------|----------------------------------------------|
| 1     | Semplice     | Dialogue, single location, small cast        |
| 2     | Normale      | Standard scene, no special requirements      |
| 3     | Complessa    | Multiple locations or cast, some complexity  |
| 4     | Difficile    | Stunt / VFX / large crowd / night shoot      |
| 5     | Eccezionale  | Major sequence, full production day likely   |

Default: **2** (Normale) — never null.

## Data model

Add `effort` column to `screenplay_scenes`:

```sql
effort integer NOT NULL DEFAULT 2
  CONSTRAINT effort_range CHECK (effort BETWEEN 1 AND 5)
```

No new table. The score lives on the scene row.

## Domain

`packages/domain/src/shooting-plan/effort.ts`:

```ts
export const EFFORT_LEVELS = [1, 2, 3, 4, 5] as const;
export type EffortLevel = (typeof EFFORT_LEVELS)[number];

export const EFFORT_LABELS: Record<EffortLevel, string> = {
  1: "Semplice",
  2: "Normale",
  3: "Complessa",
  4: "Difficile",
  5: "Eccezionale",
};
```

## UI

In the scene sidebar card (ShootingPlanPage), below the shot/time status chip:

```
SC.1  INT/EXT. ANGOLO OPEN GREZZO
● 6 shot · 2h
Effort  [1][2][3][4][5]
```

- Five small pill buttons in a row, always visible when scene is selected
- Active pill: filled accent color
- Unselected pills: ghost/outline
- Click = immediate optimistic update (no loading state needed — fast mutation)

## Server

`updateSceneEffort` server function in `features/shooting-plan/server/shooting-plan.server.ts`:

- Input: `{ sceneId, projectId, effort: EffortLevel }`
- Auth: `withProjectAccess(projectId, "edit")`
- Returns: `ResultShape<{ sceneId: string; effort: EffortLevel }, ...>`
- Invalidates: `["shooting-plan", "scenes", projectId]`

## Schedule integration

When computing estimated shooting hours per scene:

```
estimatedHours = (shotCount × BASE_MINUTES_PER_SHOT × effort) / 60
```

`BASE_MINUTES_PER_SHOT` = 15 min (configurable per-project later, hardcoded for now).

This replaces the current `totalMinutes` field which is based only on shot count. The effort multiplier is applied at read time in the query / selector — no denormalized column needed.

## Tests

| Tag       | File                                          | Scenario                                      |
|-----------|-----------------------------------------------|-----------------------------------------------|
| OHW-400   | tests/shooting-plan/scene-effort.spec.ts      | Default effort = 2 on new scene               |
| OHW-401   | tests/shooting-plan/scene-effort.spec.ts      | Click effort pill → updates DB, pill reflects |
| OHW-402   | tests/shooting-plan/scene-effort.spec.ts      | Effort out of range [1-5] rejected by server  |
| OHW-403   | apps/web/app/features/shooting-plan/server/shooting-plan.server.test.ts | estimatedHours formula correct for effort 1, 3, 5 |
