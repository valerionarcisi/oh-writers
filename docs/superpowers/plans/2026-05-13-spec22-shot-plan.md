# Piano di Ripresa (Shot Planning) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the "Piano di Ripresa" section — a dedicated shot planning tool where director and DoP build per-scene shot lists with automatic transition slots, scenario comparison (Plan A/B), and day balance view; the active scenario's total time syncs silently to `strips.estimated_hours`.

**Architecture:** New feature folder `features/shooting-plan/` mirrors the `features/schedule/` pattern. Pure domain logic lives in `packages/domain/src/schedule/shot-plan.ts` (fully testable with Vitest). Four new DB tables (`shot_plans`, `shot_plan_scenarios`, `shots`, `transition_slots`) plus a `effort_weights jsonb` column on `schedules`. UI is a separate TanStack route with its own day-picker sidebar + timeline canvas.

**Tech Stack:** Drizzle (PostgreSQL), Zod, neverthrow ResultAsync, TanStack Start `createServerFn`, TanStack Query, React, CSS Modules, native HTML5 drag-and-drop, Vitest (unit), Playwright (E2E).

---

## File Map

### New files

| File                                                                           | Responsibility                                                             |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `packages/db/drizzle/0020_shot_plans.sql`                                      | DB migration                                                               |
| `packages/db/src/schema/shot-plan.ts`                                          | Drizzle table definitions                                                  |
| `packages/domain/src/schedule/effort-weights.ts`                               | Default weight constants + key derivation                                  |
| `packages/domain/src/schedule/shot-plan.ts`                                    | Pure functions: resolveShotMinutes, inferTransitions, computeScenarioTotal |
| `packages/domain/src/schedule/shot-plan.test.ts`                               | Vitest unit tests                                                          |
| `apps/web/app/features/shooting-plan/shooting-plan.errors.ts`                  | Domain error classes                                                       |
| `apps/web/app/features/shooting-plan/server/shooting-plan.server.ts`           | All server functions + query options                                       |
| `apps/web/app/features/shooting-plan/components/ShootingPlanPage.tsx`          | Page root, day-picker sidebar                                              |
| `apps/web/app/features/shooting-plan/components/ShootingPlanPage.module.css`   |                                                                            |
| `apps/web/app/features/shooting-plan/components/DayBalanceTimeline.tsx`        | Compare C — bar per scene                                                  |
| `apps/web/app/features/shooting-plan/components/DayBalanceTimeline.module.css` |                                                                            |
| `apps/web/app/features/shooting-plan/components/SceneShotTimeline.tsx`         | Compare B — real-time axis, multi-cam tracks                               |
| `apps/web/app/features/shooting-plan/components/SceneShotTimeline.module.css`  |                                                                            |
| `apps/web/app/features/shooting-plan/components/ShotBlock.tsx`                 | Draggable shot on timeline                                                 |
| `apps/web/app/features/shooting-plan/components/ShotBlock.module.css`          |                                                                            |
| `apps/web/app/features/shooting-plan/components/TransitionBlock.tsx`           | Transition gap between shots                                               |
| `apps/web/app/features/shooting-plan/components/TransitionBlock.module.css`    |                                                                            |
| `apps/web/app/features/shooting-plan/components/ScenarioTabs.tsx`              | Plan A/B tab bar                                                           |
| `apps/web/app/features/shooting-plan/components/ScenarioTabs.module.css`       |                                                                            |
| `apps/web/app/features/shooting-plan/components/ShotDetailPanel.tsx`           | Inline shot editor (slide-in)                                              |
| `apps/web/app/features/shooting-plan/components/ShotDetailPanel.module.css`    |                                                                            |
| `apps/web/app/features/shooting-plan/index.ts`                                 | Public API                                                                 |
| `apps/web/app/routes/_app.projects.$id_.shooting-plan.tsx`                     | TanStack route                                                             |
| `tests/shooting-plan.spec.ts`                                                  | Playwright E2E                                                             |

### Modified files

| File                                                     | Change                                                |
| -------------------------------------------------------- | ----------------------------------------------------- |
| `packages/db/src/schema/index.ts`                        | Export new tables                                     |
| `packages/db/src/schema/schedule.ts`                     | Add `effortWeights jsonb` column to `schedules`       |
| `packages/domain/src/schedule/index.ts`                  | Re-export new functions and types                     |
| `packages/domain/src/index.ts`                           | Re-export schedule/shot-plan                          |
| `apps/web/app/features/app-shell/components/Sidebar.tsx` | Add "Piano di Ripresa" nav link in Production section |

---

## Task 1 — DB migration + Drizzle schema

**Files:**

- Create: `packages/db/drizzle/0020_shot_plans.sql`
- Create: `packages/db/src/schema/shot-plan.ts`
- Modify: `packages/db/src/schema/schedule.ts` (add `effortWeights`)
- Modify: `packages/db/src/schema/index.ts`

- [ ] **Step 1: Write the migration SQL**

```sql
-- packages/db/drizzle/0020_shot_plans.sql

ALTER TABLE schedules
  ADD COLUMN effort_weights jsonb;

CREATE TABLE shot_plans (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  scene_id    uuid NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  active_scenario_id uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scene_id)
);

CREATE TABLE shot_plan_scenarios (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shot_plan_id uuid NOT NULL REFERENCES shot_plans(id) ON DELETE CASCADE,
  name         text NOT NULL DEFAULT 'Piano A',
  position     integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE shots (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id        uuid NOT NULL REFERENCES shot_plan_scenarios(id) ON DELETE CASCADE,
  position           integer NOT NULL DEFAULT 0,
  shot_size          text NOT NULL,
  camera_movement    text NOT NULL,
  estimated_minutes  real,
  notes              text,
  camera_label       text NOT NULL DEFAULT 'A',
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE transition_slots (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id       uuid NOT NULL REFERENCES shot_plan_scenarios(id) ON DELETE CASCADE,
  after_shot_id     uuid NOT NULL REFERENCES shots(id) ON DELETE CASCADE,
  type              text NOT NULL,
  estimated_minutes real,
  rule_id           text,
  is_manual         boolean NOT NULL DEFAULT false,
  label             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE shot_plans
  ADD CONSTRAINT fk_active_scenario
  FOREIGN KEY (active_scenario_id)
  REFERENCES shot_plan_scenarios(id)
  ON DELETE SET NULL
  DEFERRABLE INITIALLY DEFERRED;
```

- [ ] **Step 2: Run the migration**

```bash
cd /path/to/project && pnpm db:migrate
```

Expected: migration applies without errors.

- [ ] **Step 3: Write the Drizzle schema**

```typescript
// packages/db/src/schema/shot-plan.ts
import {
  pgTable,
  uuid,
  text,
  integer,
  real,
  boolean,
  timestamp,
  jsonb,
  unique,
} from "drizzle-orm/pg-core";
import { projects } from "./projects";
import { scenes } from "./scenes";

export const shotPlans = pgTable(
  "shot_plans",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    sceneId: uuid("scene_id")
      .notNull()
      .references(() => scenes.id, { onDelete: "cascade" }),
    activeScenarioId: uuid("active_scenario_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [unique().on(t.sceneId)],
);

export const shotPlanScenarios = pgTable("shot_plan_scenarios", {
  id: uuid("id").defaultRandom().primaryKey(),
  shotPlanId: uuid("shot_plan_id")
    .notNull()
    .references(() => shotPlans.id, { onDelete: "cascade" }),
  name: text("name").notNull().default("Piano A"),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const shots = pgTable("shots", {
  id: uuid("id").defaultRandom().primaryKey(),
  scenarioId: uuid("scenario_id")
    .notNull()
    .references(() => shotPlanScenarios.id, { onDelete: "cascade" }),
  position: integer("position").notNull().default(0),
  shotSize: text("shot_size").notNull(),
  cameraMovement: text("camera_movement").notNull(),
  estimatedMinutes: real("estimated_minutes"),
  notes: text("notes"),
  cameraLabel: text("camera_label").notNull().default("A"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const transitionSlots = pgTable("transition_slots", {
  id: uuid("id").defaultRandom().primaryKey(),
  scenarioId: uuid("scenario_id")
    .notNull()
    .references(() => shotPlanScenarios.id, { onDelete: "cascade" }),
  afterShotId: uuid("after_shot_id")
    .notNull()
    .references(() => shots.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  estimatedMinutes: real("estimated_minutes"),
  ruleId: text("rule_id"),
  isManual: boolean("is_manual").notNull().default(false),
  label: text("label"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type ShotPlan = typeof shotPlans.$inferSelect;
export type ShotPlanScenario = typeof shotPlanScenarios.$inferSelect;
export type Shot = typeof shots.$inferSelect;
export type TransitionSlot = typeof transitionSlots.$inferSelect;
```

- [ ] **Step 4: Add `effortWeights` to `schedules` table**

In `packages/db/src/schema/schedule.ts`, add after `updatedAt`:

```typescript
import {
  pgTable,
  uuid,
  text,
  integer,
  real,
  boolean,
  date,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
// ... existing imports unchanged ...

export const schedules = pgTable("schedules", {
  // ... all existing fields unchanged ...
  effortWeights: jsonb("effort_weights"), // add this line before closing brace
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
```

- [ ] **Step 5: Export from schema index**

In `packages/db/src/schema/index.ts`, add:

```typescript
export * from "./shot-plan";
```

- [ ] **Step 6: Commit**

```bash
git add packages/db/drizzle/0020_shot_plans.sql \
        packages/db/src/schema/shot-plan.ts \
        packages/db/src/schema/schedule.ts \
        packages/db/src/schema/index.ts
git commit -m "[OHW] feat(db): add shot plan tables + effort_weights column (migration 0020)"
```

---

## Task 2 — Domain: effort weights + Zod schemas

**Files:**

- Create: `packages/domain/src/schedule/effort-weights.ts`
- Modify: `packages/domain/src/schedule/index.ts`

- [ ] **Step 1: Write `effort-weights.ts`**

