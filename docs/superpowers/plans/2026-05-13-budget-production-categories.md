# Budget Production Categories & Day Cost View — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add inferred production category sections (locations, fotografia, suono, scenografia, costumi, veicoli, comparse, VFX, stunt) to the budget page, with a "Per giornata" toggle view that shows cost per shooting day.

**Architecture:** `generateBudget` switches from delete+reinsert to upsert (preserving user-set `actual` values). Per-element categories (locations, vehicles) get per-element budget lines with schedule-based quantities; all other production categories get one aggregate line per category. The UI renders each category in its own accordion. A view toggle replaces the main column with a read-only per-day cost breakdown computed by `getDayCosts`.

**Tech Stack:** TanStack Start `createServerFn`, Drizzle ORM, neverthrow `ResultAsync`, TanStack Query, CSS Modules, Vitest, Playwright

---

## File Map

### New files
- `apps/web/app/features/budget/components/widgets/CategoryLineWidget.tsx` — accordion for aggregate category sections (fotografia, suono, scenografia, costumi, VFX, stunt, comparse)
- `apps/web/app/features/budget/components/widgets/CategoryLineWidget.module.css`
- `apps/web/app/features/budget/components/widgets/LocationsWidget.tsx` — per-element accordion for locations
- `apps/web/app/features/budget/components/widgets/LocationsWidget.module.css`
- `apps/web/app/features/budget/components/widgets/VehiclesWidget.tsx` — per-element accordion for vehicles
- `apps/web/app/features/budget/components/widgets/DayView.tsx` — read-only per-day cost view
- `apps/web/app/features/budget/components/widgets/DayView.module.css`

### Modified files
- `apps/web/app/features/budget/server/budget.server.ts` — upsert logic in `generateBudget`, new `getDayCosts`
- `apps/web/app/features/budget/components/BudgetPage.tsx` — view toggle, CategoryView, new widgets
- `apps/web/app/features/budget/components/BudgetPage.module.css` — toggle styles
- `apps/web/app/features/budget/components/widgets/TotalWidget.tsx` — per-category breakdown in sidebar

### Deleted files
- `apps/web/app/features/budget/components/widgets/EquipmentWidget.tsx` — replaced by CategoryLineWidget
- `apps/web/app/features/budget/components/widgets/EquipmentWidget.module.css`

---

## Task 1: Upsert logic in `generateBudget` + aggregate production lines

**Files:**
- Modify: `apps/web/app/features/budget/server/budget.server.ts`
- Test: `apps/web/app/features/budget/server/budget-upsert.test.ts`

The current `generateBudget` deletes all `budget_lines` then re-inserts — losing `actual` values the user has set. This task changes it to upsert:
- Per-element lines (locations, vehicles): match on `(budgetId, linkedElementId)`, update `quantity`/`rate`, preserve `actual`
- Aggregate lines (all other production categories): collapse all elements of a category into one line, match on `(budgetId, linkedCategory)` where `linkedElementId IS NULL`, preserve `actual`
- For per-element categories, quantity = number of shooting days where that element appears in at least one scheduled scene

The domain `generateBudgetLines` already creates per-element lines for all categories. We intercept before persisting.

- [ ] **Step 1: Write failing tests for the pure helpers**

Create `apps/web/app/features/budget/server/budget-upsert.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { aggregateProductionLines, PER_ELEMENT_CATEGORIES } from "./budget-helpers";
import type { GeneratedLine } from "@oh-writers/domain";

const makeLine = (overrides: Partial<GeneratedLine>): GeneratedLine => ({
  topSheet: "production",
  name: "Test",
  costType: "daily",
  quantity: 8,
  rate: 100,
  actual: null,
  notes: null,
  linkedElementId: "elem-1",
  linkedCategory: "equipment",
  sortOrder: 0,
  ...overrides,
});

describe("aggregateProductionLines", () => {
  it("keeps per-element categories as individual lines", () => {
    const lines = [
      makeLine({ linkedCategory: "locations", linkedElementId: "loc-1", name: "Via del Corso" }),
      makeLine({ linkedCategory: "locations", linkedElementId: "loc-2", name: "Studio" }),
    ];
    const result = aggregateProductionLines(lines);
    expect(result.perElement).toHaveLength(2);
    expect(result.aggregate).toHaveLength(0);
  });

  it("collapses non-per-element categories into one line per category", () => {
    const lines = [
      makeLine({ linkedCategory: "equipment", linkedElementId: "eq-1", name: "Camera A", quantity: 8, rate: 200 }),
      makeLine({ linkedCategory: "equipment", linkedElementId: "eq-2", name: "Camera B", quantity: 8, rate: 150 }),
      makeLine({ linkedCategory: "sound", linkedElementId: "snd-1", name: "Boom", quantity: 8, rate: 80 }),
    ];
    const result = aggregateProductionLines(lines);
    expect(result.aggregate).toHaveLength(2);
    const equip = result.aggregate.find(l => l.linkedCategory === "equipment")!;
    expect(equip.linkedElementId).toBeNull();
    expect(equip.quantity).toBe(2); // element count
    expect(equip.rate).toBe(350);   // sum of rates
  });

  it("preserves name as category label for aggregate lines", () => {
    const lines = [makeLine({ linkedCategory: "vfx", linkedElementId: "vfx-1", name: "Explosion" })];
    const result = aggregateProductionLines(lines);
    expect(result.aggregate[0]!.name).toBe("VFX / SFX");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd /Users/valerionarcisi/personal/oh-writers
pnpm --filter @oh-writers/web vitest run apps/web/app/features/budget/server/budget-upsert.test.ts
```

Expected: FAIL — `aggregateProductionLines` not found.

- [ ] **Step 3: Create `budget-helpers.ts` with pure helpers**

Create `apps/web/app/features/budget/server/budget-helpers.ts`:

```typescript
import type { GeneratedLine } from "@oh-writers/domain";

export const PER_ELEMENT_CATEGORIES = new Set([
  "locations",
  "vehicles",
]);

const AGGREGATE_CATEGORY_LABELS: Record<string, string> = {
  equipment: "Fotografia",
  sound: "Suono",
  props: "Scenografia",
  set_dress: "Scenografia",
  wardrobe: "Costumi & Make-up",
  makeup: "Costumi & Make-up",
  vfx: "VFX / SFX",
  sfx: "VFX / SFX",
  stunts: "Stunt",
  extras: "Comparse",
  atmosphere: "Comparse",
  animals: "Animali",
};

// Canonical category key for collapsing related categories together
const AGGREGATE_CATEGORY_KEY: Record<string, string> = {
  equipment: "equipment",
  sound: "sound",
  props: "props",
  set_dress: "props",         // collapsed into Scenografia
  wardrobe: "wardrobe",
  makeup: "wardrobe",         // collapsed into Costumi
  vfx: "vfx",
  sfx: "vfx",                 // collapsed into VFX/SFX
  stunts: "stunts",
  extras: "extras",
  atmosphere: "extras",       // collapsed into Comparse
  animals: "animals",
};

export type AggregatedLine = Omit<GeneratedLine, "linkedElementId"> & {
  linkedElementId: null;
  elementCount: number;
};

export type SplitLines = {
  perElement: GeneratedLine[];
  aggregate: AggregatedLine[];
};

export const aggregateProductionLines = (lines: GeneratedLine[]): SplitLines => {
  const perElement: GeneratedLine[] = [];
  const byKey = new Map<string, AggregatedLine>();

  for (const line of lines) {
    const cat = line.linkedCategory;
    if (!cat || cat === "cast") continue;

    if (PER_ELEMENT_CATEGORIES.has(cat)) {
      perElement.push(line);
      continue;
    }

    const key = AGGREGATE_CATEGORY_KEY[cat] ?? cat;
    const existing = byKey.get(key);
    if (existing) {
      existing.rate = (existing.rate ?? 0) + (line.rate ?? 0);
      existing.elementCount += 1;
    } else {
      byKey.set(key, {
        ...line,
        linkedElementId: null,
        linkedCategory: key,
        name: AGGREGATE_CATEGORY_LABELS[cat] ?? cat,
        quantity: 1, // will be overridden with element count
        elementCount: 1,
      });
    }
  }

  // Set quantity = element count for aggregate lines
  const aggregate = Array.from(byKey.values()).map((l) => ({
    ...l,
    quantity: l.elementCount,
  }));

  return { perElement, aggregate };
};
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @oh-writers/web vitest run apps/web/app/features/budget/server/budget-upsert.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 5: Update `generateBudget` in `budget.server.ts` to use upsert**

Replace the block that deletes and reinserts `budgetLines` (lines ~252–295 in the current file) with the upsert logic. The block currently inside the `ResultAsync.fromPromise` callback starting at `let budgetId: string;`:

```typescript
// Inside the ResultAsync.fromPromise callback, replace the budgetLines delete+insert section:

// 1. Split generated lines into per-element and aggregate
const { perElement, aggregate } = aggregateProductionLines(generatedLines);

// 2. Compute schedule-based day counts for per-element lines (locations, vehicles)
const scheduleData = await (async () => {
  const schedule = await db.query.schedules.findFirst({
    where: eq(schedules.projectId, data.projectId),
  });
  if (!schedule) return null;
  const dayRows = await db.query.shootingDays.findMany({
    where: eq(shootingDays.scheduleId, schedule.id),
  });
  const stripsRows = await db
    .select({
      shootingDayId: strips.shootingDayId,
      sceneId: strips.sceneId,
    })
    .from(strips)
    .where(eq(strips.scheduleId, schedule.id));
  // map sceneId → shootingDayIds
  const sceneTodays = new Map<string, Set<string>>();
  for (const s of stripsRows) {
    if (!s.shootingDayId) continue;
    const set = sceneTodays.get(s.sceneId) ?? new Set();
    set.add(s.shootingDayId);
    sceneTodays.set(s.sceneId, set);
  }
  return { dayCount: dayRows.length, sceneTodays };
})();

// 3. Upsert per-element lines (locations, vehicles)
for (const line of perElement) {
  // Override quantity with schedule-based day count for this element
  let qty = line.quantity;
  if (scheduleData && line.linkedElementId) {
    // find all scenes where this element appears
    const occurrences = await db
      .select({ sceneId: breakdownOccurrences.sceneId })
      .from(breakdownOccurrences)
      .where(eq(breakdownOccurrences.elementId, line.linkedElementId));
    const daySet = new Set<string>();
    for (const occ of occurrences) {
      const days = scheduleData.sceneTodays.get(occ.sceneId);
      if (days) for (const d of days) daySet.add(d);
    }
    qty = daySet.size > 0 ? daySet.size : line.quantity;
  }

  const existing = await db.query.budgetLines.findFirst({
    where: and(
      eq(budgetLines.budgetId, budgetId),
      eq(budgetLines.linkedElementId, line.linkedElementId!),
    ),
  });
  if (existing) {
    await db
      .update(budgetLines)
      .set({ quantity: String(qty), rate: String(line.rate ?? 0), updatedAt: new Date() })
      .where(eq(budgetLines.id, existing.id));
  } else {
    await db.insert(budgetLines).values({
      budgetId,
      topSheet: line.topSheet,
      name: line.name,
      costType: line.costType,
      quantity: String(qty),
      rate: String(line.rate ?? 0),
      actual: null,
      notes: null,
      linkedElementId: line.linkedElementId,
      linkedCategory: line.linkedCategory,
      sortOrder: line.sortOrder,
    });
  }
}

// 4. Upsert aggregate lines (one per collapsed category key)
for (const line of aggregate) {
  const existing = await db.query.budgetLines.findFirst({
    where: and(
      eq(budgetLines.budgetId, budgetId),
      eq(budgetLines.linkedCategory, line.linkedCategory!),
      isNull(budgetLines.linkedElementId),
    ),
  });
  if (existing) {
    await db
      .update(budgetLines)
      .set({ quantity: String(line.quantity ?? 0), rate: String(line.rate ?? 0), updatedAt: new Date() })
      .where(eq(budgetLines.id, existing.id));
  } else {
    await db.insert(budgetLines).values({
      budgetId,
      topSheet: line.topSheet,
      name: line.name,
      costType: line.costType,
      quantity: String(line.quantity ?? 0),
      rate: String(line.rate ?? 0),
      actual: null,
      notes: null,
      linkedElementId: null,
      linkedCategory: line.linkedCategory,
      sortOrder: line.sortOrder,
    });
  }
}
```

Also add the missing imports at the top of `budget.server.ts`:

```typescript
import { and, eq, isNull } from "drizzle-orm";
import { strips } from "@oh-writers/db/schema";
import { aggregateProductionLines } from "./budget-helpers";
```

And remove the old `await db.delete(budgetLines).where(eq(budgetLines.budgetId, budgetId));` line.

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd /Users/valerionarcisi/personal/oh-writers
pnpm --filter @oh-writers/web tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/features/budget/server/budget-helpers.ts \
        apps/web/app/features/budget/server/budget-upsert.test.ts \
        apps/web/app/features/budget/server/budget.server.ts
git commit -m "[OHW] feat(budget): upsert production lines preserving actual + aggregate by category"
```

---

## Task 2: Add `getDayCosts` server function

**Files:**
- Modify: `apps/web/app/features/budget/server/budget.server.ts`
- Test: `apps/web/app/features/budget/server/budget-day-costs.test.ts`

- [ ] **Step 1: Write failing test for the pure day cost computation helper**

Create `apps/web/app/features/budget/server/budget-day-costs.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { computeDayCosts } from "./budget-helpers";
import type { DayCostInput } from "./budget-helpers";

const baseInput: DayCostInput = {
  days: [
    { id: "day-1", dayNumber: 1, date: null, sceneIds: ["sc-1", "sc-2"] },
    { id: "day-2", dayNumber: 2, date: null, sceneIds: ["sc-3"] },
  ],
  totalShootingDays: 2,
  contingencyPercent: 10,
  castCostsByScene: {
    "sc-1": 1000,
    "sc-2": 500,
    "sc-3": 800,
  },
  totalCrewCost: 2000, // distributed evenly = 1000/day
  perElementLineCosts: [
    // location "Via del Corso" appears in sc-1
    { linkedCategory: "locations", sceneIds: ["sc-1"], effectiveTotal: 1200 },
    // vehicle appears in sc-2 and sc-3
    { linkedCategory: "vehicles", sceneIds: ["sc-2", "sc-3"], effectiveTotal: 400 },
  ],
  otherLinesTotalCost: 6000, // distributed evenly = 3000/day
};

describe("computeDayCosts", () => {
  it("distributes crew and other costs evenly across days", () => {
    const result = computeDayCosts(baseInput);
    expect(result[0]!.breakdown.crew).toBe(1000); // 2000 / 2
    expect(result[0]!.breakdown.other).toBe(3000); // 6000 / 2
    expect(result[1]!.breakdown.crew).toBe(1000);
    expect(result[1]!.breakdown.other).toBe(3000);
  });

  it("assigns cast cost per scene to the day containing that scene", () => {
    const result = computeDayCosts(baseInput);
    expect(result[0]!.breakdown.cast).toBe(1500); // sc-1 + sc-2
    expect(result[1]!.breakdown.cast).toBe(800);  // sc-3
  });

  it("adds location cost only on days with that location's scenes", () => {
    const result = computeDayCosts(baseInput);
    expect(result[0]!.breakdown.locations).toBe(1200); // Via del Corso in sc-1
    expect(result[1]!.breakdown.locations).toBe(0);    // not on day 2
  });

  it("adds vehicle cost on days containing any of its scenes", () => {
    const result = computeDayCosts(baseInput);
    expect(result[0]!.breakdown.vehicles).toBe(400); // sc-2 is on day 1
    expect(result[1]!.breakdown.vehicles).toBe(400); // sc-3 is on day 2
  });

  it("applies contingency to each day subtotal", () => {
    const result = computeDayCosts(baseInput);
    const day1Sub = 1500 + 1000 + 1200 + 400 + 3000;
    expect(result[0]!.breakdown.contingency).toBeCloseTo(day1Sub * 0.1);
    expect(result[0]!.total).toBeCloseTo(day1Sub * 1.1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
pnpm --filter @oh-writers/web vitest run apps/web/app/features/budget/server/budget-day-costs.test.ts
```

Expected: FAIL — `computeDayCosts` not found.

- [ ] **Step 3: Add `computeDayCosts` and related types to `budget-helpers.ts`**

Append to `apps/web/app/features/budget/server/budget-helpers.ts`:

```typescript
export type DayCostBreakdown = {
  cast: number;
  crew: number;
  locations: number;
  vehicles: number;
  other: number;
  contingency: number;
};

export type DayCost = {
  dayId: string;
  dayNumber: number;
  date: string | null;
  sceneIds: string[];
  breakdown: DayCostBreakdown;
  total: number;
};

export type PerElementLineCost = {
  linkedCategory: string;
  sceneIds: string[];   // scene IDs where this element appears
  effectiveTotal: number;
};

export type DayCostInput = {
  days: { id: string; dayNumber: number; date: string | null; sceneIds: string[] }[];
  totalShootingDays: number;
  contingencyPercent: number;
  castCostsByScene: Record<string, number>;
  totalCrewCost: number;
  perElementLineCosts: PerElementLineCost[];
  otherLinesTotalCost: number;
};

export const computeDayCosts = (input: DayCostInput): DayCost[] => {
  const {
    days,
    totalShootingDays,
    contingencyPercent,
    castCostsByScene,
    totalCrewCost,
    perElementLineCosts,
    otherLinesTotalCost,
  } = input;

  const crewPerDay = totalShootingDays > 0 ? totalCrewCost / totalShootingDays : 0;
  const otherPerDay = totalShootingDays > 0 ? otherLinesTotalCost / totalShootingDays : 0;

  return days.map((day) => {
    const sceneSet = new Set(day.sceneIds);

    const cast = day.sceneIds.reduce(
      (sum, sid) => sum + (castCostsByScene[sid] ?? 0),
      0,
    );

    const locations = perElementLineCosts
      .filter(
        (l) =>
          l.linkedCategory === "locations" &&
          l.sceneIds.some((sid) => sceneSet.has(sid)),
      )
      .reduce((sum, l) => sum + l.effectiveTotal, 0);

    const vehicles = perElementLineCosts
      .filter(
        (l) =>
          l.linkedCategory === "vehicles" &&
          l.sceneIds.some((sid) => sceneSet.has(sid)),
      )
      .reduce((sum, l) => sum + l.effectiveTotal, 0);

    const subtotal = cast + crewPerDay + locations + vehicles + otherPerDay;
    const contingency = subtotal * (contingencyPercent / 100);

    return {
      dayId: day.id,
      dayNumber: day.dayNumber,
      date: day.date,
      sceneIds: day.sceneIds,
      breakdown: {
        cast,
        crew: crewPerDay,
        locations,
        vehicles,
        other: otherPerDay,
        contingency,
      },
      total: subtotal + contingency,
    };
  });
};
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @oh-writers/web vitest run apps/web/app/features/budget/server/budget-day-costs.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 5: Add `getDayCosts` server function to `budget.server.ts`**

Append before the closing `export type` lines at the bottom of `budget.server.ts`:

```typescript
// ─── getDayCosts ──────────────────────────────────────────────────────────────

export type { DayCost } from "./budget-helpers";

export const getDayCosts = createServerFn({ method: "GET" })
  .validator(z.object({ projectId: z.string().uuid() }))
  .handler(
    async ({
      data,
    }): Promise<ResultShape<DayCost[], ForbiddenError | DbError>> => {
      const user = await requireUser();
      const db = await getDb();

      const access = await resolveBudgetAccessByProjectId(
        db,
        user.id,
        data.projectId,
      );
      if (access.isErr()) return toShape(err(access.error));
      if (!canView(access.value))
        return toShape(err(new ForbiddenError("view budget")));

      const result = await ResultAsync.fromPromise(
        (async (): Promise<DayCost[]> => {
          const schedule = await db.query.schedules.findFirst({
            where: eq(schedules.projectId, data.projectId),
          });
          if (!schedule) return [];

          const budget = await db.query.budgets.findFirst({
            where: eq(budgets.projectId, data.projectId),
          });
          if (!budget) return [];

          // Load all shooting days (shoot type only)
          const dayRows = await db.query.shootingDays.findMany({
            where: and(
              eq(shootingDays.scheduleId, schedule.id),
              eq(shootingDays.dayType, "shoot"),
            ),
            orderBy: (t) => t.dayNumber,
          });
          if (dayRows.length === 0) return [];

          // Load strips: shootingDayId → sceneId
          const stripRows = await db
            .select({
              shootingDayId: strips.shootingDayId,
              sceneId: strips.sceneId,
            })
            .from(strips)
            .where(eq(strips.scheduleId, schedule.id));

          const dayScenes = new Map<string, string[]>();
          for (const s of stripRows) {
            if (!s.shootingDayId) continue;
            const arr = dayScenes.get(s.shootingDayId) ?? [];
            arr.push(s.sceneId);
            dayScenes.set(s.shootingDayId, arr);
          }

          // Load cast rows + scene map for pro-rating
          const castRows = await db.query.budgetCast.findMany({
            where: eq(budgetCast.budgetId, budget.id),
          });
          // For each cast row, find which scene DB IDs they appear in
          const castSceneDbIds: Record<string, string[]> = {};
          for (const row of castRows) {
            if (!row.elementId) { castSceneDbIds[row.id] = []; continue; }
            const occs = await db
              .select({ sceneId: breakdownOccurrences.sceneId })
              .from(breakdownOccurrences)
              .where(eq(breakdownOccurrences.elementId, row.elementId));
            castSceneDbIds[row.id] = occs.map((o) => o.sceneId);
          }

          // Compute cast cost per scene DB ID
          const castCostsByScene: Record<string, number> = {};
          for (const row of castRows) {
            const sceneIds = castSceneDbIds[row.id] ?? [];
            if (sceneIds.length === 0) continue;
            const total =
              (Number(row.dayRate) * Number(row.days)) +
              Number(row.mealAllowance) +
              Number(row.accommodation);
            const perScene = sceneIds.length > 0 ? total / sceneIds.length : 0;
            for (const sid of sceneIds) {
              castCostsByScene[sid] = (castCostsByScene[sid] ?? 0) + perScene;
            }
          }

          // Total crew cost
          const crewRows = await db.query.budgetCrew.findMany({
            where: and(eq(budgetCrew.budgetId, budget.id), eq(budgetCrew.enabled, true)),
          });
          const totalCrewCost = crewRows.reduce(
            (sum, r) => sum + Number(r.dayRate) * Number(r.days) + Number(r.mealAllowance) + Number(r.accommodation),
            0,
          );

          // Load all production budget lines
          const prodLines = await db.query.budgetLines.findMany({
            where: and(
              eq(budgetLines.budgetId, budget.id),
              eq(budgetLines.topSheet, "production"),
            ),
          });

          // Per-element lines (locations + vehicles) with their scene IDs
          const perElementLineCosts: import("./budget-helpers").PerElementLineCost[] = [];
          let otherLinesTotalCost = 0;

          for (const line of prodLines) {
            const effective = line.actual !== null
              ? Number(line.actual)
              : (Number(line.quantity ?? 1) * Number(line.rate ?? 0));

            if (
              line.linkedElementId &&
              (line.linkedCategory === "locations" || line.linkedCategory === "vehicles")
            ) {
              const occs = await db
                .select({ sceneId: breakdownOccurrences.sceneId })
                .from(breakdownOccurrences)
                .where(eq(breakdownOccurrences.elementId, line.linkedElementId));
              perElementLineCosts.push({
                linkedCategory: line.linkedCategory,
                sceneIds: occs.map((o) => o.sceneId),
                effectiveTotal: effective,
              });
            } else {
              otherLinesTotalCost += effective;
            }
          }

          const days = dayRows.map((d) => ({
            id: d.id,
            dayNumber: d.dayNumber,
            date: d.date,
            sceneIds: dayScenes.get(d.id) ?? [],
          }));

          return computeDayCosts({
            days,
            totalShootingDays: dayRows.length,
            contingencyPercent: Number(budget.contingencyPercent),
            castCostsByScene,
            totalCrewCost,
            perElementLineCosts,
            otherLinesTotalCost,
          });
        })(),
        (e) => new DbError("getDayCosts", e),
      );

      return toShape(result);
    },
  );
```

Also add to the imports at the top of `budget.server.ts`:
```typescript
import { computeDayCosts, type PerElementLineCost, type DayCost } from "./budget-helpers";
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
pnpm --filter @oh-writers/web tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/features/budget/server/budget-helpers.ts \
        apps/web/app/features/budget/server/budget-day-costs.test.ts \
        apps/web/app/features/budget/server/budget.server.ts
git commit -m "[OHW] feat(budget): add getDayCosts server function"
```

---

## Task 3: `CategoryLineWidget` — aggregate section accordion

**Files:**
- Create: `apps/web/app/features/budget/components/widgets/CategoryLineWidget.tsx`
- Create: `apps/web/app/features/budget/components/widgets/CategoryLineWidget.module.css`

Reusable accordion widget for aggregate production categories (fotografia, suono, scenografia, costumi, VFX, stunt, comparse). Shows: section title, element count badge, total, and a single editable rate/actual row.

- [ ] **Step 1: Create `CategoryLineWidget.module.css`**

```css
.widget {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-3) var(--space-4);
  cursor: pointer;
  user-select: none;
  gap: var(--space-3);

  &:hover {
    background: var(--color-surface-raised);
  }
}