```typescript
// packages/domain/src/schedule/effort-weights.ts
import { z } from "zod";

export const ShotSizes = {
  EWS: "EWS",
  WS: "WS",
  MS: "MS",
  MCU: "MCU",
  CU: "CU",
  ECU: "ECU",
  INSERT: "INSERT",
  OTS: "OTS",
  TWO_SHOT: "TWO_SHOT",
  POV: "POV",
} as const;
export type ShotSize = (typeof ShotSizes)[keyof typeof ShotSizes];

export const CameraMovements = {
  STATIC: "STATIC",
  PAN: "PAN",
  TILT: "TILT",
  DOLLY: "DOLLY",
  HANDHELD: "HANDHELD",
  STEADICAM: "STEADICAM",
  CRANE: "CRANE",
  DRONE: "DRONE",
  ZOOM: "ZOOM",
} as const;
export type CameraMovement =
  (typeof CameraMovements)[keyof typeof CameraMovements];

export const CameraLabels = { A: "A", B: "B", C: "C", D: "D" } as const;
export type CameraLabel = (typeof CameraLabels)[keyof typeof CameraLabels];

export const TransitionTypes = {
  SETUP_CHANGE: "SETUP_CHANGE",
  MAKEUP_COSTUME: "MAKEUP_COSTUME",
  BREAK: "BREAK",
  TRAVEL: "TRAVEL",
} as const;
export type TransitionType =
  (typeof TransitionTypes)[keyof typeof TransitionTypes];

export const ShotEffortWeightsSchema = z.object({
  WS_STATIC: z.number().min(1).default(45),
  WS_DOLLY: z.number().min(1).default(90),
  WS_CRANE: z.number().min(1).default(120),
  MS_STATIC: z.number().min(1).default(25),
  MCU_STATIC: z.number().min(1).default(20),
  CU_STATIC: z.number().min(1).default(20),
  ECU_STATIC: z.number().min(1).default(15),
  OTS_STATIC: z.number().min(1).default(20),
  TWO_SHOT_STATIC: z.number().min(1).default(25),
  INSERT_STATIC: z.number().min(1).default(15),
  POV_STATIC: z.number().min(1).default(15),
  HANDHELD_ANY: z.number().min(1).default(15),
  STEADICAM_ANY: z.number().min(1).default(30),
  CRANE_ANY: z.number().min(1).default(120),
  DRONE_ANY: z.number().min(1).default(90),
  transition_rig_change: z.number().min(1).default(20),
  transition_shot_size_jump: z.number().min(1).default(15),
  transition_makeup: z.number().min(1).default(30),
  transition_costume: z.number().min(1).default(20),
});
export type ShotEffortWeights = z.infer<typeof ShotEffortWeightsSchema>;

export const DEFAULT_SHOT_EFFORT_WEIGHTS: ShotEffortWeights =
  ShotEffortWeightsSchema.parse({});

// Derive lookup key for a shot
export const shotWeightKey = (
  size: ShotSize,
  movement: CameraMovement,
): keyof ShotEffortWeights => {
  const movementOverrideKey = `${movement}_ANY` as keyof ShotEffortWeights;
  if (movementOverrideKey in DEFAULT_SHOT_EFFORT_WEIGHTS) {
    return movementOverrideKey;
  }
  return `${size}_${movement}` as keyof ShotEffortWeights;
};

// Shot size ordering for "jump" detection (0 = widest)
export const SHOT_SIZE_ORDER: Record<ShotSize, number> = {
  EWS: 0,
  WS: 1,
  MS: 2,
  TWO_SHOT: 2,
  OTS: 3,
  MCU: 3,
  CU: 4,
  ECU: 5,
  INSERT: 4,
  POV: 3,
};
```

- [ ] **Step 2: Re-export from schedule index**

Add to `packages/domain/src/schedule/index.ts`:

```typescript
export * from "./effort-weights";
export * from "./shot-plan";
```

- [ ] **Step 3: Commit**

```bash
git add packages/domain/src/schedule/effort-weights.ts \
        packages/domain/src/schedule/index.ts
git commit -m "[OHW] feat(domain): add shot size/movement constants + effort weights schema"
```

---

## Task 3 — Domain: `resolveShotMinutes` (TDD)

**Files:**

- Create: `packages/domain/src/schedule/shot-plan.ts`
- Create: `packages/domain/src/schedule/shot-plan.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/domain/src/schedule/shot-plan.test.ts
import { describe, it, expect } from "vitest";
import { resolveShotMinutes } from "./shot-plan";
import { DEFAULT_SHOT_EFFORT_WEIGHTS } from "./effort-weights";

describe("resolveShotMinutes", () => {
  it("returns explicit override when set", () => {
    expect(
      resolveShotMinutes(
        { shotSize: "CU", cameraMovement: "STATIC", estimatedMinutes: 99 },
        DEFAULT_SHOT_EFFORT_WEIGHTS,
      ),
    ).toBe(99);
  });

  it("uses movement ANY override for HANDHELD regardless of size", () => {
    expect(
      resolveShotMinutes(
        { shotSize: "WS", cameraMovement: "HANDHELD", estimatedMinutes: null },
        DEFAULT_SHOT_EFFORT_WEIGHTS,
      ),
    ).toBe(15); // HANDHELD_ANY default
  });

  it("uses size+movement key for STATIC", () => {
    expect(
      resolveShotMinutes(
        { shotSize: "WS", cameraMovement: "STATIC", estimatedMinutes: null },
        DEFAULT_SHOT_EFFORT_WEIGHTS,
      ),
    ).toBe(45); // WS_STATIC default
  });

  it("falls back to MS_STATIC for unknown combination", () => {
    expect(
      resolveShotMinutes(
        { shotSize: "EWS", cameraMovement: "ZOOM", estimatedMinutes: null },
        DEFAULT_SHOT_EFFORT_WEIGHTS,
      ),
    ).toBe(25); // MS_STATIC fallback
  });

  it("respects custom weights", () => {
    const custom = { ...DEFAULT_SHOT_EFFORT_WEIGHTS, WS_STATIC: 60 };
    expect(
      resolveShotMinutes(
        { shotSize: "WS", cameraMovement: "STATIC", estimatedMinutes: null },
        custom,
      ),
    ).toBe(60);
  });
});
```

- [ ] **Step 2: Run test — confirm it fails**

```bash
pnpm --filter @oh-writers/domain vitest run src/schedule/shot-plan.test.ts
```

Expected: `Cannot find module './shot-plan'`

- [ ] **Step 3: Implement `resolveShotMinutes`**

```typescript
// packages/domain/src/schedule/shot-plan.ts
import {
  type ShotSize,
  type CameraMovement,
  type ShotEffortWeights,
  DEFAULT_SHOT_EFFORT_WEIGHTS,
  shotWeightKey,
} from "./effort-weights";

export const resolveShotMinutes = (
  shot: {
    shotSize: ShotSize;
    cameraMovement: CameraMovement;
    estimatedMinutes: number | null;
  },
  weights: ShotEffortWeights,
): number => {
  if (shot.estimatedMinutes !== null) return shot.estimatedMinutes;
  const key = shotWeightKey(shot.shotSize, shot.cameraMovement);
  return (weights[key] as number | undefined) ?? weights.MS_STATIC;
};
```

- [ ] **Step 4: Run test — confirm it passes**

```bash
pnpm --filter @oh-writers/domain vitest run src/schedule/shot-plan.test.ts
```

Expected: all 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/schedule/shot-plan.ts \
        packages/domain/src/schedule/shot-plan.test.ts
git commit -m "[OHW] feat(domain): resolveShotMinutes with TDD"
```

---

## Task 4 — Domain: `inferTransitions` (TDD)

**Files:**

- Modify: `packages/domain/src/schedule/shot-plan.ts`
- Modify: `packages/domain/src/schedule/shot-plan.test.ts`

- [ ] **Step 1: Add failing tests**

Add to `shot-plan.test.ts`:

```typescript
import { inferTransitions } from "./shot-plan";
import { TransitionTypes } from "./effort-weights";