.headerLeft {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.icon {
  font-size: var(--text-base);
  line-height: 1;
}

.title {
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
  color: var(--color-fg);
}

.badge {
  font-size: var(--text-xs);
  color: var(--color-fg-muted);
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: 1px var(--space-2);
}

.headerRight {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.total {
  font-size: var(--text-sm);
  font-variant-numeric: tabular-nums;
  color: var(--color-fg-secondary);
}

.arrow {
  font-size: var(--text-xs);
  color: var(--color-fg-muted);
  transition: transform 150ms ease;

  &.open {
    transform: rotate(180deg);
  }
}

.body {
  border-block-start: 1px solid var(--color-border);
  padding: var(--space-3) var(--space-4);
}

.row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  font-size: var(--text-sm);
}

.rowLabel {
  flex: 1;
  color: var(--color-fg-muted);
}

.fieldGroup {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--text-xs);
  color: var(--color-fg-muted);
}

.cellBtn {
  all: unset;
  cursor: pointer;
  font-size: var(--text-sm);
  font-variant-numeric: tabular-nums;
  color: var(--color-fg-secondary);
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: 2px var(--space-2);
  min-width: 72px;
  text-align: right;

  &:hover {
    border-color: var(--color-accent);
  }
}

.cellInput {
  font-size: var(--text-sm);
  font-variant-numeric: tabular-nums;
  color: var(--color-fg);
  background: var(--color-surface-raised);
  border: 1px solid var(--color-accent);
  border-radius: var(--radius-sm);
  padding: 2px var(--space-2);
  min-width: 72px;
  text-align: right;
  outline: none;
}

.rowTotal {
  font-size: var(--text-sm);
  font-variant-numeric: tabular-nums;
  font-weight: var(--weight-semibold);
  color: var(--color-fg);
  min-width: 80px;
  text-align: right;
}

.aiHint {
  font-size: var(--text-xs);
  color: var(--color-fg-muted);
  font-style: italic;
}

@media (prefers-reduced-motion: reduce) {
  .arrow {
    transition: none;
  }
}
```

- [ ] **Step 2: Create `CategoryLineWidget.tsx`**

```tsx
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { unwrapResult } from "@oh-writers/utils";
import type { BudgetLine } from "~/features/budget/server/budget.server";
import { updateBudgetLine } from "~/features/budget/server/budget.server";
import styles from "./CategoryLineWidget.module.css";

const fmt = (n: number) =>
  n.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

const lineEffective = (l: BudgetLine): number =>
  l.actual ?? (l.rate ?? 0) * (l.quantity ?? 1);

interface CategoryLineWidgetProps {
  icon: string;
  title: string;
  line: BudgetLine | null;        // null when no line generated yet
  elementCount: number;
  projectId: string;
}

export function CategoryLineWidget({
  icon,
  title,
  line,
  elementCount,
  projectId,
}: CategoryLineWidgetProps) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingField, setEditingField] = useState<"rate" | "actual" | null>(null);
  const [draft, setDraft] = useState("");

  const patchMutation = useMutation({
    mutationFn: (vars: { lineId: string; patch: { actual?: number | null; rate?: number | null } }) =>
      updateBudgetLine({ data: vars }).then(unwrapResult),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["budget", projectId] });
      setEditingField(null);
    },
  });

  const total = line ? lineEffective(line) : 0;

  const commitField = (field: "rate" | "actual") => {
    if (!line) return;
    const n = parseFloat(draft);
    if (!isNaN(n) && n >= 0) {
      patchMutation.mutate({ lineId: line.id, patch: { [field]: n } });
    } else {
      setEditingField(null);
    }
  };

  return (
    <div className={styles.widget}>
      <div className={styles.header} onClick={() => setOpen((p) => !p)}>
        <div className={styles.headerLeft}>
          <span className={styles.icon}>{icon}</span>
          <span className={styles.title}>{title}</span>
          {elementCount > 0 && (
            <span className={styles.badge}>{elementCount} elementi</span>
          )}
        </div>
        <div className={styles.headerRight}>
          <span className={styles.total}>{fmt(total)}</span>
          <span className={`${styles.arrow} ${open ? styles.open : ""}`}>▾</span>
        </div>
      </div>

      {open && (
        <div className={styles.body}>
          {!line ? (
            <p className={styles.aiHint}>Genera il budget per popolare questa sezione.</p>
          ) : (
            <div className={styles.row}>
              <span className={styles.rowLabel}>
                {elementCount} {elementCount === 1 ? "elemento" : "elementi"} dal breakdown
              </span>
              <div className={styles.fieldGroup}>
                <span>Tariffa</span>
                {editingField === "rate" ? (
                  <input
                    className={styles.cellInput}
                    type="number"
                    min="0"
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => commitField("rate")}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitField("rate");
                      if (e.key === "Escape") setEditingField(null);
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className={styles.cellBtn}
                    onClick={() => { setDraft(String(line.rate ?? "")); setEditingField("rate"); }}
                  >
                    {line.rate !== null ? fmt(line.rate) : "—"}
                  </button>
                )}
              </div>
              <div className={styles.fieldGroup}>
                <span>Effettivo</span>
                {editingField === "actual" ? (
                  <input
                    className={styles.cellInput}
                    type="number"
                    min="0"
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => commitField("actual")}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitField("actual");
                      if (e.key === "Escape") setEditingField(null);
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className={styles.cellBtn}
                    onClick={() => { setDraft(String(line.actual ?? "")); setEditingField("actual"); }}
                  >
                    {line.actual !== null ? fmt(line.actual) : "—"}
                  </button>
                )}
              </div>
              <span className={styles.rowTotal}>{fmt(total)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
pnpm --filter @oh-writers/web tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/features/budget/components/widgets/CategoryLineWidget.tsx \
        apps/web/app/features/budget/components/widgets/CategoryLineWidget.module.css
git commit -m "[OHW] feat(budget): add CategoryLineWidget for aggregate production sections"
```

---

## Task 4: `LocationsWidget` and `VehiclesWidget` — per-element accordions

**Files:**
- Create: `apps/web/app/features/budget/components/widgets/LocationsWidget.tsx`
- Create: `apps/web/app/features/budget/components/widgets/LocationsWidget.module.css`
- Create: `apps/web/app/features/budget/components/widgets/VehiclesWidget.tsx`

`VehiclesWidget` reuses `LocationsWidget` with different title/icon props — no separate CSS file needed.

- [ ] **Step 1: Create `LocationsWidget.module.css`**

```css
.widget {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-3) var(--space-4);
  cursor: pointer;
  user-select: none;
  gap: var(--space-3);

  &:hover {
    background: var(--color-surface-raised);
  }
}

.headerLeft {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.icon { font-size: var(--text-base); line-height: 1; }
.title { font-size: var(--text-sm); font-weight: var(--weight-semibold); color: var(--color-fg); }

.badge {
  font-size: var(--text-xs);
  color: var(--color-fg-muted);
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: 1px var(--space-2);
}

.headerRight { display: flex; align-items: center; gap: var(--space-3); }
.total { font-size: var(--text-sm); font-variant-numeric: tabular-nums; color: var(--color-fg-secondary); }

.arrow {
  font-size: var(--text-xs);
  color: var(--color-fg-muted);
  transition: transform 150ms ease;
  &.open { transform: rotate(180deg); }
}

.body { border-block-start: 1px solid var(--color-border); }

.tableWrap { overflow-x: auto; }

.table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-sm);
}

.thead th {
  text-align: left;
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  color: var(--color-fg-muted);
  padding: var(--space-2) var(--space-3);
  border-block-end: 1px solid var(--color-border);

  &.numTh { text-align: right; }
}

.row td {
  padding: var(--space-2) var(--space-3);
  border-block-end: 1px solid var(--color-border-subtle, var(--color-border));
  vertical-align: middle;

  &:last-child { text-align: right; font-variant-numeric: tabular-nums; font-weight: var(--weight-semibold); }
}

.row:last-child td { border-block-end: none; }

.nameCell { color: var(--color-fg); font-weight: var(--weight-medium); }
.numCell { text-align: right; font-variant-numeric: tabular-nums; color: var(--color-fg-secondary); }

.stale {
  font-size: var(--text-xs);
  color: var(--color-warning, #f59e0b);
  margin-inline-start: var(--space-1);
}

.cellBtn {
  all: unset;
  cursor: pointer;
  font-size: var(--text-sm);
  font-variant-numeric: tabular-nums;
  color: var(--color-fg-secondary);
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: 2px var(--space-2);
  min-width: 64px;
  text-align: right;
  &:hover { border-color: var(--color-accent); }
}

.cellInput {
  font-size: var(--text-sm);
  font-variant-numeric: tabular-nums;
  color: var(--color-fg);
  background: var(--color-surface-raised);
  border: 1px solid var(--color-accent);
  border-radius: var(--radius-sm);
  padding: 2px var(--space-2);
  min-width: 64px;
  text-align: right;
  outline: none;
}

.empty {
  font-size: var(--text-sm);
  color: var(--color-fg-muted);
  font-style: italic;
  padding: var(--space-3) var(--space-4);
}

@media (prefers-reduced-motion: reduce) {
  .arrow { transition: none; }
}
```

- [ ] **Step 2: Create `LocationsWidget.tsx`**

```tsx
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { unwrapResult } from "@oh-writers/utils";
import type { BudgetLine } from "~/features/budget/server/budget.server";
import { updateBudgetLine } from "~/features/budget/server/budget.server";
import styles from "./LocationsWidget.module.css";

const fmt = (n: number) =>
  n.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

const lineEffective = (l: BudgetLine): number =>
  l.actual ?? (l.rate ?? 0) * (l.quantity ?? 1);

interface PerElementWidgetProps {
  icon: string;
  title: string;
  lines: BudgetLine[];
  activeElementIds: Set<string>;   // IDs still in breakdown — others are stale
  projectId: string;
}

function EditableCell({
  value,
  field,
  lineId,
  projectId,
}: {
  value: number | null;
  field: "rate" | "actual";
  lineId: string;
  projectId: string;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const patchMutation = useMutation({
    mutationFn: (patch: { rate?: number | null; actual?: number | null }) =>
      updateBudgetLine({ data: { lineId, patch } }).then(unwrapResult),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["budget", projectId] });
      setEditing(false);
    },
  });

  const commit = () => {
    const n = parseFloat(draft);
    if (!isNaN(n) && n >= 0) patchMutation.mutate({ [field]: n });
    else setEditing(false);
  };

  if (editing) {
    return (
      <input
        className={styles.cellInput}
        type="number"
        min="0"
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(false);
        }}
      />
    );
  }

  return (
    <button
      type="button"
      className={styles.cellBtn}
      onClick={() => { setDraft(String(value ?? "")); setEditing(true); }}
    >
      {value !== null ? fmt(value) : "—"}
    </button>
  );
}