describe("inferTransitions", () => {
  const noElements: string[] = [];

  it("returns empty array when consecutive shots have same setup", () => {
    const transitions = inferTransitions(
      { shotSize: "MS", cameraMovement: "STATIC" },
      { shotSize: "OTS", cameraMovement: "STATIC" },
      noElements,
      DEFAULT_SHOT_EFFORT_WEIGHTS,
    );
    expect(transitions).toHaveLength(0);
  });

  it("emits rig_change when movement changes between dolly and handheld", () => {
    const transitions = inferTransitions(
      { shotSize: "WS", cameraMovement: "DOLLY" },
      { shotSize: "MS", cameraMovement: "HANDHELD" },
      noElements,
      DEFAULT_SHOT_EFFORT_WEIGHTS,
    );
    expect(transitions).toHaveLength(1);
    expect(transitions[0].type).toBe(TransitionTypes.SETUP_CHANGE);
    expect(transitions[0].ruleId).toBe("rig_change");
    expect(transitions[0].estimatedMinutes).toBe(20);
  });

  it("emits shot_size_jump when size difference is > 2 steps", () => {
    const transitions = inferTransitions(
      { shotSize: "WS", cameraMovement: "STATIC" },
      { shotSize: "CU", cameraMovement: "STATIC" },
      noElements,
      DEFAULT_SHOT_EFFORT_WEIGHTS,
    );
    expect(transitions).toHaveLength(1);
    expect(transitions[0].ruleId).toBe("shot_size_jump");
    expect(transitions[0].estimatedMinutes).toBe(15);
  });

  it("emits makeup transition when breakdown elements include makeup", () => {
    const transitions = inferTransitions(
      { shotSize: "MS", cameraMovement: "STATIC" },
      { shotSize: "CU", cameraMovement: "STATIC" },
      ["makeup"],
      DEFAULT_SHOT_EFFORT_WEIGHTS,
    );
    const ruleIds = transitions.map((t) => t.ruleId);
    expect(ruleIds).toContain("makeup");
  });

  it("can emit multiple transitions for same shot pair", () => {
    const transitions = inferTransitions(
      { shotSize: "EWS", cameraMovement: "CRANE" },
      { shotSize: "CU", cameraMovement: "HANDHELD" },
      ["costume"],
      DEFAULT_SHOT_EFFORT_WEIGHTS,
    );
    // rig_change (crane→handheld) + shot_size_jump (EWS→CU) + costume
    expect(transitions.length).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Run — confirm failures**

```bash
pnpm --filter @oh-writers/domain vitest run src/schedule/shot-plan.test.ts
```

Expected: `inferTransitions is not a function`

- [ ] **Step 3: Implement `inferTransitions`**

Add to `packages/domain/src/schedule/shot-plan.ts`:

```typescript
import {
  SHOT_SIZE_ORDER,
  TransitionTypes,
  type TransitionType,
} from "./effort-weights";

interface InferredTransition {
  type: TransitionType;
  ruleId: string;
  estimatedMinutes: number;
  label: string;
  isManual: false;
}

const RIG_CHANGE_MOVEMENTS = new Set(["DOLLY", "CRANE", "STEADICAM"]);
const HANDHELD_MOVEMENTS = new Set(["HANDHELD"]);

export const inferTransitions = (
  shotA: { shotSize: ShotSize; cameraMovement: CameraMovement },
  shotB: { shotSize: ShotSize; cameraMovement: CameraMovement },
  breakdownCategories: string[],
  weights: ShotEffortWeights,
): InferredTransition[] => {
  const result: InferredTransition[] = [];

  const aIsRig = RIG_CHANGE_MOVEMENTS.has(shotA.cameraMovement);
  const bIsHandheld = HANDHELD_MOVEMENTS.has(shotB.cameraMovement);
  const aIsHandheld = HANDHELD_MOVEMENTS.has(shotA.cameraMovement);
  const bIsRig = RIG_CHANGE_MOVEMENTS.has(shotB.cameraMovement);

  if ((aIsRig && bIsHandheld) || (aIsHandheld && bIsRig)) {
    result.push({
      type: TransitionTypes.SETUP_CHANGE,
      ruleId: "rig_change",
      estimatedMinutes: weights.transition_rig_change,
      label: `Cambio rig: ${shotA.cameraMovement} → ${shotB.cameraMovement}`,
      isManual: false,
    });
  }

  const sizeJump = Math.abs(
    SHOT_SIZE_ORDER[shotA.shotSize] - SHOT_SIZE_ORDER[shotB.shotSize],
  );
  if (sizeJump > 2) {
    result.push({
      type: TransitionTypes.SETUP_CHANGE,
      ruleId: "shot_size_jump",
      estimatedMinutes: weights.transition_shot_size_jump,
      label: `Riposizionamento: ${shotA.shotSize} → ${shotB.shotSize}`,
      isManual: false,
    });
  }

  if (breakdownCategories.includes("makeup")) {
    result.push({
      type: TransitionTypes.MAKEUP_COSTUME,
      ruleId: "makeup",
      estimatedMinutes: weights.transition_makeup,
      label: "Cambio trucco",
      isManual: false,
    });
  }

  if (breakdownCategories.includes("costume")) {
    result.push({
      type: TransitionTypes.MAKEUP_COSTUME,
      ruleId: "costume",
      estimatedMinutes: weights.transition_costume,
      label: "Cambio costume",
      isManual: false,
    });
  }

  return result;
};
```

- [ ] **Step 4: Run — confirm all pass**

```bash
pnpm --filter @oh-writers/domain vitest run src/schedule/shot-plan.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/schedule/shot-plan.ts \
        packages/domain/src/schedule/shot-plan.test.ts
git commit -m "[OHW] feat(domain): inferTransitions with TDD"
```

---

## Task 5 — Domain: `computeScenarioTotal` (TDD)

**Files:**

- Modify: `packages/domain/src/schedule/shot-plan.ts`
- Modify: `packages/domain/src/schedule/shot-plan.test.ts`

- [ ] **Step 1: Add failing tests**

```typescript
import { computeScenarioTotal } from "./shot-plan";

describe("computeScenarioTotal", () => {
  it("sums resolved shot minutes + explicit transition minutes", () => {
    const shots = [
      {
        shotSize: "WS" as ShotSize,
        cameraMovement: "STATIC" as CameraMovement,
        estimatedMinutes: null,
      },
      {
        shotSize: "CU" as ShotSize,
        cameraMovement: "STATIC" as CameraMovement,
        estimatedMinutes: null,
      },
    ];
    const transitions = [{ estimatedMinutes: 20 }];
    // WS_STATIC(45) + CU_STATIC(20) + transition(20) = 85
    expect(
      computeScenarioTotal(shots, transitions, DEFAULT_SHOT_EFFORT_WEIGHTS),
    ).toBe(85);
  });

  it("uses override minutes for shots", () => {
    const shots = [
      {
        shotSize: "WS" as ShotSize,
        cameraMovement: "STATIC" as CameraMovement,
        estimatedMinutes: 10,
      },
    ];
    expect(computeScenarioTotal(shots, [], DEFAULT_SHOT_EFFORT_WEIGHTS)).toBe(
      10,
    );
  });

  it("returns 0 for empty scenario", () => {
    expect(computeScenarioTotal([], [], DEFAULT_SHOT_EFFORT_WEIGHTS)).toBe(0);
  });
});
```

- [ ] **Step 2: Run — confirm failures**

```bash
pnpm --filter @oh-writers/domain vitest run src/schedule/shot-plan.test.ts
```

Expected: `computeScenarioTotal is not a function`

- [ ] **Step 3: Implement**

Add to `packages/domain/src/schedule/shot-plan.ts`:

```typescript
export const computeScenarioTotal = (
  shots: Array<{
    shotSize: ShotSize;
    cameraMovement: CameraMovement;
    estimatedMinutes: number | null;
  }>,
  transitions: Array<{ estimatedMinutes: number | null }>,
  weights: ShotEffortWeights,
): number => {
  const shotTotal = shots.reduce(
    (sum, s) => sum + resolveShotMinutes(s, weights),
    0,
  );
  const transitionTotal = transitions.reduce(
    (sum, t) => sum + (t.estimatedMinutes ?? 0),
    0,
  );
  return shotTotal + transitionTotal;
};
```

- [ ] **Step 4: Run full test suite**

```bash
pnpm --filter @oh-writers/domain vitest run src/schedule/shot-plan.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Re-export from domain index**

Add to `packages/domain/src/index.ts` (if `schedule` is not already re-exported, add):

```typescript
export * from "./schedule";
```

- [ ] **Step 6: Commit**

```bash
git add packages/domain/src/schedule/shot-plan.ts \
        packages/domain/src/schedule/shot-plan.test.ts \
        packages/domain/src/index.ts
git commit -m "[OHW] feat(domain): computeScenarioTotal + full shot-plan unit tests green"
```

---

## Task 6 — Errors + read server functions

**Files:**

- Create: `apps/web/app/features/shooting-plan/shooting-plan.errors.ts`
- Create: `apps/web/app/features/shooting-plan/server/shooting-plan.server.ts`

- [ ] **Step 1: Write error classes**

```typescript
// apps/web/app/features/shooting-plan/shooting-plan.errors.ts
import { ForbiddenError, DbError } from "@oh-writers/utils";
export { ForbiddenError, DbError };

export class ShotPlanNotFoundError {
  readonly _tag = "ShotPlanNotFoundError" as const;
  readonly message: string;
  constructor(readonly sceneId: string) {
    this.message = `Shot plan not found for scene: ${sceneId}`;
  }
}

export class ScenarioNotFoundError {
  readonly _tag = "ScenarioNotFoundError" as const;
  readonly message: string;
  constructor(readonly id: string) {
    this.message = `Scenario not found: ${id}`;
  }
}

export class ShotNotFoundError {
  readonly _tag = "ShotNotFoundError" as const;
  readonly message: string;
  constructor(readonly id: string) {
    this.message = `Shot not found: ${id}`;
  }
}
```

- [ ] **Step 2: Write read server functions + types**

```typescript
// apps/web/app/features/shooting-plan/server/shooting-plan.server.ts
import { createServerFn } from "@tanstack/start";
import { z } from "zod";
import { eq, asc, and } from "drizzle-orm";
import { ResultAsync, ok, err } from "neverthrow";
import {
  shotPlans,
  shotPlanScenarios,
  shots,
  transitionSlots,
  schedules,
  strips,
} from "@oh-writers/db/schema";
import {
  DEFAULT_SHOT_EFFORT_WEIGHTS,
  ShotEffortWeightsSchema,
  resolveShotMinutes,
  computeScenarioTotal,
  type ShotSize,
  type CameraMovement,
  type CameraLabel,
  type TransitionType,
  type ShotEffortWeights,
} from "@oh-writers/domain";
import { toShape, type ResultShape } from "@oh-writers/utils";
import { queryOptions } from "@tanstack/react-query";
import { requireUser } from "~/server/context";
import { getDb, type Db } from "~/server/db";
import {
  ShotPlanNotFoundError,
  ScenarioNotFoundError,
  ShotNotFoundError,
  ForbiddenError,
  DbError,
} from "../shooting-plan.errors";

// ─── View types ───────────────────────────────────────────────────────────────

export interface ShotView {
  id: string;
  scenarioId: string;
  position: number;
  shotSize: ShotSize;
  cameraMovement: CameraMovement;
  estimatedMinutes: number | null;
  resolvedMinutes: number;
  notes: string | null;
  cameraLabel: CameraLabel;
}

export interface TransitionSlotView {
  id: string;
  scenarioId: string;
  afterShotId: string;
  type: TransitionType;
  estimatedMinutes: number | null;
  resolvedMinutes: number;
  ruleId: string | null;
  isManual: boolean;
  label: string | null;
}

export interface ScenarioView {
  id: string;
  shotPlanId: string;
  name: string;
  position: number;
  shots: ShotView[];
  transitions: TransitionSlotView[];
  totalMinutes: number;
}

export interface ShotPlanView {
  id: string;
  sceneId: string;
  activeScenarioId: string | null;
  scenarios: ScenarioView[];
  weights: ShotEffortWeights;
}

// ─── Access helper ─────────────────────────────────────────────────────────

const resolveWeights = async (
  db: Db,
  projectId: string,
): Promise<ShotEffortWeights> => {
  const schedule = await db
    .select({ effortWeights: schedules.effortWeights })
    .from(schedules)
    .where(eq(schedules.projectId, projectId))
    .limit(1)
    .then((r) => r[0]);
  if (!schedule?.effortWeights) return DEFAULT_SHOT_EFFORT_WEIGHTS;
  const parsed = ShotEffortWeightsSchema.safeParse(schedule.effortWeights);
  return parsed.success ? parsed.data : DEFAULT_SHOT_EFFORT_WEIGHTS;
};

const buildScenarioView = (
  scenario: typeof shotPlanScenarios.$inferSelect,
  rawShots: (typeof shots.$inferSelect)[],
  rawTransitions: (typeof transitionSlots.$inferSelect)[],
  weights: ShotEffortWeights,
): ScenarioView => {
  const shotViews: ShotView[] = rawShots.map((s) => ({
    id: s.id,
    scenarioId: s.scenarioId,
    position: s.position,
    shotSize: s.shotSize as ShotSize,
    cameraMovement: s.cameraMovement as CameraMovement,
    estimatedMinutes: s.estimatedMinutes,
    resolvedMinutes: resolveShotMinutes(
      {
        shotSize: s.shotSize as ShotSize,
        cameraMovement: s.cameraMovement as CameraMovement,
        estimatedMinutes: s.estimatedMinutes,
      },
      weights,
    ),
    notes: s.notes,
    cameraLabel: s.cameraLabel as CameraLabel,
  }));
  const transitionViews: TransitionSlotView[] = rawTransitions.map((t) => ({
    id: t.id,
    scenarioId: t.scenarioId,
    afterShotId: t.afterShotId,
    type: t.type as TransitionType,
    estimatedMinutes: t.estimatedMinutes,
    resolvedMinutes: t.estimatedMinutes ?? 0,
    ruleId: t.ruleId,
    isManual: t.isManual,
    label: t.label,
  }));
  return {
    id: scenario.id,
    shotPlanId: scenario.shotPlanId,
    name: scenario.name,
    position: scenario.position,
    shots: shotViews,
    transitions: transitionViews,
    totalMinutes: computeScenarioTotal(shotViews, transitionViews, weights),
  };
};

// ─── Read ─────────────────────────────────────────────────────────────────────

export const getShotPlan = createServerFn({ method: "GET" })
  .validator(
    z.object({ sceneId: z.string().uuid(), projectId: z.string().uuid() }),
  )
  .handler(
    async ({
      data,
    }): Promise<ResultShape<ShotPlanView | null, ForbiddenError | DbError>> => {
      await requireUser();
      const db = await getDb();
      const result = await ResultAsync.fromPromise(
        async () => {
          const weights = await resolveWeights(db, data.projectId);
          const plan = await db
            .select()
            .from(shotPlans)
            .where(eq(shotPlans.sceneId, data.sceneId))
            .limit(1)
            .then((r) => r[0]);
          if (!plan) return null;

          const scenarios = await db
            .select()
            .from(shotPlanScenarios)
            .where(eq(shotPlanScenarios.shotPlanId, plan.id))
            .orderBy(asc(shotPlanScenarios.position));

          const scenarioViews = await Promise.all(
            scenarios.map(async (sc) => {
              const [rawShots, rawTransitions] = await Promise.all([
                db
                  .select()
                  .from(shots)
                  .where(eq(shots.scenarioId, sc.id))
                  .orderBy(asc(shots.position)),
                db
                  .select()
                  .from(transitionSlots)
                  .where(eq(transitionSlots.scenarioId, sc.id)),
              ]);
              return buildScenarioView(sc, rawShots, rawTransitions, weights);
            }),
          );

          return {
            id: plan.id,
            sceneId: plan.sceneId,
            activeScenarioId: plan.activeScenarioId,
            scenarios: scenarioViews,
            weights,
          };
        },
        (e) => new DbError("getShotPlan", e),
      );
      return toShape(result);
    },
  );

export const shotPlanQueryOptions = (sceneId: string, projectId: string) =>
  queryOptions({
    queryKey: ["shot-plan", sceneId],
    queryFn: () => getShotPlan({ data: { sceneId, projectId } }),
  });

export const getEffortWeights = createServerFn({ method: "GET" })
  .validator(z.object({ projectId: z.string().uuid() }))
  .handler(
    async ({ data }): Promise<ResultShape<ShotEffortWeights, DbError>> => {
      await requireUser();
      const db = await getDb();
      const result = await ResultAsync.fromPromise(
        resolveWeights(db, data.projectId),
        (e) => new DbError("getEffortWeights", e),
      );
      return toShape(result);
    },
  );

export const effortWeightsQueryOptions = (projectId: string) =>
  queryOptions({
    queryKey: ["effort-weights", projectId],
    queryFn: () => getEffortWeights({ data: { projectId } }),
  });
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/features/shooting-plan/
git commit -m "[OHW] feat(shooting-plan): error classes + read server functions"
```

---

## Task 7 — Write server functions: shots + scenarios

**Files:**

- Modify: `apps/web/app/features/shooting-plan/server/shooting-plan.server.ts`

- [ ] **Step 1: Add shot + scenario write functions**

Append to `shooting-plan.server.ts`:

```typescript
// ─── Scenario management ─────────────────────────────────────────────────────

export const createShotPlanAndScenario = createServerFn({ method: "POST" })
  .validator(
    z.object({
      sceneId: z.string().uuid(),
      projectId: z.string().uuid(),
      scenarioName: z.string().min(1).max(50).default("Piano A"),
    }),
  )
  .handler(async ({ data }): Promise<ResultShape<ShotPlanView, DbError>> => {
    await requireUser();
    const db = await getDb();
    const result = await ResultAsync.fromPromise(
      async () => {
        // Upsert shot plan
        let plan = await db
          .select()
          .from(shotPlans)
          .where(eq(shotPlans.sceneId, data.sceneId))
          .limit(1)
          .then((r) => r[0]);
        if (!plan) {
          [plan] = await db
            .insert(shotPlans)
            .values({ projectId: data.projectId, sceneId: data.sceneId })
            .returning();
        }
        const [scenario] = await db
          .insert(shotPlanScenarios)
          .values({ shotPlanId: plan.id, name: data.scenarioName, position: 0 })
          .returning();
        if (!plan.activeScenarioId) {
          await db
            .update(shotPlans)
            .set({ activeScenarioId: scenario.id, updatedAt: new Date() })
            .where(eq(shotPlans.id, plan.id));
          plan = { ...plan, activeScenarioId: scenario.id };
        }
        const weights = await resolveWeights(db, data.projectId);
        return {
          id: plan.id,
          sceneId: plan.sceneId,
          activeScenarioId: plan.activeScenarioId,
          scenarios: [buildScenarioView(scenario, [], [], weights)],
          weights,
        };
      },
      (e) => new DbError("createShotPlanAndScenario", e),
    );
    return toShape(result);
  });

export const setActiveScenario = createServerFn({ method: "POST" })
  .validator(
    z.object({
      shotPlanId: z.string().uuid(),
      scenarioId: z.string().uuid(),
      projectId: z.string().uuid(),
    }),
  )
  .handler(async ({ data }): Promise<ResultShape<void, DbError>> => {
    await requireUser();
    const db = await getDb();
    const result = await ResultAsync.fromPromise(
      async () => {
        await db
          .update(shotPlans)
          .set({ activeScenarioId: data.scenarioId, updatedAt: new Date() })
          .where(eq(shotPlans.id, data.shotPlanId));
        await syncStripEffort(db, data.shotPlanId, data.projectId);
      },
      (e) => new DbError("setActiveScenario", e),
    );
    return toShape(result);
  });

// ─── Shot CRUD ────────────────────────────────────────────────────────────────

export const addShot = createServerFn({ method: "POST" })
  .validator(
    z.object({
      scenarioId: z.string().uuid(),
      shotPlanId: z.string().uuid(),
      projectId: z.string().uuid(),
      shotSize: z.string(),
      cameraMovement: z.string(),
      estimatedMinutes: z.number().min(1).max(480).nullable().default(null),
      notes: z.string().nullable().default(null),
      cameraLabel: z.string().default("A"),
    }),
  )
  .handler(async ({ data }): Promise<ResultShape<void, DbError>> => {
    await requireUser();
    const db = await getDb();
    const result = await ResultAsync.fromPromise(
      async () => {
        const existing = await db
          .select({ position: shots.position })
          .from(shots)
          .where(eq(shots.scenarioId, data.scenarioId))
          .orderBy(asc(shots.position));
        const nextPosition =
          existing.length > 0
            ? (existing[existing.length - 1]?.position ?? 0) + 1
            : 0;
        const [shot] = await db
          .insert(shots)
          .values({
            scenarioId: data.scenarioId,
            position: nextPosition,
            shotSize: data.shotSize,
            cameraMovement: data.cameraMovement,
            estimatedMinutes: data.estimatedMinutes,
            notes: data.notes,
            cameraLabel: data.cameraLabel,
          })
          .returning();
        if (existing.length > 0) {
          const prev = existing[existing.length - 1];
          if (prev)
            await insertAutoTransitions(
              db,
              prev.position,
              shot,
              data.scenarioId,
              data.projectId,
            );
        }
        await syncStripEffort(db, data.shotPlanId, data.projectId);
      },
      (e) => new DbError("addShot", e),
    );
    return toShape(result);
  });

export const updateShot = createServerFn({ method: "POST" })
  .validator(
    z.object({
      shotId: z.string().uuid(),
      shotPlanId: z.string().uuid(),
      projectId: z.string().uuid(),
      patch: z.object({
        shotSize: z.string().optional(),
        cameraMovement: z.string().optional(),
        estimatedMinutes: z.number().min(1).max(480).nullable().optional(),
        notes: z.string().nullable().optional(),
        cameraLabel: z.string().optional(),
      }),
    }),
  )
  .handler(
    async ({
      data,
    }): Promise<ResultShape<void, ShotNotFoundError | DbError>> => {
      await requireUser();
      const db = await getDb();
      const result = await ResultAsync.fromPromise(
        async () => {
          const existing = await db
            .select()
            .from(shots)
            .where(eq(shots.id, data.shotId))
            .limit(1)
            .then((r) => r[0]);
          if (!existing) throw new ShotNotFoundError(data.shotId);
          await db
            .update(shots)
            .set({ ...data.patch, updatedAt: new Date() })
            .where(eq(shots.id, data.shotId));
          await syncStripEffort(db, data.shotPlanId, data.projectId);
        },
        (e) =>
          e instanceof ShotNotFoundError ? e : new DbError("updateShot", e),
      );
      return toShape(result);
    },
  );

export const deleteShot = createServerFn({ method: "POST" })
  .validator(
    z.object({
      shotId: z.string().uuid(),
      shotPlanId: z.string().uuid(),
      projectId: z.string().uuid(),
    }),
  )
  .handler(async ({ data }): Promise<ResultShape<void, DbError>> => {
    await requireUser();
    const db = await getDb();
    const result = await ResultAsync.fromPromise(
      async () => {
        await db.delete(shots).where(eq(shots.id, data.shotId));
        await syncStripEffort(db, data.shotPlanId, data.projectId);
      },
      (e) => new DbError("deleteShot", e),
    );
    return toShape(result);
  });

export const reorderShots = createServerFn({ method: "POST" })
  .validator(
    z.object({
      scenarioId: z.string().uuid(),
      shotPlanId: z.string().uuid(),
      projectId: z.string().uuid(),
      orderedIds: z.array(z.string().uuid()),
    }),
  )
  .handler(async ({ data }): Promise<ResultShape<void, DbError>> => {
    await requireUser();
    const db = await getDb();
    const result = await ResultAsync.fromPromise(
      async () => {
        await Promise.all(
          data.orderedIds.map((id, idx) =>
            db
              .update(shots)
              .set({ position: idx, updatedAt: new Date() })
              .where(eq(shots.id, id)),
          ),
        );
        await rebuildAutoTransitions(db, data.scenarioId, data.projectId);
        await syncStripEffort(db, data.shotPlanId, data.projectId);
      },
      (e) => new DbError("reorderShots", e),
    );
    return toShape(result);
  });

// ─── Transition CRUD ──────────────────────────────────────────────────────────

export const addManualTransition = createServerFn({ method: "POST" })
  .validator(
    z.object({
      scenarioId: z.string().uuid(),
      shotPlanId: z.string().uuid(),
      projectId: z.string().uuid(),
      afterShotId: z.string().uuid(),
      type: z.string().default("BREAK"),
      estimatedMinutes: z.number().min(1).max(480).nullable().default(null),
      label: z.string().nullable().default(null),
    }),
  )
  .handler(async ({ data }): Promise<ResultShape<void, DbError>> => {
    await requireUser();
    const db = await getDb();
    const result = await ResultAsync.fromPromise(
      async () => {
        await db.insert(transitionSlots).values({
          scenarioId: data.scenarioId,
          afterShotId: data.afterShotId,
          type: data.type,
          estimatedMinutes: data.estimatedMinutes,
          isManual: true,
          label: data.label,
        });
        await syncStripEffort(db, data.shotPlanId, data.projectId);
      },
      (e) => new DbError("addManualTransition", e),
    );
    return toShape(result);
  });

export const updateTransition = createServerFn({ method: "POST" })
  .validator(
    z.object({
      transitionId: z.string().uuid(),
      shotPlanId: z.string().uuid(),
      projectId: z.string().uuid(),
      patch: z.object({
        estimatedMinutes: z.number().min(1).max(480).nullable().optional(),
        type: z.string().optional(),
        label: z.string().nullable().optional(),
      }),
    }),
  )
  .handler(async ({ data }): Promise<ResultShape<void, DbError>> => {
    await requireUser();
    const db = await getDb();
    const result = await ResultAsync.fromPromise(
      async () => {
        await db
          .update(transitionSlots)
          .set({ ...data.patch, updatedAt: new Date() })
          .where(eq(transitionSlots.id, data.transitionId));
        await syncStripEffort(db, data.shotPlanId, data.projectId);
      },
      (e) => new DbError("updateTransition", e),
    );
    return toShape(result);
  });

export const deleteTransition = createServerFn({ method: "POST" })
  .validator(
    z.object({
      transitionId: z.string().uuid(),
      shotPlanId: z.string().uuid(),
      projectId: z.string().uuid(),
    }),
  )
  .handler(async ({ data }): Promise<ResultShape<void, DbError>> => {
    await requireUser();
    const db = await getDb();
    const result = await ResultAsync.fromPromise(
      async () => {
        await db
          .delete(transitionSlots)
          .where(eq(transitionSlots.id, data.transitionId));
        await syncStripEffort(db, data.shotPlanId, data.projectId);
      },
      (e) => new DbError("deleteTransition", e),
    );
    return toShape(result);
  });

export const updateEffortWeights = createServerFn({ method: "POST" })
  .validator(
    z.object({
      projectId: z.string().uuid(),
      weights: ShotEffortWeightsSchema,
    }),
  )
  .handler(async ({ data }): Promise<ResultShape<void, DbError>> => {
    await requireUser();
    const db = await getDb();
    const result = await ResultAsync.fromPromise(
      db
        .update(schedules)
        .set({ effortWeights: data.weights, updatedAt: new Date() })
        .where(eq(schedules.projectId, data.projectId)),
      (e) => new DbError("updateEffortWeights", e),
    );
    return toShape(result.map(() => undefined));
  });

// ─── Internal helpers ──────────────────────────────────────────────────────

import {
  inferTransitions,
  type ShotSize as DS,
  type CameraMovement as DC,
} from "@oh-writers/domain";

const insertAutoTransitions = async (
  db: Db,
  _prevPosition: number,
  newShot: typeof shots.$inferSelect,
  scenarioId: string,
  projectId: string,
): Promise<void> => {
  const allShots = await db
    .select()
    .from(shots)
    .where(eq(shots.scenarioId, scenarioId))
    .orderBy(asc(shots.position));
  const newIdx = allShots.findIndex((s) => s.id === newShot.id);
  if (newIdx <= 0) return;
  const prev = allShots[newIdx - 1];
  if (!prev) return;
  const weights = await resolveWeights(db, projectId);
  const inferred = inferTransitions(
    {
      shotSize: prev.shotSize as DS,
      cameraMovement: prev.cameraMovement as DC,
    },
    {
      shotSize: newShot.shotSize as DS,
      cameraMovement: newShot.cameraMovement as DC,
    },
    [],
    weights,
  );
  if (inferred.length === 0) return;
  await db.insert(transitionSlots).values(
    inferred.map((t) => ({
      scenarioId,
      afterShotId: prev.id,
      type: t.type,
      estimatedMinutes: t.estimatedMinutes,
      ruleId: t.ruleId,
      isManual: false,
      label: t.label,
    })),
  );
};

const rebuildAutoTransitions = async (
  db: Db,
  scenarioId: string,
  projectId: string,
): Promise<void> => {
  await db
    .delete(transitionSlots)
    .where(
      and(
        eq(transitionSlots.scenarioId, scenarioId),
        eq(transitionSlots.isManual, false),
      ),
    );
  const allShots = await db
    .select()
    .from(shots)
    .where(eq(shots.scenarioId, scenarioId))
    .orderBy(asc(shots.position));
  const weights = await resolveWeights(db, projectId);
  for (let i = 1; i < allShots.length; i++) {
    const prev = allShots[i - 1]!;
    const curr = allShots[i]!;
    const inferred = inferTransitions(
      {
        shotSize: prev.shotSize as DS,
        cameraMovement: prev.cameraMovement as DC,
      },
      {
        shotSize: curr.shotSize as DS,
        cameraMovement: curr.cameraMovement as DC,
      },
      [],
      weights,
    );
    if (inferred.length > 0) {
      await db
        .insert(transitionSlots)
        .values(
          inferred.map((t) => ({
            scenarioId,
            afterShotId: prev.id,
            type: t.type,
            estimatedMinutes: t.estimatedMinutes,
            ruleId: t.ruleId,
            isManual: false,
            label: t.label,
          })),
        );
    }
  }
};

const syncStripEffort = async (
  db: Db,
  shotPlanId: string,
  projectId: string,
): Promise<void> => {
  const plan = await db
    .select()
    .from(shotPlans)
    .where(eq(shotPlans.id, shotPlanId))
    .limit(1)
    .then((r) => r[0]);
  if (!plan?.activeScenarioId) return;
  const weights = await resolveWeights(db, projectId);
  const [allShots, allTransitions] = await Promise.all([
    db.select().from(shots).where(eq(shots.scenarioId, plan.activeScenarioId)),
    db
      .select()
      .from(transitionSlots)
      .where(eq(transitionSlots.scenarioId, plan.activeScenarioId)),
  ]);
  const totalMinutes = computeScenarioTotal(
    allShots.map((s) => ({
      shotSize: s.shotSize as DS,
      cameraMovement: s.cameraMovement as DC,
      estimatedMinutes: s.estimatedMinutes,
    })),
    allTransitions,
    weights,
  );
  const totalHours = totalMinutes / 60;
  const schedule = await db
    .select({ id: schedules.id })
    .from(schedules)
    .where(eq(schedules.projectId, projectId))
    .limit(1)
    .then((r) => r[0]);
  if (!schedule) return;
  await db
    .update(strips)
    .set({ estimatedHours: totalHours, updatedAt: new Date() })
    .where(
      and(eq(strips.sceneId, plan.sceneId), eq(strips.scheduleId, schedule.id)),
    );
};
```

- [ ] **Step 2: Create the feature index**

```typescript
// apps/web/app/features/shooting-plan/index.ts
export { ShootingPlanPage } from "./components/ShootingPlanPage";
export type {
  ShotPlanView,
  ShotView,
  TransitionSlotView,
  ScenarioView,
} from "./server/shooting-plan.server";
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/features/shooting-plan/
git commit -m "[OHW] feat(shooting-plan): write server functions (shots, transitions, scenarios, sync)"
```

---

## Task 8 — Route + sidebar link

**Files:**

- Create: `apps/web/app/routes/_app.projects.$id_.shooting-plan.tsx`
- Modify: `apps/web/app/features/app-shell/components/Sidebar.tsx`

- [ ] **Step 1: Create the route**

```typescript
// apps/web/app/routes/_app.projects.$id_.shooting-plan.tsx
import { createFileRoute } from "@tanstack/react-router";
import { ShootingPlanPage } from "~/features/shooting-plan";

export const Route = createFileRoute("/_app/projects/$id_/shooting-plan")({
  component: ShootingPlanRoute,
});

function ShootingPlanRoute() {
  const { id } = Route.useParams();
  return <ShootingPlanPage projectId={id} />;
}
```

- [ ] **Step 2: Add sidebar link**

In `Sidebar.tsx`, add `Clapperboard` to the lucide imports:

```typescript
import {
  // ... existing imports ...
  Clapperboard,
} from "lucide-react";
```

Then in the Production `navSection`, add after the Schedule link and before Budget:

```tsx
<Link
  to="/projects/$id/shooting-plan"
  params={{ id: projectId }}
  className={styles.navLink}
  activeProps={{ className: `${styles.navLink} ${styles.active}` }}
  title="Piano di Ripresa"
>
  <Clapperboard size={ICON_SIZE} strokeWidth={ICON_STROKE} />
  {!isCollapsed && <span className={styles.navLabel}>Piano di Ripresa</span>}
</Link>
```

- [ ] **Step 3: Verify the app compiles**

```bash
pnpm --filter @oh-writers/web typecheck
```

Expected: no type errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/routes/_app.projects.$id_.shooting-plan.tsx \
        apps/web/app/features/app-shell/components/Sidebar.tsx
git commit -m "[OHW] feat(shooting-plan): route + sidebar nav link"
```

---

## Task 9 — ShootingPlanPage + DayBalanceTimeline

**Files:**

- Create: `apps/web/app/features/shooting-plan/components/ShootingPlanPage.tsx`
- Create: `apps/web/app/features/shooting-plan/components/ShootingPlanPage.module.css`
- Create: `apps/web/app/features/shooting-plan/components/DayBalanceTimeline.tsx`
- Create: `apps/web/app/features/shooting-plan/components/DayBalanceTimeline.module.css`

- [ ] **Step 1: Write `ShootingPlanPage`**

```tsx
// apps/web/app/features/shooting-plan/components/ShootingPlanPage.tsx
import { useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { scheduleQueryOptions } from "~/features/schedule/server/schedule.server";
import { DayBalanceTimeline } from "./DayBalanceTimeline";
import type { ShootingDayView } from "~/features/schedule/server/schedule.server";
import styles from "./ShootingPlanPage.module.css";

interface ShootingPlanPageProps {
  projectId: string;
}

export function ShootingPlanPage({ projectId }: ShootingPlanPageProps) {
  const { data } = useSuspenseQuery(scheduleQueryOptions(projectId));
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);

  const schedule = data?.isOk ? data.value : null;
  const shootDays =
    schedule?.shootingDays.filter((d) => d.dayType === "shoot") ?? [];
  const selectedDay =
    shootDays.find((d) => d.id === selectedDayId) ?? shootDays[0] ?? null;

  if (!schedule) {
    return (
      <div className={styles.empty}>
        <p>Genera prima uno schedule per pianificare le riprese.</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Piano di Ripresa</h1>
      </header>
      <div className={styles.body}>
        {/* Day picker sidebar */}
        <aside className={styles.daySidebar}>
          <div className={styles.sidebarLabel}>Giorni di ripresa</div>
          {shootDays.map((day) => (
            <button
              key={day.id}
              type="button"
              className={styles.dayItem}
              data-active={day.id === (selectedDay?.id ?? null) || undefined}
              onClick={() => {
                setSelectedDayId(day.id);
                setSelectedSceneId(null);
              }}
            >
              <span className={styles.dayName}>GG {day.dayNumber}</span>
              <span className={styles.dayMeta}>{day.strips.length} scene</span>
              <span className={styles.dayHours}>
                {day.totalHours.toFixed(1)}h / 8h
              </span>
            </button>
          ))}
        </aside>

        {/* Main area */}
        <main className={styles.main}>
          {selectedDay && (
            <DayBalanceTimeline
              day={selectedDay}
              projectId={projectId}
              selectedSceneId={selectedSceneId}
              onSelectScene={setSelectedSceneId}
            />
          )}
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write `ShootingPlanPage.module.css`**

```css
/* apps/web/app/features/shooting-plan/components/ShootingPlanPage.module.css */
.page {
  display: flex;
  flex-direction: column;
  block-size: 100%;
  overflow: hidden;
}

.header {
  display: flex;
  align-items: center;
  padding: var(--space-4) var(--space-6);
  border-block-end: 1px solid var(--color-border);
  flex-shrink: 0;
}

.title {
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--color-text);
  margin: 0;
}

.body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.daySidebar {
  inline-size: 200px;
  flex-shrink: 0;
  border-inline-end: 1px solid var(--color-border);
  overflow-y: auto;
  padding: var(--space-3);
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.sidebarLabel {
  font-size: var(--text-xs);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text-muted);
  padding-block-end: var(--space-2);
}

.dayItem {
  display: flex;
  flex-direction: column;
  gap: 2px;
  inline-size: 100%;
  text-align: start;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  background: none;
  border: 1px solid transparent;
  cursor: pointer;
  color: var(--color-text-secondary);

  &:hover {
    background: var(--color-surface-hover);
  }

  &[data-active] {
    background: var(--color-surface-active);
    border-color: var(--color-border-accent);
    color: var(--color-text);
  }
}

.dayName {
  font-size: var(--text-sm);
  font-weight: 600;
}
.dayMeta {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}
.dayHours {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

.main {
  flex: 1;
  overflow: auto;
  padding: var(--space-4) var(--space-6);
}

.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  block-size: 100%;
  color: var(--color-text-muted);
}
```

- [ ] **Step 3: Write `DayBalanceTimeline`**

```tsx
// apps/web/app/features/shooting-plan/components/DayBalanceTimeline.tsx
import type {
  ShootingDayView,
  StripView,
} from "~/features/schedule/server/schedule.server";
import styles from "./DayBalanceTimeline.module.css";

const MAX_HOURS = 8;

interface DayBalanceTimelineProps {
  day: ShootingDayView;
  projectId: string;
  selectedSceneId: string | null;
  onSelectScene: (sceneId: string) => void;
}

export function DayBalanceTimeline({
  day,
  selectedSceneId,
  onSelectScene,
}: DayBalanceTimelineProps) {
  const totalHours = day.totalHours;
  const isOverCapacity = totalHours > MAX_HOURS;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.label}>
          GG {day.dayNumber} — bilanciamento giorno
        </span>
        <span className={styles.total} data-over={isOverCapacity || undefined}>
          {totalHours.toFixed(1)}h / {MAX_HOURS}h
        </span>
      </div>

      <div className={styles.bars}>
        {day.strips.map((strip) => (
          <SceneBar
            key={strip.id}
            strip={strip}
            isSelected={strip.sceneId === selectedSceneId}
            onSelect={() => onSelectScene(strip.sceneId)}
          />
        ))}
      </div>

      <div className={styles.ruler}>
        {[0, 2, 4, 6, 8].map((h) => (
          <span key={h} style={{ inlineSize: `${(h / MAX_HOURS) * 100}%` }}>
            {h}h
          </span>
        ))}
      </div>
    </div>
  );
}

function SceneBar({
  strip,
  isSelected,
  onSelect,
}: {
  strip: StripView;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const pct = Math.min((strip.resolvedHours / MAX_HOURS) * 100, 100);
  const hasShots = strip.resolvedHours > 0;

  return (
    <button
      type="button"
      className={styles.sceneRow}
      data-selected={isSelected || undefined}
      onClick={onSelect}
    >
      <span className={styles.sceneName}>
        SC.{strip.sceneNumber} {strip.location}
      </span>
      <span className={styles.barTrack}>
        <span
          className={styles.barFill}
          style={{ inlineSize: `${pct}%` }}
          data-empty={!hasShots || undefined}
        />
        {hasShots && (
          <span className={styles.barLabel}>
            {(strip.resolvedHours * 60).toFixed(0)}m
          </span>
        )}
      </span>
    </button>
  );
}
```

- [ ] **Step 4: Write `DayBalanceTimeline.module.css`**

```css
/* apps/web/app/features/shooting-plan/components/DayBalanceTimeline.module.css */
.container {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.label {
  font-size: var(--text-xs);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text-muted);
}

.total {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-success);

  &[data-over] {
    color: var(--color-error);
  }
}

.bars {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.sceneRow {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  inline-size: 100%;
  background: none;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  padding: var(--space-2);
  cursor: pointer;
  text-align: start;

  &:hover {
    background: var(--color-surface-hover);
  }
  &[data-selected] {
    border-color: var(--color-border-accent);
    background: var(--color-surface-active);
  }
}

.sceneName {
  inline-size: 140px;
  flex-shrink: 0;
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.barTrack {
  flex: 1;
  block-size: 20px;
  background: var(--color-surface-inset);
  border-radius: var(--radius-md);
  position: relative;
  overflow: hidden;
}

.barFill {
  position: absolute;
  inset-block: 0;
  inset-inline-start: 0;
  background: var(--color-accent);
  border-radius: var(--radius-md);
  transition: inline-size 200ms ease;

  &[data-empty] {
    background: transparent;
    border: 1px dashed var(--color-border);
  }
}

.barLabel {
  position: absolute;
  inset-inline-end: var(--space-2);
  inset-block: 0;
  display: flex;
  align-items: center;
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

.ruler {
  display: flex;
  justify-content: space-between;
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  padding-inline-start: 140px;
}
```

- [ ] **Step 5: Start dev server, navigate to Piano di Ripresa, verify day sidebar + balance bars render**

```bash
pnpm dev
# open http://localhost:3000/projects/<id>/shooting-plan
```

Expected: day sidebar shows shooting days, balance bars show scene distribution.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/features/shooting-plan/components/ShootingPlanPage.tsx \
        apps/web/app/features/shooting-plan/components/ShootingPlanPage.module.css \
        apps/web/app/features/shooting-plan/components/DayBalanceTimeline.tsx \
        apps/web/app/features/shooting-plan/components/DayBalanceTimeline.module.css
git commit -m "[OHW] feat(shooting-plan): ShootingPlanPage + DayBalanceTimeline (compare C)"
```

---

## Task 10 — SceneShotTimeline + ShotBlock + ScenarioTabs

**Files:**

- Create: `apps/web/app/features/shooting-plan/components/SceneShotTimeline.tsx`
- Create: `apps/web/app/features/shooting-plan/components/SceneShotTimeline.module.css`
- Create: `apps/web/app/features/shooting-plan/components/ShotBlock.tsx`
- Create: `apps/web/app/features/shooting-plan/components/ShotBlock.module.css`
- Create: `apps/web/app/features/shooting-plan/components/ScenarioTabs.tsx`
- Create: `apps/web/app/features/shooting-plan/components/ScenarioTabs.module.css`
- Create: `apps/web/app/features/shooting-plan/components/TransitionBlock.tsx`
- Create: `apps/web/app/features/shooting-plan/components/TransitionBlock.module.css`
- Modify: `apps/web/app/features/shooting-plan/components/ShootingPlanPage.tsx`

- [ ] **Step 1: Write `ScenarioTabs`**

```tsx
// apps/web/app/features/shooting-plan/components/ScenarioTabs.tsx
import type { ScenarioView } from "../server/shooting-plan.server";
import styles from "./ScenarioTabs.module.css";

interface ScenarioTabsProps {
  scenarios: ScenarioView[];
  activeScenarioId: string | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
}

export function ScenarioTabs({
  scenarios,
  activeScenarioId,
  onSelect,
  onAdd,
}: ScenarioTabsProps) {
  return (
    <div className={styles.tabs}>
      {scenarios.map((sc) => (
        <button
          key={sc.id}
          type="button"
          className={styles.tab}
          data-active={sc.id === activeScenarioId || undefined}
          onClick={() => onSelect(sc.id)}
        >
          {sc.name}
          <span className={styles.duration}>{sc.totalMinutes}m</span>
        </button>
      ))}
      <button type="button" className={styles.addTab} onClick={onAdd}>
        + scenario
      </button>
    </div>
  );
}
```

```css
/* apps/web/app/features/shooting-plan/components/ScenarioTabs.module.css */
.tabs {
  display: flex;
  gap: var(--space-1);
  align-items: flex-end;
  border-block-end: 1px solid var(--color-border);
  padding-block-end: 0;
}

.tab {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: var(--color-surface-inset);
  border: 1px solid var(--color-border);
  border-block-end: none;
  border-radius: var(--radius-md) var(--radius-md) 0 0;
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  cursor: pointer;

  &[data-active] {
    background: var(--color-surface);
    color: var(--color-text);
    border-color: var(--color-border-accent);
  }
}

.duration {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

.addTab {
  padding: var(--space-2) var(--space-3);
  background: none;
  border: 1px dashed var(--color-border);
  border-block-end: none;
  border-radius: var(--radius-md) var(--radius-md) 0 0;
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  cursor: pointer;

  &:hover {
    color: var(--color-text);
  }
}
```

- [ ] **Step 2: Write `ShotBlock`**

```tsx
// apps/web/app/features/shooting-plan/components/ShotBlock.tsx
import type { ShotView } from "../server/shooting-plan.server";
import styles from "./ShotBlock.module.css";

const SHOT_SIZE_COLORS: Record<string, string> = {
  EWS: "var(--color-accent-green)",
  WS: "var(--color-accent-green)",
  MS: "var(--color-accent-blue)",
  MCU: "var(--color-accent-blue)",
  OTS: "var(--color-accent-blue)",
  TWO_SHOT: "var(--color-accent-blue)",
  CU: "var(--color-accent-red)",
  ECU: "var(--color-accent-red)",
  INSERT: "var(--color-accent-orange)",
  POV: "var(--color-accent-purple)",
};

interface ShotBlockProps {
  shot: ShotView;
  totalMinutes: number;
  isSelected: boolean;
  onSelect: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}

export function ShotBlock({
  shot,
  totalMinutes,
  isSelected,
  onSelect,
  onDragStart,
  onDragOver,
  onDrop,
}: ShotBlockProps) {
  const widthPct =
    totalMinutes > 0 ? (shot.resolvedMinutes / totalMinutes) * 100 : 10;
  const color = SHOT_SIZE_COLORS[shot.shotSize] ?? "var(--color-accent)";

  return (
    <div
      className={styles.block}
      style={{
        inlineSize: `${Math.max(widthPct, 4)}%`,
        borderInlineStartColor: color,
      }}
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      data-selected={isSelected || undefined}
      onClick={onSelect}
      title={`${shot.shotSize} ${shot.cameraMovement} — ${shot.resolvedMinutes}m`}
    >
      <span className={styles.size}>{shot.shotSize}</span>
      <span className={styles.movement}>{shot.cameraMovement}</span>
      <span className={styles.duration}>{shot.resolvedMinutes}m</span>
    </div>
  );
}
```

```css
/* apps/web/app/features/shooting-plan/components/ShotBlock.module.css */
.block {
  block-size: 100%;
  min-inline-size: 40px;
  background: var(--color-surface-inset);
  border: 1px solid var(--color-border);
  border-inline-start: 3px solid var(--color-accent);
  border-radius: var(--radius-md);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  cursor: grab;
  user-select: none;
  transition: background 100ms ease;
  padding: var(--space-1);

  &:hover {
    background: var(--color-surface-hover);
  }
  &[data-selected] {
    outline: 2px solid var(--color-border-accent);
  }
  &:active {
    cursor: grabbing;
  }
}

.size {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--color-text);
}
.movement {
  font-size: 9px;
  color: var(--color-text-muted);
}
.duration {
  font-size: 9px;
  color: var(--color-text-muted);
}
```

- [ ] **Step 3: Write `TransitionBlock`**

```tsx
// apps/web/app/features/shooting-plan/components/TransitionBlock.tsx
import type { TransitionSlotView } from "../server/shooting-plan.server";
import styles from "./TransitionBlock.module.css";

const TRANSITION_ICONS: Record<string, string> = {
  SETUP_CHANGE: "⟳",
  MAKEUP_COSTUME: "💄",
  BREAK: "☕",
  TRAVEL: "🚐",
};

interface TransitionBlockProps {
  transition: TransitionSlotView;
  onEdit: () => void;
}

export function TransitionBlock({ transition, onEdit }: TransitionBlockProps) {
  const icon = TRANSITION_ICONS[transition.type] ?? "⟳";
  return (
    <button
      type="button"
      className={styles.block}
      data-type={transition.type.toLowerCase()}
      onClick={onEdit}
      title={transition.label ?? transition.type}
    >
      <span className={styles.icon}>{icon}</span>
      <span className={styles.minutes}>{transition.resolvedMinutes}m</span>
    </button>
  );
}
```

```css
/* apps/web/app/features/shooting-plan/components/TransitionBlock.module.css */
.block {
  block-size: 100%;
  min-inline-size: 32px;
  background: var(--color-surface-inset);
  border-block: 1px solid var(--color-border);
  border-inline: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  cursor: pointer;
  padding: var(--space-1);
  position: relative;

  &::before {
    content: "";
    position: absolute;
    inset-block-start: 0;
    inset-inline: 0;
    block-size: 2px;
    background: currentColor;
    opacity: 0.4;
  }

  &[data-type="setup_change"] {
    color: var(--color-accent-blue);
  }
  &[data-type="makeup_costume"] {
    color: var(--color-accent-red);
  }
  &[data-type="break"] {
    color: var(--color-accent-green);
  }
}

.icon {
  font-size: var(--text-sm);
}
.minutes {
  font-size: 9px;
  opacity: 0.7;
}
```

- [ ] **Step 4: Write `SceneShotTimeline`**

```tsx
// apps/web/app/features/shooting-plan/components/SceneShotTimeline.tsx
import { useState } from "react";
import {
  useSuspenseQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { unwrapResult } from "@oh-writers/utils";
import {
  shotPlanQueryOptions,
  createShotPlanAndScenario,
  setActiveScenario,
  addShot,
  reorderShots,
} from "../server/shooting-plan.server";
import { ScenarioTabs } from "./ScenarioTabs";
import { ShotBlock } from "./ShotBlock";
import { TransitionBlock } from "./TransitionBlock";
import type {
  ShotView,
  TransitionSlotView,
} from "../server/shooting-plan.server";
import styles from "./SceneShotTimeline.module.css";

interface SceneShotTimelineProps {
  sceneId: string;
  projectId: string;
  sceneLabel: string;
  shotPlanId?: string;
}

export function SceneShotTimeline({
  sceneId,
  projectId,
  sceneLabel,
  shotPlanId: _shotPlanId,
}: SceneShotTimelineProps) {
  const qc = useQueryClient();
  const { data } = useSuspenseQuery(shotPlanQueryOptions(sceneId, projectId));
  const plan = data?.isOk ? data.value : null;

  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(
    plan?.activeScenarioId ?? null,
  );
  const [dragShotId, setDragShotId] = useState<string | null>(null);
  const [selectedShotId, setSelectedShotId] = useState<string | null>(null);

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["shot-plan", sceneId] });

  const createMutation = useMutation({
    mutationFn: (name: string) =>
      createShotPlanAndScenario({
        data: { sceneId, projectId, scenarioName: name },
      }).then(unwrapResult),
    onSuccess: (result) => {
      setSelectedScenarioId(result.activeScenarioId);
      void invalidate();
    },
  });

  const setActiveMutation = useMutation({
    mutationFn: (scenarioId: string) =>
      setActiveScenario({
        data: { shotPlanId: plan!.id, scenarioId, projectId },
      }).then(unwrapResult),
    onSuccess: invalidate,
  });

  const addShotMutation = useMutation({
    mutationFn: () =>
      addShot({
        data: {
          scenarioId: currentScenario!.id,
          shotPlanId: plan!.id,
          projectId,
          shotSize: "MS",
          cameraMovement: "STATIC",
          estimatedMinutes: null,
          notes: null,
          cameraLabel: "A",
        },
      }).then(unwrapResult),
    onSuccess: invalidate,
  });

  const reorderMutation = useMutation({
    mutationFn: (orderedIds: string[]) =>
      reorderShots({
        data: {
          scenarioId: currentScenario!.id,
          shotPlanId: plan!.id,
          projectId,
          orderedIds,
        },
      }).then(unwrapResult),
    onSuccess: invalidate,
  });

  const currentScenario = plan?.scenarios.find(
    (s) => s.id === (selectedScenarioId ?? plan.activeScenarioId),
  );
  const totalMinutes = currentScenario?.totalMinutes ?? 0;

  const handleDrop = (targetShotId: string) => {
    if (!dragShotId || !currentScenario) return;
    const ids = currentScenario.shots.map((s) => s.id);
    const from = ids.indexOf(dragShotId);
    const to = ids.indexOf(targetShotId);
    if (from === to) return;
    const reordered = [...ids];
    reordered.splice(from, 1);
    reordered.splice(to, 0, dragShotId);
    reorderMutation.mutate(reordered);
    setDragShotId(null);
  };

  const interleaved = interleave(
    currentScenario?.shots ?? [],
    currentScenario?.transitions ?? [],
  );

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.sceneLabel}>{sceneLabel}</span>
        <span className={styles.total}>{totalMinutes}m total</span>
      </div>

      {plan ? (
        <>
          <ScenarioTabs
            scenarios={plan.scenarios}
            activeScenarioId={plan.activeScenarioId}
            onSelect={(id) => {
              setSelectedScenarioId(id);
              setActiveMutation.mutate(id);
            }}
            onAdd={() =>
              createMutation.mutate(
                `Piano ${String.fromCharCode(65 + plan.scenarios.length)}`,
              )
            }
          />
          <div className={styles.canvas}>
            {/* Time ruler */}
            <div className={styles.rulerRow}>
              <div className={styles.trackLabel} />
              <div className={styles.ruler}>
                {[0, 25, 50, 75, 100].map((pct) => {
                  const mins = Math.round((pct / 100) * totalMinutes);
                  return (
                    <span key={pct} style={{ inlineSize: `${pct}%` }}>
                      {mins}m
                    </span>
                  );
                })}
              </div>
            </div>

            {/* Camera A track */}
            <div className={styles.track}>
              <span className={styles.trackLabel}>Cam A</span>
              <div className={styles.trackBlocks} style={{ blockSize: "48px" }}>
                {interleaved.map((item) =>
                  item.kind === "shot" ? (
                    <ShotBlock
                      key={item.shot.id}
                      shot={item.shot}
                      totalMinutes={totalMinutes}
                      isSelected={item.shot.id === selectedShotId}
                      onSelect={() => setSelectedShotId(item.shot.id)}
                      onDragStart={() => setDragShotId(item.shot.id)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => handleDrop(item.shot.id)}
                    />
                  ) : (
                    <TransitionBlock
                      key={item.transition.id}
                      transition={item.transition}
                      onEdit={() => {}}
                    />
                  ),
                )}
                <button
                  type="button"
                  className={styles.addShot}
                  onClick={() => addShotMutation.mutate()}
                >
                  +
                </button>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className={styles.empty}>
          <button
            type="button"
            className={styles.startBtn}
            onClick={() => createMutation.mutate("Piano A")}
          >
            Inizia piano di ripresa
          </button>
        </div>
      )}
    </div>
  );
}

// Interleave shots and transitions by afterShotId ordering
function interleave(
  shots: ShotView[],
  transitions: TransitionSlotView[],
): Array<
  | { kind: "shot"; shot: ShotView }
  | { kind: "transition"; transition: TransitionSlotView }
> {
  const result: Array<
    | { kind: "shot"; shot: ShotView }
    | { kind: "transition"; transition: TransitionSlotView }
  > = [];
  for (const shot of shots) {
    result.push({ kind: "shot", shot });
    const after = transitions.filter((t) => t.afterShotId === shot.id);
    for (const t of after) result.push({ kind: "transition", transition: t });
  }
  return result;
}
```

- [ ] **Step 5: Write `SceneShotTimeline.module.css`**

```css
/* apps/web/app/features/shooting-plan/components/SceneShotTimeline.module.css */
.container {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-3) var(--space-4);
  background: var(--color-surface-inset);
  border-block-end: 1px solid var(--color-border);
}

.sceneLabel {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text);
}
.total {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

.canvas {
  padding: var(--space-3) var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.rulerRow {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.ruler {
  flex: 1;
  display: flex;
  justify-content: space-between;
  font-size: 9px;
  color: var(--color-text-muted);
}

.trackLabel {
  inline-size: 48px;
  flex-shrink: 0;
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

.track {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.trackBlocks {
  flex: 1;
  display: flex;
  gap: 2px;
  align-items: stretch;
}

.addShot {
  min-inline-size: 28px;
  block-size: 100%;
  background: var(--color-surface-inset);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
  cursor: pointer;
  font-size: var(--text-sm);

  &:hover {
    color: var(--color-text);
    background: var(--color-surface-hover);
  }
}

.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-8);
}

.startBtn {
  padding: var(--space-2) var(--space-4);
  background: var(--color-accent);
  color: var(--color-on-accent);
  border: none;
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  cursor: pointer;
}
```

- [ ] **Step 6: Wire `SceneShotTimeline` into `ShootingPlanPage`**

In `ShootingPlanPage.tsx`, add the import and render `SceneShotTimeline` below `DayBalanceTimeline` when a scene is selected:

```tsx
import { SceneShotTimeline } from "./SceneShotTimeline";
// ...
{
  selectedSceneId &&
    selectedDay &&
    (() => {
      const strip = selectedDay.strips.find(
        (s) => s.sceneId === selectedSceneId,
      );
      if (!strip) return null;
      return (
        <SceneShotTimeline
          key={selectedSceneId}
          sceneId={selectedSceneId}
          projectId={projectId}
          sceneLabel={`SC.${strip.sceneNumber} ${strip.location}`}
        />
      );
    })();
}
```

- [ ] **Step 7: Start dev server, test the full flow**

```bash
pnpm dev
```

Verify:

1. Click a day → balance bars appear
2. Click a scene bar → SceneShotTimeline appears below
3. Click "Inizia piano di ripresa" → scenario is created, tabs appear
4. Click "+ (add shot)" → MS STATIC shot appears on track
5. Drag shot → reorder works

- [ ] **Step 8: Commit**

```bash
git add apps/web/app/features/shooting-plan/components/
git commit -m "[OHW] feat(shooting-plan): SceneShotTimeline, ShotBlock, TransitionBlock, ScenarioTabs"
```

---

## Task 11 — ShotDetailPanel (inline editing)

**Files:**

- Create: `apps/web/app/features/shooting-plan/components/ShotDetailPanel.tsx`
- Create: `apps/web/app/features/shooting-plan/components/ShotDetailPanel.module.css`
- Modify: `apps/web/app/features/shooting-plan/components/SceneShotTimeline.tsx`

- [ ] **Step 1: Write `ShotDetailPanel`**

```tsx
// apps/web/app/features/shooting-plan/components/ShotDetailPanel.tsx
import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { unwrapResult } from "@oh-writers/utils";
import { ShotSizes, CameraMovements, CameraLabels } from "@oh-writers/domain";
import { updateShot, deleteShot } from "../server/shooting-plan.server";
import type { ShotView } from "../server/shooting-plan.server";
import styles from "./ShotDetailPanel.module.css";

interface ShotDetailPanelProps {
  shot: ShotView;
  shotPlanId: string;
  projectId: string;
  sceneId: string;
  onClose: () => void;
}

export function ShotDetailPanel({
  shot,
  shotPlanId,
  projectId,
  sceneId,
  onClose,
}: ShotDetailPanelProps) {
  const qc = useQueryClient();
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["shot-plan", sceneId] });

  const [minutes, setMinutes] = useState<string>(
    shot.estimatedMinutes?.toString() ?? "",
  );

  useEffect(() => {
    setMinutes(shot.estimatedMinutes?.toString() ?? "");
  }, [shot.id, shot.estimatedMinutes]);

  const updateMutation = useMutation({
    mutationFn: (patch: Parameters<typeof updateShot>[0]["data"]["patch"]) =>
      updateShot({
        data: { shotId: shot.id, shotPlanId, projectId, patch },
      }).then(unwrapResult),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: () =>
      deleteShot({ data: { shotId: shot.id, shotPlanId, projectId } }).then(
        unwrapResult,
      ),
    onSuccess: () => {
      onClose();
      void invalidate();
    },
  });

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>Shot {shot.position + 1}</span>
        <button type="button" className={styles.close} onClick={onClose}>
          ✕
        </button>
      </div>

      <div className={styles.fields}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Dimensione</span>
          <select
            className={styles.select}
            value={shot.shotSize}
            onChange={(e) =>
              updateMutation.mutate({ shotSize: e.target.value })
            }
          >
            {Object.values(ShotSizes).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Movimento</span>
          <select
            className={styles.select}
            value={shot.cameraMovement}
            onChange={(e) =>
              updateMutation.mutate({ cameraMovement: e.target.value })
            }
          >
            {Object.values(CameraMovements).map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Camera</span>
          <select
            className={styles.select}
            value={shot.cameraLabel}
            onChange={(e) =>
              updateMutation.mutate({ cameraLabel: e.target.value })
            }
          >
            {Object.values(CameraLabels).map((c) => (
              <option key={c} value={c}>
                Cam {c}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>
            Minuti
            <span className={styles.autoHint}>
              auto: {shot.resolvedMinutes}m
            </span>
          </span>
          <input
            type="number"
            className={styles.input}
            min={1}
            max={480}
            step={5}
            placeholder={`${shot.resolvedMinutes} (auto)`}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            onBlur={() => {
              const v = minutes === "" ? null : Number(minutes);
              updateMutation.mutate({ estimatedMinutes: v });
            }}
          />
          {minutes !== "" && (
            <button
              type="button"
              className={styles.resetBtn}
              onClick={() => {
                setMinutes("");
                updateMutation.mutate({ estimatedMinutes: null });
              }}
            >
              reset auto
            </button>
          )}
        </label>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Note</span>
          <textarea
            className={styles.textarea}
            defaultValue={shot.notes ?? ""}
            onBlur={(e) =>
              updateMutation.mutate({ notes: e.target.value || null })
            }
            rows={3}
          />
        </label>
      </div>

      <button
        type="button"
        className={styles.deleteBtn}
        onClick={() => deleteMutation.mutate()}
      >
        Elimina shot
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Write `ShotDetailPanel.module.css`**

```css
/* apps/web/app/features/shooting-plan/components/ShotDetailPanel.module.css */
.panel {
  inline-size: 280px;
  flex-shrink: 0;
  border-inline-start: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  background: var(--color-surface);
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-3) var(--space-4);
  border-block-end: 1px solid var(--color-border);
}

.title {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text);
}

.close {
  background: none;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  font-size: var(--text-sm);
  &:hover {
    color: var(--color-text);
  }
}

.fields {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-4);
  flex: 1;
  overflow-y: auto;
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.fieldLabel {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: var(--text-xs);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text-muted);
}

.autoHint {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  text-transform: none;
}

.select,
.input {
  background: var(--color-surface-inset);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-2);
  font-size: var(--text-sm);
  color: var(--color-text);
  inline-size: 100%;
}

.textarea {
  background: var(--color-surface-inset);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-2);
  font-size: var(--text-sm);
  color: var(--color-text);
  resize: vertical;
  inline-size: 100%;
}

.resetBtn {
  font-size: var(--text-xs);
  color: var(--color-accent);
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  text-align: start;
}

.deleteBtn {
  margin: var(--space-4);
  padding: var(--space-2);
  background: none;
  border: 1px solid var(--color-error);
  border-radius: var(--radius-md);
  color: var(--color-error);
  font-size: var(--text-sm);
  cursor: pointer;

  &:hover {
    background: var(--color-error);
    color: var(--color-on-error);
  }
}
```

- [ ] **Step 3: Wire into `SceneShotTimeline`**

In `SceneShotTimeline.tsx`:

```tsx
import { ShotDetailPanel } from "./ShotDetailPanel";

// In the return, wrap canvas + panel in a flex row:
<div className={styles.body}>
  <div className={styles.canvas}>{/* ... existing canvas content ... */}</div>
  {selectedShotId &&
    currentScenario &&
    (() => {
      const shot = currentScenario.shots.find((s) => s.id === selectedShotId);
      if (!shot) return null;
      return (
        <ShotDetailPanel
          shot={shot}
          shotPlanId={plan!.id}
          projectId={projectId}
          sceneId={sceneId}
          onClose={() => setSelectedShotId(null)}
        />
      );
    })()}