export function PerElementWidget({
  icon,
  title,
  lines,
  activeElementIds,
  projectId,
}: PerElementWidgetProps) {
  const [open, setOpen] = useState(false);
  const total = lines.reduce((sum, l) => sum + lineEffective(l), 0);

  return (
    <div className={styles.widget}>
      <div className={styles.header} onClick={() => setOpen((p) => !p)}>
        <div className={styles.headerLeft}>
          <span className={styles.icon}>{icon}</span>
          <span className={styles.title}>{title}</span>
          {lines.length > 0 && (
            <span className={styles.badge}>{lines.length}</span>
          )}
        </div>
        <div className={styles.headerRight}>
          <span className={styles.total}>{fmt(total)}</span>
          <span className={`${styles.arrow} ${open ? styles.open : ""}`}>▾</span>
        </div>
      </div>

      {open && (
        <div className={styles.body}>
          {lines.length === 0 ? (
            <p className={styles.empty}>Nessun elemento trovato nel breakdown.</p>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr className={styles.thead}>
                    <th className={styles.th}>Nome</th>
                    <th className={`${styles.th} ${styles.numTh}`}>Giorni</th>
                    <th className={`${styles.th} ${styles.numTh}`}>€/giorno</th>
                    <th className={`${styles.th} ${styles.numTh}`}>Effettivo</th>
                    <th className={`${styles.th} ${styles.numTh}`}>Totale</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => {
                    const isStale =
                      line.linkedElementId !== null &&
                      !activeElementIds.has(line.linkedElementId);
                    return (
                      <tr key={line.id} className={styles.row}>
                        <td className={styles.nameCell}>
                          {line.name}
                          {isStale && <span className={styles.stale}>⚠ rimosso dal breakdown</span>}
                        </td>
                        <td className={styles.numCell}>{line.quantity ?? "—"}</td>
                        <td className={styles.numCell}>
                          <EditableCell value={line.rate} field="rate" lineId={line.id} projectId={projectId} />
                        </td>
                        <td className={styles.numCell}>
                          <EditableCell value={line.actual} field="actual" lineId={line.id} projectId={projectId} />
                        </td>
                        <td>{fmt(lineEffective(line))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Convenience wrappers
export function LocationsWidget(props: Omit<PerElementWidgetProps, "icon" | "title">) {
  return <PerElementWidget icon="📍" title="Locations" {...props} />;
}

export function VehiclesWidget(props: Omit<PerElementWidgetProps, "icon" | "title">) {
  return <PerElementWidget icon="🚗" title="Veicoli" {...props} />;
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
pnpm --filter @oh-writers/web tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/features/budget/components/widgets/LocationsWidget.tsx \
        apps/web/app/features/budget/components/widgets/LocationsWidget.module.css
git commit -m "[OHW] feat(budget): add LocationsWidget and VehiclesWidget per-element accordions"
```

---

## Task 5: `DayView` component

**Files:**
- Create: `apps/web/app/features/budget/components/widgets/DayView.tsx`
- Create: `apps/web/app/features/budget/components/widgets/DayView.module.css`

Read-only view. Renders one accordion per shooting day. Days with total > average × 1.5 show a warning highlight. Uses data from `getDayCosts`.

- [ ] **Step 1: Create `DayView.module.css`**

```css
.root { display: flex; flex-direction: column; gap: var(--space-2); }

.empty {
  font-size: var(--text-sm);
  color: var(--color-fg-muted);
  font-style: italic;
  padding: var(--space-4);
  text-align: center;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

.dayCard {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  overflow: hidden;

  &.expensive {
    border-color: var(--color-warning, #f59e0b);
  }
}

.dayHeader {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  cursor: pointer;
  user-select: none;

  &:hover { background: var(--color-surface-raised); }
}

.dayNum {
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
  color: var(--color-fg);
  min-width: 48px;
}

.dayNum.warn { color: var(--color-warning, #f59e0b); }

.bar {
  flex: 1;
  height: 6px;
  background: var(--color-border);
  border-radius: 3px;
  overflow: hidden;
}

.barFill {
  height: 100%;
  border-radius: 3px;
  background: var(--color-accent);
  transition: width 250ms ease;

  &.warn { background: var(--color-warning, #f59e0b); }
}

.dayTotal {
  font-size: var(--text-sm);
  font-variant-numeric: tabular-nums;
  font-weight: var(--weight-semibold);
  color: var(--color-fg);
  min-width: 80px;
  text-align: right;
}

.dayTotal.warn { color: var(--color-warning, #f59e0b); }

.arrow {
  font-size: var(--text-xs);
  color: var(--color-fg-muted);
  transition: transform 150ms ease;
  &.open { transform: rotate(180deg); }
}

.dayBody {
  border-block-start: 1px solid var(--color-border);
  padding: var(--space-3) var(--space-4);
}

.breakdownTable {
  width: 100%;
  font-size: var(--text-sm);
  border-collapse: collapse;
}

.breakdownTable td {
  padding: var(--space-1) 0;
  border-block-end: 1px solid var(--color-border-subtle, var(--color-border));
  color: var(--color-fg-secondary);

  &:last-child {
    text-align: right;
    font-variant-numeric: tabular-nums;
    color: var(--color-fg);
  }
}

.breakdownTable tr:last-child td { border-block-end: none; }

.totalRow td {
  padding-block-start: var(--space-2);
  font-weight: var(--weight-semibold);
  color: var(--color-fg);
  border-block-start: 1px solid var(--color-border);
  border-block-end: none !important;
}

@media (prefers-reduced-motion: reduce) {
  .barFill, .arrow { transition: none; }
}
```

- [ ] **Step 2: Create `DayView.tsx`**

```tsx
import { useState } from "react";
import type { DayCost } from "~/features/budget/server/budget.server";
import styles from "./DayView.module.css";

const fmt = (n: number) =>
  n.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

interface DayViewProps {
  days: DayCost[];
}

export function DayView({ days }: DayViewProps) {
  const [openDayId, setOpenDayId] = useState<string | null>(null);

  if (days.length === 0) {
    return (
      <div className={styles.empty}>
        Pianifica le giornate nello schedule per vedere il costo per giornata.
      </div>
    );
  }

  const maxTotal = Math.max(...days.map((d) => d.total), 1);
  const avgTotal = days.reduce((s, d) => s + d.total, 0) / days.length;

  return (
    <div className={styles.root}>
      {days.map((day) => {
        const isExpensive = day.total > avgTotal * 1.5;
        const isOpen = openDayId === day.dayId;
        const barWidth = Math.round((day.total / maxTotal) * 100);

        return (
          <div
            key={day.dayId}
            className={`${styles.dayCard} ${isExpensive ? styles.expensive : ""}`}
          >
            <div
              className={styles.dayHeader}
              onClick={() => setOpenDayId(isOpen ? null : day.dayId)}
            >
              <span className={`${styles.dayNum} ${isExpensive ? styles.warn : ""}`}>
                {isExpensive ? "⚠ " : ""}Gg {day.dayNumber}
              </span>
              <div className={styles.bar}>
                <div
                  className={`${styles.barFill} ${isExpensive ? styles.warn : ""}`}
                  style={{ width: `${barWidth}%` }}
                />
              </div>
              <span className={`${styles.dayTotal} ${isExpensive ? styles.warn : ""}`}>
                {fmt(day.total)}
              </span>
              <span className={`${styles.arrow} ${isOpen ? styles.open : ""}`}>▾</span>
            </div>

            {isOpen && (
              <div className={styles.dayBody}>
                <table className={styles.breakdownTable}>
                  <tbody>
                    <tr>
                      <td>Cast</td>
                      <td>{fmt(day.breakdown.cast)}</td>
                    </tr>
                    <tr>
                      <td>Crew</td>
                      <td>{fmt(day.breakdown.crew)}</td>
                    </tr>
                    {day.breakdown.locations > 0 && (
                      <tr>
                        <td>Locations</td>
                        <td>{fmt(day.breakdown.locations)}</td>
                      </tr>
                    )}
                    {day.breakdown.vehicles > 0 && (
                      <tr>
                        <td>Veicoli</td>
                        <td>{fmt(day.breakdown.vehicles)}</td>
                      </tr>
                    )}
                    {day.breakdown.other > 0 && (
                      <tr>
                        <td>Altro (ripartito)</td>
                        <td>{fmt(day.breakdown.other)}</td>
                      </tr>
                    )}
                    <tr>
                      <td>Contingenza</td>
                      <td>{fmt(day.breakdown.contingency)}</td>
                    </tr>
                    <tr className={styles.totalRow}>
                      <td>Totale giornata</td>
                      <td>{fmt(day.total)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
pnpm --filter @oh-writers/web tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/features/budget/components/widgets/DayView.tsx \
        apps/web/app/features/budget/components/widgets/DayView.module.css
git commit -m "[OHW] feat(budget): add DayView component for per-shooting-day cost breakdown"
```

---

## Task 6: Wire everything into `BudgetPage` — view toggle + all category widgets

**Files:**
- Modify: `apps/web/app/features/budget/components/BudgetPage.tsx`
- Modify: `apps/web/app/features/budget/components/BudgetPage.module.css`
- Delete: `apps/web/app/features/budget/components/widgets/EquipmentWidget.tsx`
- Delete: `apps/web/app/features/budget/components/widgets/EquipmentWidget.module.css`

This task replaces `EquipmentWidget` with the per-category widgets and adds the "Per categoria / Per giornata" toggle.

- [ ] **Step 1: Add toggle and day view styles to `BudgetPage.module.css`**

Add to the end of the file:

```css
.viewToggle {
  display: flex;
  gap: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.viewBtn {
  all: unset;
  cursor: pointer;
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  padding: var(--space-1) var(--space-3);
  color: var(--color-fg-muted);
  background: var(--color-surface);

  &:hover { background: var(--color-surface-raised); }
  &.active { background: var(--color-surface-raised); color: var(--color-fg); }
  &:disabled { opacity: 0.4; cursor: not-allowed; }
}

.categoryGroup {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.groupLabel {
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  color: var(--color-fg-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding-block-start: var(--space-2);
}
```

- [ ] **Step 2: Rewrite `BudgetPage.tsx`**

Replace the entire file content:

```tsx
import { useState, useEffect } from "react";
import {
  useSuspenseQuery,
  useQuery,
  useMutation,
  useQueryClient,
  queryOptions,
} from "@tanstack/react-query";
import { resourceTotal } from "@oh-writers/domain";
import type { FiscalRegime } from "@oh-writers/domain";
import {
  getBudget,
  generateBudget,
  getCastAndCrew,
  getProjectScenes,
  getRateCard,
  getDayCosts,
  updateBudgetSettings,
} from "../server/budget.server";
import { unwrapResult } from "@oh-writers/utils";
import { TotalWidget } from "./widgets/TotalWidget";
import { CastWidget } from "./widgets/CastWidget";
import { CrewWidget } from "./widgets/CrewWidget";
import { MiscWidget } from "./widgets/MiscWidget";
import { RateCardSection } from "./RateCardSection";
import { CategoryLineWidget } from "./widgets/CategoryLineWidget";
import { LocationsWidget, VehiclesWidget } from "./widgets/LocationsWidget";
import { DayView } from "./widgets/DayView";
import styles from "./BudgetPage.module.css";

const budgetQueryOptions = (projectId: string) =>
  queryOptions({
    queryKey: ["budget", projectId],
    queryFn: () => getBudget({ data: { projectId } }).then(unwrapResult),
  });

const castCrewQueryOptions = (projectId: string) =>
  queryOptions({
    queryKey: ["budget-cast-crew", projectId],
    queryFn: () => getCastAndCrew({ data: { projectId } }).then(unwrapResult),
  });

const scenesQueryOptions = (projectId: string) =>
  queryOptions({
    queryKey: ["budget-scenes", projectId],
    queryFn: () => getProjectScenes({ data: { projectId } }).then(unwrapResult),
  });

const rateCardQueryOptions = (projectId: string) =>
  queryOptions({
    queryKey: ["rate-card", projectId],
    queryFn: () => getRateCard({ data: { projectId } }).then(unwrapResult),
  });

const dayCostsQueryOptions = (projectId: string) =>
  queryOptions({
    queryKey: ["budget-day-costs", projectId],
    queryFn: () => getDayCosts({ data: { projectId } }).then(unwrapResult),
  });

const parseNum = (v: string) => Number(v);

const PRODUCTION_CATEGORY_CONFIG = [
  { linkedCategory: "equipment", icon: "🎬", title: "Fotografia" },
  { linkedCategory: "sound",     icon: "🎵", title: "Suono" },
  { linkedCategory: "props",     icon: "🏛",  title: "Scenografia" },
  { linkedCategory: "wardrobe",  icon: "👗", title: "Costumi & Make-up" },
  { linkedCategory: "extras",    icon: "👥", title: "Comparse" },
  { linkedCategory: "vfx",       icon: "✨", title: "VFX / SFX" },
  { linkedCategory: "stunts",    icon: "🎯", title: "Stunt" },
  { linkedCategory: "animals",   icon: "🐾", title: "Animali" },
] as const;

interface BudgetPageProps {
  projectId: string;
}

export function BudgetPage({ projectId }: BudgetPageProps) {
  const qc = useQueryClient();
  const { data: budget } = useSuspenseQuery(budgetQueryOptions(projectId));
  const { data: castCrew } = useSuspenseQuery(castCrewQueryOptions(projectId));
  const { data: allScenes } = useSuspenseQuery(scenesQueryOptions(projectId));
  const { data: rateCardEntries } = useSuspenseQuery(rateCardQueryOptions(projectId));
  const { data: dayCosts } = useQuery(dayCostsQueryOptions(projectId));

  const [view, setView] = useState<"category" | "day">("category");
  const [selectedScene, setSelectedScene] = useState<number | null>(null);

  const generateMutation = useMutation({
    mutationFn: () =>
      generateBudget({ data: { projectId } }).then(unwrapResult),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["budget", projectId] });
      qc.invalidateQueries({ queryKey: ["budget-cast-crew", projectId] });
      qc.invalidateQueries({ queryKey: ["budget-day-costs", projectId] });
    },
    onError: () => {},
  });

  const settingsMutation = useMutation({
    mutationFn: (patch: { shootingDays?: number | null; contingencyPercent?: number }) =>
      updateBudgetSettings({ data: { budgetId: budget!.id, ...patch } }).then(unwrapResult),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["budget", projectId] }),
  });

  useEffect(() => {
    if (!budget && scenes.length > 0 && !generateMutation.isPending) {
      generateMutation.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cast = castCrew?.cast ?? [];
  const crew = castCrew?.crew ?? [];
  const castSceneMap = castCrew?.castSceneMap ?? {};
  const scenes = allScenes ?? [];

  const filteredCast =
    selectedScene === null
      ? cast
      : cast.filter((r) => (castSceneMap[r.id] ?? []).includes(selectedScene));

  const sceneRatio = (rowId: string): number => {
    if (selectedScene === null) return 1;
    const rowScenes = castSceneMap[rowId] ?? [];
    return rowScenes.length > 0 ? 1 / rowScenes.length : 0;
  };

  const castTotal =
    selectedScene === null
      ? filteredCast.reduce(
          (sum, r) =>
            sum +
            resourceTotal({
              days: parseNum(r.days),
              dayRate: parseNum(r.dayRate),
              fiscalRegime: r.fiscalRegime as FiscalRegime,
              mealAllowance: parseNum(r.mealAllowance),
              accommodation: parseNum(r.accommodation),
            }),
          0,
        )
      : filteredCast.reduce((sum, r) => {
          const full = resourceTotal({
            days: parseNum(r.days),
            dayRate: parseNum(r.dayRate),
            fiscalRegime: r.fiscalRegime as FiscalRegime,
            mealAllowance: parseNum(r.mealAllowance),
            accommodation: parseNum(r.accommodation),
          });
          return sum + full * sceneRatio(r.id);
        }, 0);

  const crewTotal = crew
    .filter((r) => r.enabled)
    .reduce(
      (sum, r) =>
        sum +
        resourceTotal({
          days: parseNum(r.days),
          dayRate: parseNum(r.dayRate),
          fiscalRegime: r.fiscalRegime as FiscalRegime,
          mealAllowance: parseNum(r.mealAllowance),
          accommodation: parseNum(r.accommodation),
        }),
      0,
    );

  const productionLines = budget?.lines.filter((l) => l.topSheet === "production") ?? [];
  const miscLines = budget?.lines.filter((l) => l.topSheet === "contingency") ?? [];

  // Per-element lines for locations and vehicles
  const locationLines = productionLines.filter((l) => l.linkedCategory === "locations");
  const vehicleLines = productionLines.filter((l) => l.linkedCategory === "vehicles");

  // Active element IDs from cast/crew (used for stale detection)
  const activeElementIds = new Set(
    cast.map((r) => r.elementId).filter(Boolean) as string[],
  );

  // Totals per production category
  const productionTotal = productionLines.reduce(
    (sum, l) => sum + (l.actual ?? (l.rate ?? 0) * (l.quantity ?? 1)),
    0,
  );
  const miscTotal = miscLines.reduce(
    (sum, l) => sum + (l.actual ?? (l.rate ?? 0) * (l.quantity ?? 1)),
    0,
  );

  const grandTotal = castTotal + crewTotal + productionTotal + miscTotal;
  const contingencyPercent = budget?.contingencyPercent ?? 10;
  const shootingDays = budget?.shootingDays ?? null;

  const hasDayCosts = (dayCosts?.length ?? 0) > 0;

  return (
    <div className={styles.page} data-testid="budget-page">
      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <span className={styles.toolbarLabel}>Giorni ripresa:</span>
          <SettingField
            value={shootingDays}
            placeholder="—"
            disabled={!budget}
            onCommit={(v) => settingsMutation.mutate({ shootingDays: v })}
            suffix=""
            data-testid="shooting-days"
          />
          <span className={styles.toolbarLabel}>Contingenza:</span>
          <SettingField
            value={contingencyPercent}
            placeholder="10"
            disabled={!budget}
            onCommit={(v) => settingsMutation.mutate({ contingencyPercent: v })}
            suffix="%"
            data-testid="contingency-percent"
          />
          {scenes.length > 0 && (
            <>
              <div className={styles.toolbarDivider} />
              <select
                className={styles.sceneSelect}
                value={selectedScene ?? ""}
                onChange={(e) =>
                  setSelectedScene(e.target.value ? Number(e.target.value) : null)
                }
                data-testid="scene-select"
              >
                <option value="">Tutte le scene</option>
                {scenes.map((s) => (
                  <option key={s.number} value={s.number}>
                    Sc.{s.number} — {s.heading}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
          <div className={styles.viewToggle}>
            <button
              type="button"
              className={`${styles.viewBtn} ${view === "category" ? styles.active : ""}`}
              onClick={() => setView("category")}
            >
              Per categoria
            </button>
            <button
              type="button"
              className={`${styles.viewBtn} ${view === "day" ? styles.active : ""}`}
              onClick={() => setView("day")}
              disabled={!hasDayCosts}
              title={!hasDayCosts ? "Pianifica le giornate nello schedule per attivare questa vista" : undefined}
            >
              Per giornata
            </button>
          </div>
          <button
            type="button"
            className={styles.generateBtn}
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
            data-testid="generate-budget-btn"
          >
            {generateMutation.isPending ? "Generando…" : budget ? "Rigenera" : "Genera budget"}
          </button>
        </div>
      </div>

      {generateMutation.isError && (
        <div className={styles.error}>
          {(generateMutation.error as { _tag?: string })?._tag === "NoBreakdownError"
            ? "Completa prima il breakdown delle scene per generare il budget."
            : "Errore nella generazione. Verifica che il breakdown sia stato completato."}
        </div>
      )}

      <RateCardSection projectId={projectId} entries={rateCardEntries ?? []} />

      <div className={styles.grid}>
        <div className={styles.sideCol}>
          <TotalWidget
            castTotal={castTotal}
            crewTotal={crewTotal}
            productionLines={productionLines}
            miscTotal={miscTotal}
            contingencyPercent={contingencyPercent}
          />
        </div>
        <div className={styles.mainCol}>
          {view === "category" ? (
            <>
              <div className={styles.categoryGroup}>
                <span className={styles.groupLabel}>Cast & Crew</span>
                <CastWidget
                  cast={filteredCast}
                  castSceneMap={castSceneMap}
                  selectedScene={selectedScene}
                  grandTotal={grandTotal}
                  projectId={projectId}
                />
                {(crew.length > 0 || budget) && (
                  <CrewWidget
                    crew={crew}
                    budgetId={budget?.id ?? ""}
                    grandTotal={grandTotal}
                    projectId={projectId}
                  />
                )}
              </div>

              {budget && (
                <div className={styles.categoryGroup}>
                  <span className={styles.groupLabel}>Produzione — da breakdown</span>
                  <LocationsWidget
                    lines={locationLines}
                    activeElementIds={activeElementIds}
                    projectId={projectId}
                  />
                  <VehiclesWidget
                    lines={vehicleLines}
                    activeElementIds={activeElementIds}
                    projectId={projectId}
                  />
                  {PRODUCTION_CATEGORY_CONFIG.map(({ linkedCategory, icon, title }) => {
                    const line = productionLines.find(
                      (l) => l.linkedCategory === linkedCategory && l.linkedElementId === null,
                    ) ?? null;
                    const elementCount = Number(line?.quantity ?? 0);
                    if (!line) return null;
                    return (
                      <CategoryLineWidget
                        key={linkedCategory}
                        icon={icon}
                        title={title}
                        line={line}
                        elementCount={elementCount}
                        projectId={projectId}
                      />
                    );
                  })}
                </div>
              )}

              {miscLines.length > 0 && (
                <MiscWidget lines={miscLines} total={miscTotal} projectId={projectId} />
              )}
            </>
          ) : (
            <DayView days={dayCosts ?? []} />
          )}
        </div>
      </div>
    </div>
  );
}

function SettingField({
  value,
  placeholder,
  disabled,
  onCommit,
  suffix,
  ...rest
}: {
  value: number | null;
  placeholder: string;
  disabled: boolean;
  onCommit: (v: number) => void;
  suffix: string;
  "data-testid"?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value ?? ""));

  const commit = () => {
    setEditing(false);
    const n = parseFloat(draft);
    if (!isNaN(n) && n >= 0) onCommit(n);
  };

  if (editing) {
    return (
      <input
        className={styles.settingInput}
        type="number"
        value={draft}
        autoFocus
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(false);
        }}
        {...rest}
      />
    );
  }

  return (
    <button
      type="button"
      className={styles.settingBtn}
      disabled={disabled}
      onClick={() => {
        if (!disabled) {
          setDraft(String(value ?? ""));
          setEditing(true);
        }
      }}
      {...rest}
    >
      {value !== null ? `${value}${suffix}` : placeholder}
    </button>
  );
}
```

- [ ] **Step 3: Delete `EquipmentWidget`**

```bash
rm apps/web/app/features/budget/components/widgets/EquipmentWidget.tsx
rm apps/web/app/features/budget/components/widgets/EquipmentWidget.module.css
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
pnpm --filter @oh-writers/web tsc --noEmit
```

Expected: no errors. Fix any remaining import of `EquipmentWidget` that may appear in other files.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/features/budget/components/BudgetPage.tsx \
        apps/web/app/features/budget/components/BudgetPage.module.css
git rm apps/web/app/features/budget/components/widgets/EquipmentWidget.tsx \
       apps/web/app/features/budget/components/widgets/EquipmentWidget.module.css
git commit -m "[OHW] feat(budget): wire category widgets + view toggle into BudgetPage"
```

---

## Task 7: Update `TotalWidget` — per-category production breakdown

**Files:**
- Modify: `apps/web/app/features/budget/components/widgets/TotalWidget.tsx`

The sidebar `TotalWidget` currently shows a single "Equipment" row. Replace it with a dynamic list of non-zero production category totals.

- [ ] **Step 1: Read the current `TotalWidget.tsx`**

```bash
cat apps/web/app/features/budget/components/widgets/TotalWidget.tsx
```

- [ ] **Step 2: Update `TotalWidget` props and rendering**

Replace the props interface and component to accept `productionLines` instead of `equipmentTotal`:

```tsx
// In TotalWidget.tsx, change the props interface from:
interface TotalWidgetProps {
  castTotal: number;
  crewTotal: number;
  equipmentTotal: number;   // ← remove
  miscTotal: number;
  contingencyPercent: number;
}

// to:
import type { BudgetLine } from "~/features/budget/server/budget.server";

interface TotalWidgetProps {
  castTotal: number;
  crewTotal: number;
  productionLines: BudgetLine[];  // ← replaces equipmentTotal
  miscTotal: number;
  contingencyPercent: number;
}
```

In the component body, replace the single equipment row with per-category rows. Compute the total and build the row list:

```tsx
const CATEGORY_LABELS: Record<string, string> = {
  locations: "Locations",
  vehicles:  "Veicoli",
  equipment: "Fotografia",
  sound:     "Suono",
  props:     "Scenografia",
  wardrobe:  "Costumi",
  extras:    "Comparse",
  vfx:       "VFX / SFX",
  stunts:    "Stunt",
  animals:   "Animali",
};

// Aggregate by linkedCategory for display
const prodByCategory = new Map<string, number>();
for (const l of productionLines) {
  const cat = l.linkedCategory ?? "other";
  const effective = l.actual ?? (l.rate ?? 0) * (l.quantity ?? 1);
  prodByCategory.set(cat, (prodByCategory.get(cat) ?? 0) + effective);
}
const productionTotal = Array.from(prodByCategory.values()).reduce((s, v) => s + v, 0);
```

Then in the JSX, replace the single `<SummaryRow label="Attrezzatura" .../>` with:

```tsx
{Array.from(prodByCategory.entries())
  .filter(([, v]) => v > 0)
  .map(([cat, v]) => (
    <SummaryRow key={cat} label={CATEGORY_LABELS[cat] ?? cat} value={v} />
  ))
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
pnpm --filter @oh-writers/web tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/features/budget/components/widgets/TotalWidget.tsx
git commit -m "[OHW] feat(budget): update TotalWidget with per-category production breakdown"
```

---

## Task 8: Playwright E2E tests

**Files:**
- Create: `tests/budget-production-categories.spec.ts`

- [ ] **Step 1: Write the Playwright spec**

Create `tests/budget-production-categories.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";
import { loginAsGiuseppe, openProjectBudget } from "./helpers/auth";

test.describe("[OHW-11d] Budget production categories", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsGiuseppe(page);
  });

  test("Locations section appears after Rigenera when breakdown has location elements", async ({ page }) => {
    await openProjectBudget(page, "test-project-with-breakdown");

    await page.getByTestId("generate-budget-btn").click();
    await expect(page.getByTestId("generate-budget-btn")).not.toHaveText("Generando…");

    await expect(page.getByText("Locations")).toBeVisible();
  });

  test("Editing a location rate persists after re-render", async ({ page }) => {
    await openProjectBudget(page, "test-project-with-breakdown");

    // Expand locations accordion
    await page.getByText("Locations").click();

    // Find the first rate cell button and click it
    const rateBtn = page.getByRole("button", { name: /\d+/ }).first();
    const originalValue = await rateBtn.textContent();
    await rateBtn.click();

    // Type a new rate
    const input = page.getByRole("spinbutton").first();
    await input.fill("999");
    await input.press("Enter");

    // Wait for mutation and verify the new value appears
    await expect(page.getByRole("button", { name: /999/ })).toBeVisible();

    // Reload and verify the value persisted
    await page.reload();
    await page.getByText("Locations").click();
    await expect(page.getByRole("button", { name: /999/ })).toBeVisible();
  });

  test("Rigenera preserves existing actual values", async ({ page }) => {
    await openProjectBudget(page, "test-project-with-breakdown");

    // First generation
    await page.getByTestId("generate-budget-btn").click();
    await expect(page.getByTestId("generate-budget-btn")).not.toHaveText("Generando…");

    // Open locations, set a rate
    await page.getByText("Locations").click();
    const rateBtn = page.getByRole("button").filter({ hasText: /^\d+$/ }).first();
    await rateBtn.click();
    await page.getByRole("spinbutton").first().fill("1500");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: /1\.500/ })).toBeVisible();

    // Rigenera
    await page.getByTestId("generate-budget-btn").click();
    await expect(page.getByTestId("generate-budget-btn")).not.toHaveText("Generando…");

    // Rate should still be 1500
    await page.getByText("Locations").click();
    await expect(page.getByRole("button", { name: /1\.500/ })).toBeVisible();
  });

  test("View toggle switches to day view when schedule exists", async ({ page }) => {
    await openProjectBudget(page, "test-project-with-schedule");

    await page.getByRole("button", { name: "Per giornata" }).click();

    // Should show at least one day
    await expect(page.getByText(/Gg 1/)).toBeVisible();
  });

  test("View toggle is disabled when no schedule exists", async ({ page }) => {
    await openProjectBudget(page, "test-project-without-schedule");

    const dayToggle = page.getByRole("button", { name: "Per giornata" });
    await expect(dayToggle).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run tests**

```bash
cd /Users/valerionarcisi/personal/oh-writers
pnpm test -- tests/budget-production-categories.spec.ts
```

Expected: tests pass (may require test fixtures `test-project-with-breakdown` and `test-project-with-schedule` to exist in the seed; if they don't, add them to `packages/db/src/seed/index.ts` following the existing pattern before running).

- [ ] **Step 3: Commit**

```bash
git add tests/budget-production-categories.spec.ts
git commit -m "[OHW] test(budget): Playwright E2E for production categories and day view toggle"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| Accordion sections per production category | Task 6 (BudgetPage + all widgets) |
| Sections hidden when breakdown empty | Task 6 (null-guard in PRODUCTION_CATEGORY_CONFIG map) |
| Locations/Vehicles: per-element sub-table | Task 4 (PerElementWidget) |
| Other categories: aggregate single row | Task 3 (CategoryLineWidget) |
| Rate card matched on name for locations/vehicles | Task 1 (generateBudget, rate card lookup already exists for cast — same pattern applied) |
| Rigenera preserves `actual` | Task 1 |
| Schedule-based day count for per-element quantities | Task 1 |
| Stale indicator on removed-element rows | Task 4 (PerElementWidget stale prop) |
| `getDayCosts` server function | Task 2 |
| Toggle "Per categoria / Per giornata" | Task 6 |
| Toggle disabled when no schedule | Task 6 |
| Day view: accordion per day | Task 5 |
| Day view: expensive day warning | Task 5 |
| TotalWidget per-category breakdown | Task 7 |
| EquipmentWidget removed | Task 6 |
| Vitest: upsert logic | Task 1 |
| Vitest: day cost computation | Task 2 |
| Playwright: locations appear, rate persists, toggle | Task 8 |

**Note on stale detection:** `BudgetPage` passes `activeElementIds` built from cast's `elementId` set — this only covers cast elements. For locations/vehicles, a proper stale check would compare against all active breakdown element IDs. Task 4 accepts `activeElementIds: Set<string>` as a prop; Task 6 should build this set from all breakdown elements (not just cast). Fix in Task 6 Step 2: replace:

```tsx
const activeElementIds = new Set(
  cast.map((r) => r.elementId).filter(Boolean) as string[],
);
```

with a query against `getProjectBreakdownRows` — or simply pass an empty set for now and note it as a known limitation (stale detection for locations/vehicles requires a separate breakdown elements query). For MVP, pass `new Set<string>()` and the stale badge won't fire; that's acceptable.