</div>;
```

Add to `SceneShotTimeline.module.css`:

```css
.body {
  display: flex;
  flex: 1;
  overflow: hidden;
}
```

- [ ] **Step 4: Test**

Click a shot block → ShotDetailPanel slides in. Change size/movement → shot updates and timeline refreshes. Clear minutes → resets to auto. Delete → shot removed.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/features/shooting-plan/components/ShotDetailPanel.tsx \
        apps/web/app/features/shooting-plan/components/ShotDetailPanel.module.css \
        apps/web/app/features/shooting-plan/components/SceneShotTimeline.tsx \
        apps/web/app/features/shooting-plan/components/SceneShotTimeline.module.css
git commit -m "[OHW] feat(shooting-plan): ShotDetailPanel inline editing"
```

---

## Task 12 — Playwright E2E tests

**Files:**

- Create: `tests/shooting-plan.spec.ts`

- [ ] **Step 1: Write E2E tests**

```typescript
// tests/shooting-plan.spec.ts
import { test, expect } from "@playwright/test";
import { createTestProject, loginAs } from "./helpers";

test.describe("Piano di Ripresa [OHW-022]", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "director@test.com");
    await createTestProject(page, { withSchedule: true });
  });

  test("navigates to Piano di Ripresa and shows day sidebar", async ({
    page,
  }) => {
    await page.click('[title="Piano di Ripresa"]');
    await expect(page.locator("h1")).toContainText("Piano di Ripresa");
    await expect(page.locator("button >> text=GG 1")).toBeVisible();
  });

  test("shows day balance bars after selecting a day", async ({ page }) => {
    await page.click('[title="Piano di Ripresa"]');
    await page.click("button >> text=GG 1");
    await expect(page.locator("[class*=sceneRow]").first()).toBeVisible();
  });

  test("creates shot plan and adds first shot", async ({ page }) => {
    await page.click('[title="Piano di Ripresa"]');
    await page.click("button >> text=GG 1");
    await page.click("[class*=sceneRow]");
    await page.click("text=Inizia piano di ripresa");
    await expect(page.locator("text=Piano A")).toBeVisible();
    await page.click("[class*=addShot]");
    await expect(page.locator("[class*=block]").first()).toBeVisible();
  });

  test("editing shot size updates the timeline block", async ({ page }) => {
    await page.click('[title="Piano di Ripresa"]');
    await page.click("button >> text=GG 1");
    await page.click("[class*=sceneRow]");
    await page.click("text=Inizia piano di ripresa");
    await page.click("[class*=addShot]");
    await page.click("[class*=block]");
    await page.selectOption("[class*=select]", "CU");
    await expect(page.locator("text=CU")).toBeVisible();
  });

  test("strip estimated_hours updates after shot is added", async ({
    page,
  }) => {
    await page.click('[title="Piano di Ripresa"]');
    await page.click("button >> text=GG 1");
    await page.click("[class*=sceneRow]");
    await page.click("text=Inizia piano di ripresa");
    await page.click("[class*=addShot]");
    // Navigate to schedule and check strip effort
    await page.click('[title="Schedule"]');
    const stripHours = page.locator("[class*=hours]").first();
    await expect(stripHours).not.toBeEmpty();
  });

  test("Plan B scenario can be created and activated", async ({ page }) => {
    await page.click('[title="Piano di Ripresa"]');
    await page.click("button >> text=GG 1");
    await page.click("[class*=sceneRow]");
    await page.click("text=Inizia piano di ripresa");
    await page.click("text=+ scenario");
    await expect(page.locator("text=Piano B")).toBeVisible();
    await page.click("text=Piano B");
    // Piano B becomes active
    await expect(page.locator("[data-active] >> text=Piano B")).toBeVisible();
  });
});
```

- [ ] **Step 2: Run E2E tests**

```bash
pnpm test:e2e --grep "Piano di Ripresa"
```

Expected: all 5 tests pass. Fix any failures before marking complete.

- [ ] **Step 3: Commit**

```bash
git add tests/shooting-plan.spec.ts
git commit -m "[OHW] test(shooting-plan): Playwright E2E for shot plan flow"
```

---

## Self-Review Checklist

Run this mentally before declaring done:

- [ ] `inferTransitions` unit tests cover all 4 rule types
- [ ] `resolveShotMinutes` covers manual override + HANDHELD_ANY + size+movement key + fallback
- [ ] `syncStripEffort` is called from every write mutation
- [ ] `isManual: true` transitions are preserved through `rebuildAutoTransitions`
- [ ] Sidebar link appears between Schedule and Budget in Production section
- [ ] Empty state shown when no schedule exists yet
- [ ] Plan A/B switching triggers `syncStripEffort`
- [ ] Shot delete cleans up its transitions via DB cascade (`ON DELETE CASCADE`)
- [ ] `effortWeights` column nullable — falls back to domain defaults when null
