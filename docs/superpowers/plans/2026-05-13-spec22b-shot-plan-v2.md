# Spec 22b — Piano di Ripresa v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the tabbed shot-plan editor with parallel-plans tracks on a fixed 0–8h ruler, add a collapsible script panel, a quick-add toolbar with coverage patterns, right-click menu and auto-populate first plan from breakdown — so the director never starts from a blank page.

**Architecture:** Domain-first: coverage patterns + recommend algorithm as pure functions in `packages/domain`. New server functions in the existing `shooting-plan.server.ts` (atomic transactions for `moveShot`, idempotent `getOrCreateInitialPlan`). UI rewrite of the main editor in `apps/web/app/features/shooting-plan/components/` with one new orchestrator (`ParallelPlansEditor`) replacing `SceneShotTimeline` + `ScenarioTabs`. Drag-and-drop stays native HTML5 (no library). Pre-existing pre-commit `pnpm typecheck` is broken because of the `projectRateCard` issue inherited from `origin/main` (`apps/web/app/features/budget/server/budget.server.ts`) — every commit in this plan uses `git commit --no-verify` to bypass the pre-commit typecheck only; the engineer must still run `pnpm --filter @oh-writers/web typecheck` themselves and confirm the ONLY errors reported are the pre-existing budget ones.

**Tech Stack:** TanStack Start, Drizzle, neverthrow, Zod, CSS Modules with design tokens, Vitest, Playwright, native HTML5 drag-and-drop.

---

## File Structure

**Create (domain):**

- `packages/domain/src/schedule/coverage-patterns.ts` — `COVERAGE_PATTERNS` constant, `PatternId`, `CoveragePattern`, `PatternShotInput` types
- `packages/domain/src/schedule/coverage-patterns.test.ts` — table-driven validity tests for each pattern
- `packages/domain/src/schedule/recommend-pattern.ts` — `recommendPattern(breakdown, scene)` pure function + `BreakdownSummary` type
- `packages/domain/src/schedule/recommend-pattern.test.ts` — full branch coverage

**Modify (domain):**

- `packages/domain/src/schedule/index.ts` — re-export new symbols
- `packages/domain/src/index.ts` — verify schedule re-exports include new types

**Create (DB):**

- `packages/db/drizzle/0021_shot_plan_suggested.sql` — `ALTER TABLE shot_plan_scenarios ADD COLUMN is_suggested boolean NOT NULL DEFAULT false`
- `packages/db/drizzle/meta/0021_snapshot.json` + entry in `meta/_journal.json` — drizzle metadata (the engineer regenerates via `pnpm db:generate` or hand-writes if the journal is broken — see Task 1)

**Modify (DB schema):**

- `packages/db/src/schema/shot-plan.ts` — add `isSuggested: boolean(...).notNull().default(false)` to `shotPlanScenarios`

**Modify (server):**

- `apps/web/app/features/shooting-plan/server/shooting-plan.server.ts` — add `getOrCreateInitialPlan`, `applyPattern`, `moveShot`, `addReverseShot`, `getBreakdownSummary`. Modify `addShot`, `updateShot`, `deleteShot`, `reorderShots`, `addManualTransition`, `updateTransition`, `deleteTransition`, `applyPattern`, `moveShot` to clear `is_suggested` on the target scenario.

**Create (UI components):**

- `apps/web/app/features/shooting-plan/components/ScriptPanel.tsx` + `.module.css`
- `apps/web/app/features/shooting-plan/components/BlockingPlaceholder.tsx` + `.module.css`
- `apps/web/app/features/shooting-plan/components/PlanPicker.tsx` + `.module.css`
- `apps/web/app/features/shooting-plan/components/PlanTrack.tsx` + `.module.css`
- `apps/web/app/features/shooting-plan/components/ParallelPlansEditor.tsx` + `.module.css`
- `apps/web/app/features/shooting-plan/components/QuickAddToolbar.tsx` + `.module.css`
- `apps/web/app/features/shooting-plan/components/PatternMenu.tsx` + `.module.css`
- `apps/web/app/features/shooting-plan/components/ShotContextMenu.tsx` + `.module.css`
- `apps/web/app/features/shooting-plan/hooks/useLocalStorage.ts` — small wrapper for SSR-safe persistent state
- `apps/web/app/features/shooting-plan/hooks/useDragState.ts` — shared drag state across PlanTrack instances

**Modify (UI):**

- `apps/web/app/features/shooting-plan/components/ShootingPlanPage.tsx` + `.module.css` — 3-zone grid layout
- `apps/web/app/features/shooting-plan/components/ShotBlock.tsx` + `.module.css` — width proportional to 480m, add `onContextMenu` handler
- `apps/web/app/features/shooting-plan/components/TransitionBlock.tsx` + `.module.css` — width proportional to 480m
- `apps/web/app/features/shooting-plan/index.ts` — re-export new public symbols

**Delete:**

- `apps/web/app/features/shooting-plan/components/SceneShotTimeline.tsx` + `.module.css`
- `apps/web/app/features/shooting-plan/components/ScenarioTabs.tsx` + `.module.css`

**Modify (tests):**

- `tests/shooting-plan/shooting-plan.spec.ts` — rewrite for v2 flows

---

## Task 1: DB migration + schema for `is_suggested`

**Files:**

- Create: `packages/db/drizzle/0021_shot_plan_suggested.sql`
- Modify: `packages/db/src/schema/shot-plan.ts`
- Modify: `packages/db/drizzle/meta/_journal.json` (add entry)
- Create: `packages/db/drizzle/meta/0021_snapshot.json` (drizzle auto-generates via `pnpm db:generate`)

- [ ] **Step 1: Add the column to the schema**

Open `packages/db/src/schema/shot-plan.ts`. Find the `shotPlanScenarios` table definition. Add `isSuggested` after the existing columns:

```typescript
export const shotPlanScenarios = pgTable("shot_plan_scenarios", {
  // ...existing columns...
  isSuggested: boolean("is_suggested").notNull().default(false),
});
```

If `boolean` is not yet imported from `drizzle-orm/pg-core`, add it to the imports at the top of the file.

- [ ] **Step 2: Generate migration**

Run: `pnpm --filter @oh-writers/db generate`
Expected: a new migration file appears in `packages/db/drizzle/` named like `0021_<random>.sql` containing `ALTER TABLE "shot_plan_scenarios" ADD COLUMN "is_suggested" boolean DEFAULT false NOT NULL;`. The journal `meta/_journal.json` is updated automatically. If `pnpm db:generate` produces an unrelated migration (because the journal is stale from spec 22a — known issue), instead hand-write the migration file `0021_shot_plan_suggested.sql` with the SQL above and manually add a journal entry mirroring the format of entry 0020.

- [ ] **Step 3: Apply migration**

Run: `pnpm --filter @oh-writers/db migrate`
Expected: `migrations applied successfully!`. If the migrate command says "no migrations to apply" because the journal is out of sync, apply manually:

```bash
docker exec -i $(docker ps --filter "ancestor=postgres" -q | head -1) psql -U postgres -d ohwriters -c "ALTER TABLE shot_plan_scenarios ADD COLUMN IF NOT EXISTS is_suggested boolean NOT NULL DEFAULT false;"
```

- [ ] **Step 4: Rebuild the db package**

Run: `pnpm --filter @oh-writers/db build`
Expected: `Build success`. Required so apps/web sees the new schema type.

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @oh-writers/web typecheck`
Expected: only the pre-existing `projectRateCard` / `RateCardSection` errors from `budget.server.ts`. No new errors mentioning `is_suggested` or `shot_plan_scenarios`.

- [ ] **Step 6: Commit**

```bash
git add packages/db/
git commit --no-verify -m "[OHW] feat(db): add is_suggested column to shot_plan_scenarios"
```

---

## Task 2: Coverage patterns constants + tests

**Files:**

- Create: `packages/domain/src/schedule/coverage-patterns.ts`
- Create: `packages/domain/src/schedule/coverage-patterns.test.ts`
- Modify: `packages/domain/src/schedule/index.ts`

- [ ] **Step 1: Write the patterns file**

Create `packages/domain/src/schedule/coverage-patterns.ts`:

```typescript
import type { ShotSize, CameraMovement } from "./effort-weights";

export const PATTERN_IDS = [
  "master_only",
  "master_plus_mids",
  "coverage_standard",
  "shot_reverse_shot",
  "three_way_dialogue",
  "action_handheld",
] as const;

export type PatternId = (typeof PATTERN_IDS)[number];

export interface PatternShotInput {
  shotSize: ShotSize;
  cameraMovement: CameraMovement;
  notesHint: string | null;
}

export interface CoveragePattern {
  id: PatternId;
  label: string;
  description: string;
  shots: PatternShotInput[];
  estimatedMinutesHint: number;
}

export const COVERAGE_PATTERNS: Record<PatternId, CoveragePattern> = {
  master_only: {
    id: "master_only",
    label: "Master only",
    description: "Solo master shot, scena breve",
    shots: [{ shotSize: "WS", cameraMovement: "STATIC", notesHint: "master" }],
    estimatedMinutesHint: 45,
  },
  master_plus_mids: {
    id: "master_plus_mids",
    label: "Master + medi",
    description: "WS + 2 MS, scena monologo o copertura essenziale",
    shots: [
      { shotSize: "WS", cameraMovement: "STATIC", notesHint: "master" },
      { shotSize: "MS", cameraMovement: "STATIC", notesHint: null },
      { shotSize: "MS", cameraMovement: "STATIC", notesHint: null },
    ],
    estimatedMinutesHint: 95,
  },
  coverage_standard: {
    id: "coverage_standard",
    label: "Coverage standard",
    description: "WS + 2 MS + 2 CU, copertura completa standard",
    shots: [
      { shotSize: "WS", cameraMovement: "STATIC", notesHint: "master" },
      { shotSize: "MS", cameraMovement: "STATIC", notesHint: null },
      { shotSize: "MS", cameraMovement: "STATIC", notesHint: null },
      { shotSize: "CU", cameraMovement: "STATIC", notesHint: null },
      { shotSize: "CU", cameraMovement: "STATIC", notesHint: null },
    ],
    estimatedMinutesHint: 155,
  },
  shot_reverse_shot: {
    id: "shot_reverse_shot",
    label: "Campo / controcampo",
    description: "2 OTS + 2 CU per dialogo a 2 personaggi",
    shots: [
      { shotSize: "OTS", cameraMovement: "STATIC", notesHint: "campo" },
      { shotSize: "OTS", cameraMovement: "STATIC", notesHint: "controcampo" },
      { shotSize: "CU", cameraMovement: "STATIC", notesHint: "primo personaggio" },
      { shotSize: "CU", cameraMovement: "STATIC", notesHint: "secondo personaggio" },
    ],
    estimatedMinutesHint: 155,
  },
  three_way_dialogue: {
    id: "three_way_dialogue",
    label: "Dialogo a 3",
    description: "WS + 3 CU singoli per dialogo a 3+ personaggi",
    shots: [
      { shotSize: "WS", cameraMovement: "STATIC", notesHint: "master a 3" },
      { shotSize: "CU", cameraMovement: "STATIC", notesHint: "primo personaggio" },
      { shotSize: "CU", cameraMovement: "STATIC", notesHint: "secondo personaggio" },
      { shotSize: "CU", cameraMovement: "STATIC", notesHint: "terzo personaggio" },
    ],
    estimatedMinutesHint: 125,
  },
  action_handheld: {
    id: "action_handheld",
    label: "Action handheld",
    description: "WS + 4 MS handheld per sequenze action / SFX",
    shots: [
      { shotSize: "WS", cameraMovement: "STATIC", notesHint: "establishing" },
      { shotSize: "MS", cameraMovement: "HANDHELD", notesHint: null },
      { shotSize: "MS", cameraMovement: "HANDHELD", notesHint: null },
      { shotSize: "MS", cameraMovement: "HANDHELD", notesHint: null },
      { shotSize: "MS", cameraMovement: "HANDHELD", notesHint: null },
    ],
    estimatedMinutesHint: 110,
  },
};
```

- [ ] **Step 2: Write the test file**

Create `packages/domain/src/schedule/coverage-patterns.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { COVERAGE_PATTERNS, PATTERN_IDS } from "./coverage-patterns";

describe("COVERAGE_PATTERNS", () => {
  it("defines a pattern for every PATTERN_IDS entry", () => {
    for (const id of PATTERN_IDS) {
      expect(COVERAGE_PATTERNS[id]).toBeDefined();
      expect(COVERAGE_PATTERNS[id].id).toBe(id);
    }
  });

  it.each(PATTERN_IDS)("pattern %s has at least one shot", (id) => {
    expect(COVERAGE_PATTERNS[id].shots.length).toBeGreaterThan(0);
  });

  it.each(PATTERN_IDS)("pattern %s has a non-empty label and description", (id) => {
    expect(COVERAGE_PATTERNS[id].label.length).toBeGreaterThan(0);
    expect(COVERAGE_PATTERNS[id].description.length).toBeGreaterThan(0);
  });

  it.each(PATTERN_IDS)("pattern %s has positive estimatedMinutesHint", (id) => {
    expect(COVERAGE_PATTERNS[id].estimatedMinutesHint).toBeGreaterThan(0);
  });

  it("shot_reverse_shot uses OTS as primary shots", () => {
    const ots = COVERAGE_PATTERNS.shot_reverse_shot.shots.filter(
      (s) => s.shotSize === "OTS",
    );
    expect(ots.length).toBe(2);
  });

  it("action_handheld uses HANDHELD movement on most shots", () => {
    const handheld = COVERAGE_PATTERNS.action_handheld.shots.filter(
      (s) => s.cameraMovement === "HANDHELD",
    );
    expect(handheld.length).toBeGreaterThanOrEqual(4);
  });
});
```

- [ ] **Step 3: Export from schedule index**

Edit `packages/domain/src/schedule/index.ts`. Add:

```typescript
export * from "./coverage-patterns.js";
```

Place this line next to the other `export * from` lines (typically grouped at the top of the file).

- [ ] **Step 4: Run the test**

Run: `pnpm --filter @oh-writers/domain vitest run packages/domain/src/schedule/coverage-patterns.test.ts`
Expected: 4 named test suites pass (`defines a pattern...`, `pattern X has at least one shot`, `pattern X has non-empty label...`, `pattern X has positive...`) plus the two specific pattern shape tests. Total > 20 assertions pass.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/schedule/coverage-patterns.ts packages/domain/src/schedule/coverage-patterns.test.ts packages/domain/src/schedule/index.ts
git commit --no-verify -m "[OHW] feat(domain): add COVERAGE_PATTERNS constants for shot plan v2"
```

---

## Task 3: `recommendPattern` pure function + tests

**Files:**

- Create: `packages/domain/src/schedule/recommend-pattern.ts`
- Create: `packages/domain/src/schedule/recommend-pattern.test.ts`
- Modify: `packages/domain/src/schedule/index.ts`

- [ ] **Step 1: Write the function**

Create `packages/domain/src/schedule/recommend-pattern.ts`:

```typescript
import type { PatternId } from "./coverage-patterns.js";

export interface BreakdownSummary {
  /** Names of characters that have at least one dialogue line in the scene. */
  castWithDialogue: string[];
  /** Count of breakdown elements categorized as "action" / stunts / SFX notes. */
  actionNoteCount: number;
}

export interface SceneForRecommend {
  pageStart: number | null;
  pageEnd: number | null;
  hasSpecialEffect: boolean;
}

const scenePageCount = (scene: SceneForRecommend): number => {
  if (
    scene.pageStart != null &&
    scene.pageEnd != null &&
    scene.pageEnd >= scene.pageStart
  ) {
    return Math.max(1, scene.pageEnd - scene.pageStart);
  }
  return 1;
};

export const recommendPattern = (
  breakdown: BreakdownSummary | null,
  scene: SceneForRecommend,
): PatternId => {
  // SFX / action wins over everything — even without breakdown we recommend handheld
  if (scene.hasSpecialEffect) return "action_handheld";

  if (!breakdown) return "master_plus_mids";

  if (breakdown.actionNoteCount > 0) return "action_handheld";

  const speakingChars = breakdown.castWithDialogue.length;
  const pageCount = scenePageCount(scene);

  if (pageCount < 1) return "master_only";
  if (speakingChars === 1) return "master_plus_mids";
  if (speakingChars === 2) return "shot_reverse_shot";
  if (speakingChars >= 3) return "three_way_dialogue";

  return "coverage_standard";
};
```

- [ ] **Step 2: Write the test file**

Create `packages/domain/src/schedule/recommend-pattern.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { recommendPattern } from "./recommend-pattern";

const baseScene = {
  pageStart: 1,
  pageEnd: 2,
  hasSpecialEffect: false,
};

describe("recommendPattern", () => {
  it("returns action_handheld when hasSpecialEffect even without breakdown", () => {
    expect(
      recommendPattern(null, { ...baseScene, hasSpecialEffect: true }),
    ).toBe("action_handheld");
  });

  it("returns action_handheld when breakdown actionNoteCount > 0", () => {
    expect(
      recommendPattern(
        { castWithDialogue: ["MARCO"], actionNoteCount: 3 },
        baseScene,
      ),
    ).toBe("action_handheld");
  });

  it("returns master_plus_mids as safe fallback when no breakdown", () => {
    expect(recommendPattern(null, baseScene)).toBe("master_plus_mids");
  });

  it("returns master_only for very short scenes (< 1 page)", () => {
    expect(
      recommendPattern(
        { castWithDialogue: ["MARCO"], actionNoteCount: 0 },
        { ...baseScene, pageStart: 1, pageEnd: 1 },
      ),
    ).toBe("master_only");
  });

  it("returns master_plus_mids for 1 speaking character monologue", () => {
    expect(
      recommendPattern(
        { castWithDialogue: ["MARCO"], actionNoteCount: 0 },
        { ...baseScene, pageStart: 1, pageEnd: 3 },
      ),
    ).toBe("master_plus_mids");
  });

  it("returns shot_reverse_shot for 2 speaking characters", () => {
    expect(
      recommendPattern(
        { castWithDialogue: ["MARCO", "GIULIA"], actionNoteCount: 0 },
        { ...baseScene, pageStart: 1, pageEnd: 3 },
      ),
    ).toBe("shot_reverse_shot");
  });

  it("returns three_way_dialogue for 3 speaking characters", () => {
    expect(
      recommendPattern(
        {
          castWithDialogue: ["MARCO", "GIULIA", "LUCA"],
          actionNoteCount: 0,
        },
        { ...baseScene, pageStart: 1, pageEnd: 3 },
      ),
    ).toBe("three_way_dialogue");
  });

  it("returns three_way_dialogue for 5+ speaking characters", () => {
    expect(
      recommendPattern(
        {
          castWithDialogue: ["A", "B", "C", "D", "E"],
          actionNoteCount: 0,
        },
        { ...baseScene, pageStart: 1, pageEnd: 3 },
      ),
    ).toBe("three_way_dialogue");
  });

  it("returns coverage_standard when no speaking characters at all", () => {
    expect(
      recommendPattern(
        { castWithDialogue: [], actionNoteCount: 0 },
        { ...baseScene, pageStart: 1, pageEnd: 3 },
      ),
    ).toBe("coverage_standard");
  });

  it("handles missing pageStart/pageEnd as default 1 page", () => {
    expect(
      recommendPattern(
        { castWithDialogue: ["MARCO", "GIULIA"], actionNoteCount: 0 },
        { ...baseScene, pageStart: null, pageEnd: null },
      ),
    ).toBe("shot_reverse_shot");
  });
});
```

- [ ] **Step 3: Export from schedule index**

Edit `packages/domain/src/schedule/index.ts`. Add:

```typescript
export * from "./recommend-pattern.js";
```

- [ ] **Step 4: Run the test**

Run: `pnpm --filter @oh-writers/domain vitest run packages/domain/src/schedule/recommend-pattern.test.ts`
Expected: 10 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/schedule/recommend-pattern.ts packages/domain/src/schedule/recommend-pattern.test.ts packages/domain/src/schedule/index.ts
git commit --no-verify -m "[OHW] feat(domain): add recommendPattern for auto-populate"
```

---

## Task 4: Server function `getBreakdownSummary`

**Files:**

- Modify: `apps/web/app/features/shooting-plan/server/shooting-plan.server.ts`

- [ ] **Step 1: Find the breakdown schema**

Run: `grep -rn "scene_id\|sceneId" packages/db/src/schema/breakdown.ts | head -20`

The breakdown elements should have a `sceneId` foreign key and a `category` text column (one of cast/props/extras/...). Each element has a `name`. Locate the exact column names (typically `breakdownElements` table with `sceneId`, `category`, `name`).

- [ ] **Step 2: Locate insertion point in server file**

Open `apps/web/app/features/shooting-plan/server/shooting-plan.server.ts`. Scroll to the end. The new server functions will be appended after `scenesWithPlanSummaryQueryOptions`.

- [ ] **Step 3: Add imports**

At the top, ensure these are imported (some likely already are):

```typescript
import { breakdownElements } from "@oh-writers/db/schema";
import { recommendPattern, type BreakdownSummary } from "@oh-writers/domain";
```

If `breakdownElements` does not exist in the schema, run `grep -rn "pgTable.*breakdown" packages/db/src/schema/` and use the actual table name (e.g., `breakdownEntries`, `castMembers`). Use whatever the existing breakdown server functions in `apps/web/app/features/breakdown/` import.

- [ ] **Step 4: Add server function and queryOptions**

Append at the end of the file:

```typescript
export const getBreakdownSummary = createServerFn({ method: "GET" })
  .validator(z.object({ sceneId: z.string().uuid() }))
  .handler(
    async ({
      data,
    }): Promise<ResultShape<BreakdownSummary, ForbiddenError | DbError>> => {
      await requireUser();
      const db = await getDb();

      const result = await ResultAsync.fromPromise(
        (async () => {
          const rows = await db.query.breakdownElements.findMany({
            where: (e, { eq: eqHelper }) => eqHelper(e.sceneId, data.sceneId),
          });

          const castWithDialogue = Array.from(
            new Set(
              rows
                .filter((r) => r.category === "cast" && r.hasDialogue === true)
                .map((r) => r.name),
            ),
          );

          const actionNoteCount = rows.filter(
            (r) =>
              r.category === "stunts" ||
              r.category === "sfx" ||
              r.category === "vfx",
          ).length;

          return { castWithDialogue, actionNoteCount } satisfies BreakdownSummary;
        })(),
        (e) => new DbError("getBreakdownSummary", e),
      );

      return toShape(result);
    },
  );

export const breakdownSummaryQueryOptions = (sceneId: string) =>
  queryOptions({
    queryKey: ["shooting-plan", "breakdown-summary", sceneId],
    queryFn: () => getBreakdownSummary({ data: { sceneId } }),
  });
```

If the breakdown schema does not have a `hasDialogue` column on cast elements, fall back to: `castWithDialogue = unique names of category=cast rows` (every cast member counted). Match whatever fields actually exist. Verify by running: `grep -n "hasDialogue\|has_dialogue" packages/db/src/schema/breakdown.ts`.

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @oh-writers/web typecheck`
Expected: only pre-existing budget errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/features/shooting-plan/server/shooting-plan.server.ts
git commit --no-verify -m "[OHW] feat(shooting-plan): add getBreakdownSummary server function"
```

---

## Task 5: Server function `applyPattern`

**Files:**

- Modify: `apps/web/app/features/shooting-plan/server/shooting-plan.server.ts`

- [ ] **Step 1: Add imports**

Ensure these are imported (check existing imports first):

```typescript
import { COVERAGE_PATTERNS, type PatternId, PATTERN_IDS } from "@oh-writers/domain";
import { sql } from "drizzle-orm";
```

- [ ] **Step 2: Add server function**

Append after `getBreakdownSummary` in the server file:

```typescript
export const applyPattern = createServerFn({ method: "POST" })
  .validator(
    z.object({
      scenarioId: z.string().uuid(),
      patternId: z.enum(PATTERN_IDS),
      atPosition: z.number().int().min(0).nullable().optional(),
    }),
  )
  .handler(
    async ({
      data,
    }): Promise<ResultShape<void, ScenarioNotFoundError | ForbiddenError | DbError>> => {
      await requireUser();
      const db = await getDb();

      const result = await ResultAsync.fromPromise(
        (async () => {
          const scenario = await db.query.shotPlanScenarios.findFirst({
            where: eq(shotPlanScenarios.id, data.scenarioId),
          });
          if (!scenario) {
            throw new ScenarioNotFoundError(data.scenarioId);
          }

          const pattern = COVERAGE_PATTERNS[data.patternId];
          const existingShots = await db
            .select()
            .from(shots)
            .where(eq(shots.scenarioId, data.scenarioId))
            .orderBy(asc(shots.position));

          const startPosition =
            data.atPosition ?? existingShots.length;

          // Shift positions of shots at/after startPosition by N (pattern length)
          if (startPosition < existingShots.length) {
            await db
              .update(shots)
              .set({ position: sql`${shots.position} + ${pattern.shots.length}` })
              .where(
                and(
                  eq(shots.scenarioId, data.scenarioId),
                  sql`${shots.position} >= ${startPosition}`,
                ),
              );
          }

          // Insert new shots
          const newShots = pattern.shots.map((s, i) => ({
            scenarioId: data.scenarioId,
            position: startPosition + i,
            shotSize: s.shotSize,
            cameraMovement: s.cameraMovement,
            estimatedMinutes: null,
            notes: s.notesHint,
            cameraLabel: "A" as const,
          }));
          await db.insert(shots).values(newShots);

          // Clear is_suggested on this scenario
          await db
            .update(shotPlanScenarios)
            .set({ isSuggested: false, updatedAt: new Date() })
            .where(eq(shotPlanScenarios.id, data.scenarioId));

          // Rebuild auto transitions for the scenario
          await rebuildAutoTransitions(db, data.scenarioId);
        })(),
        (e) => {
          if (e instanceof ScenarioNotFoundError) return e;
          return new DbError("applyPattern", e);
        },
      );

      return toShape(result);
    },
  );
```

`rebuildAutoTransitions` is an existing private helper in the same file (defined for spec 22). If it does not take `(db, scenarioId)` as arguments, adapt the call.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @oh-writers/web typecheck`
Expected: only pre-existing budget errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/features/shooting-plan/server/shooting-plan.server.ts
git commit --no-verify -m "[OHW] feat(shooting-plan): add applyPattern server function"
```

---

## Task 6: Server function `getOrCreateInitialPlan`

**Files:**

- Modify: `apps/web/app/features/shooting-plan/server/shooting-plan.server.ts`

- [ ] **Step 1: Add server function**

Append after `applyPattern` in the server file:

```typescript
export const getOrCreateInitialPlan = createServerFn({ method: "POST" })
  .validator(
    z.object({
      sceneId: z.string().uuid(),
      projectId: z.string().uuid(),
    }),
  )
  .handler(
    async ({
      data,
    }): Promise<ResultShape<ShotPlanView, ForbiddenError | DbError>> => {
      await requireUser();
      const db = await getDb();

      const result = await ResultAsync.fromPromise(
        (async () => {
          // 1. Check if plan already exists for this scene
          const existing = await db.query.shotPlans.findFirst({
            where: eq(shotPlans.sceneId, data.sceneId),
          });
          if (existing) {
            return await buildShotPlanView(db, existing.id);
          }

          // 2. Create the shot plan
          const planId = crypto.randomUUID();
          await db.insert(shotPlans).values({
            id: planId,
            projectId: data.projectId,
            sceneId: data.sceneId,
            activeScenarioId: null,
          });

          // 3. Create Piano A scenario marked as suggested
          const scenarioId = crypto.randomUUID();
          await db.insert(shotPlanScenarios).values({
            id: scenarioId,
            shotPlanId: planId,
            name: "Piano A",
            position: 0,
            isSuggested: true,
          });

          // 4. Activate it
          await db
            .update(shotPlans)
            .set({ activeScenarioId: scenarioId })
            .where(eq(shotPlans.id, planId));

          // 5. Fetch the scene and breakdown summary for the recommendation
          const scene = await db.query.scenes.findFirst({
            where: (sc, { eq: e }) => e(sc.id, data.sceneId),
          });
          if (!scene) {
            throw new DbError(
              "getOrCreateInitialPlan",
              new Error(`Scene ${data.sceneId} not found`),
            );
          }

          // Inline breakdown summary computation (avoid recursive server call)
          const breakdownRows = await db.query.breakdownElements
            .findMany({
              where: (e, { eq: eqH }) => eqH(e.sceneId, data.sceneId),
            })
            .catch(() => []);
          const breakdownSummary: BreakdownSummary | null =
            breakdownRows.length > 0
              ? {
                  castWithDialogue: Array.from(
                    new Set(
                      breakdownRows
                        .filter(
                          (r) =>
                            r.category === "cast" &&
                            (r as { hasDialogue?: boolean }).hasDialogue ===
                              true,
                        )
                        .map((r) => r.name),
                    ),
                  ),
                  actionNoteCount: breakdownRows.filter(
                    (r) =>
                      r.category === "stunts" ||
                      r.category === "sfx" ||
                      r.category === "vfx",
                  ).length,
                }
              : null;

          const patternId = recommendPattern(breakdownSummary, {
            pageStart: scene.pageStart,
            pageEnd: scene.pageEnd,
            hasSpecialEffect: scene.hasSpecialEffect,
          });

          // 6. Apply the pattern via the same logic — inline to stay transactional
          const pattern = COVERAGE_PATTERNS[patternId];
          const newShots = pattern.shots.map((s, i) => ({
            scenarioId,
            position: i,
            shotSize: s.shotSize,
            cameraMovement: s.cameraMovement,
            estimatedMinutes: null,
            notes: s.notesHint,
            cameraLabel: "A" as const,
          }));
          await db.insert(shots).values(newShots);

          // 7. Re-fetch the assembled plan
          return await buildShotPlanView(db, planId);
        })(),
        (e) => (e instanceof DbError ? e : new DbError("getOrCreateInitialPlan", e)),
      );

      return toShape(result);
    },
  );
```

`buildShotPlanView` is an existing private helper (or a private function we can introduce by extracting the assembly logic from `getShotPlan`). If it doesn't exist as a private helper yet, extract it:

```typescript
const buildShotPlanView = async (
  db: Db,
  shotPlanId: string,
): Promise<ShotPlanView> => {
  // Move the body of getShotPlan's handler that assembles the view here.
  // It should return a ShotPlanView object.
};
```

Then `getShotPlan` calls `buildShotPlanView(db, plan.id)` instead of inlining.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @oh-writers/web typecheck`
Expected: only pre-existing budget errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/features/shooting-plan/server/shooting-plan.server.ts
git commit --no-verify -m "[OHW] feat(shooting-plan): add getOrCreateInitialPlan with auto-populate"
```

---

## Task 7: Server function `moveShot` (cross-plan drag)

**Files:**

- Modify: `apps/web/app/features/shooting-plan/server/shooting-plan.server.ts`

- [ ] **Step 1: Add server function**

Append after `getOrCreateInitialPlan`:

```typescript
export const moveShot = createServerFn({ method: "POST" })
  .validator(
    z.object({
      shotId: z.string().uuid(),
      targetScenarioId: z.string().uuid(),
      position: z.number().int().min(0),
    }),
  )
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<void, ShotNotFoundError | ScenarioNotFoundError | ForbiddenError | DbError>
    > => {
      await requireUser();
      const db = await getDb();

      const result = await ResultAsync.fromPromise(
        (async () => {
          const shot = await db.query.shots.findFirst({
            where: eq(shots.id, data.shotId),
          });
          if (!shot) throw new ShotNotFoundError(data.shotId);

          const target = await db.query.shotPlanScenarios.findFirst({
            where: eq(shotPlanScenarios.id, data.targetScenarioId),
          });
          if (!target) throw new ScenarioNotFoundError(data.targetScenarioId);

          const sourceScenarioId = shot.scenarioId;

          // Same-plan move = reorder
          if (sourceScenarioId === data.targetScenarioId) {
            // Get all shots in scenario, compute new ordering with shot moved to position
            const all = await db
              .select()
              .from(shots)
              .where(eq(shots.scenarioId, sourceScenarioId))
              .orderBy(asc(shots.position));
            const filtered = all.filter((s) => s.id !== data.shotId);
            const newOrder = [
              ...filtered.slice(0, data.position),
              shot,
              ...filtered.slice(data.position),
            ];
            for (let i = 0; i < newOrder.length; i++) {
              await db
                .update(shots)
                .set({ position: i })
                .where(eq(shots.id, newOrder[i].id));
            }
          } else {
            // Cross-plan: shift target positions, update shot, close source gap
            await db
              .update(shots)
              .set({ position: sql`${shots.position} + 1` })
              .where(
                and(
                  eq(shots.scenarioId, data.targetScenarioId),
                  sql`${shots.position} >= ${data.position}`,
                ),
              );

            await db
              .update(shots)
              .set({
                scenarioId: data.targetScenarioId,
                position: data.position,
              })
              .where(eq(shots.id, data.shotId));

            // Close gap in source scenario
            const remaining = await db
              .select()
              .from(shots)
              .where(eq(shots.scenarioId, sourceScenarioId))
              .orderBy(asc(shots.position));
            for (let i = 0; i < remaining.length; i++) {
              if (remaining[i].position !== i) {
                await db
                  .update(shots)
                  .set({ position: i })
                  .where(eq(shots.id, remaining[i].id));
              }
            }
          }

          // Clear is_suggested on both scenarios (only target if same-plan)
          const scenariosToClear =
            sourceScenarioId === data.targetScenarioId
              ? [data.targetScenarioId]
              : [sourceScenarioId, data.targetScenarioId];
          for (const id of scenariosToClear) {
            await db
              .update(shotPlanScenarios)
              .set({ isSuggested: false, updatedAt: new Date() })
              .where(eq(shotPlanScenarios.id, id));
          }

          // Rebuild auto transitions for affected scenarios
          for (const id of scenariosToClear) {
            await rebuildAutoTransitions(db, id);
          }
        })(),
        (e) => {
          if (e instanceof ShotNotFoundError) return e;
          if (e instanceof ScenarioNotFoundError) return e;
          return new DbError("moveShot", e);
        },
      );

      return toShape(result);
    },
  );
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @oh-writers/web typecheck`
Expected: only pre-existing budget errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/features/shooting-plan/server/shooting-plan.server.ts
git commit --no-verify -m "[OHW] feat(shooting-plan): add moveShot server function for cross-plan drag"
```

---

## Task 8: Server function `addReverseShot` + clear `is_suggested` on existing mutations

**Files:**

- Modify: `apps/web/app/features/shooting-plan/server/shooting-plan.server.ts`

- [ ] **Step 1: Add `InvalidReverseShotError`**

Open `apps/web/app/features/shooting-plan/shooting-plan.errors.ts`. Append:

```typescript
export class InvalidReverseShotError {
  readonly _tag = "InvalidReverseShotError" as const;
  readonly message: string;
  constructor(reason: string) {
    this.message = `Cannot create reverse shot: ${reason}`;
  }
}
```

- [ ] **Step 2: Add `addReverseShot` server function**

Append to `shooting-plan.server.ts` after `moveShot`. Import `InvalidReverseShotError` at top.

```typescript
export const addReverseShot = createServerFn({ method: "POST" })
  .validator(z.object({ shotId: z.string().uuid() }))
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<void, ShotNotFoundError | InvalidReverseShotError | ForbiddenError | DbError>
    > => {
      await requireUser();
      const db = await getDb();

      const result = await ResultAsync.fromPromise(
        (async () => {
          const shot = await db.query.shots.findFirst({
            where: eq(shots.id, data.shotId),
          });
          if (!shot) throw new ShotNotFoundError(data.shotId);

          if (shot.shotSize !== "OTS" && shot.shotSize !== "MS") {
            throw new InvalidReverseShotError(
              "reverse shots only apply to OTS or MS",
            );
          }

          const scenario = await db.query.shotPlanScenarios.findFirst({
            where: eq(shotPlanScenarios.id, shot.scenarioId),
          });
          if (!scenario) throw new ShotNotFoundError(data.shotId);

          const plan = await db.query.shotPlans.findFirst({
            where: eq(shotPlans.id, scenario.shotPlanId),
          });
          if (!plan) throw new ShotNotFoundError(data.shotId);

          // Determine reverse note from original notes
          const originalNote = shot.notes ?? "";
          const reverseNote =
            originalNote.toLowerCase().includes("campo")
              ? originalNote.toLowerCase().includes("contro")
                ? "campo"
                : "controcampo"
              : originalNote
                ? `controcampo ${originalNote}`
                : "controcampo";

          // Find max position in scenario, insert after current shot
          const allShots = await db
            .select()
            .from(shots)
            .where(eq(shots.scenarioId, shot.scenarioId))
            .orderBy(asc(shots.position));
          const insertPosition = shot.position + 1;

          // Shift later shots
          await db
            .update(shots)
            .set({ position: sql`${shots.position} + 1` })
            .where(
              and(
                eq(shots.scenarioId, shot.scenarioId),
                sql`${shots.position} >= ${insertPosition}`,
              ),
            );

          // Insert reverse
          await db.insert(shots).values({
            scenarioId: shot.scenarioId,
            position: insertPosition,
            shotSize: shot.shotSize,
            cameraMovement: shot.cameraMovement,
            estimatedMinutes: shot.estimatedMinutes,
            notes: reverseNote,
            cameraLabel: shot.cameraLabel,
          });

          await db
            .update(shotPlanScenarios)
            .set({ isSuggested: false, updatedAt: new Date() })
            .where(eq(shotPlanScenarios.id, shot.scenarioId));

          await rebuildAutoTransitions(db, shot.scenarioId);
        })(),
        (e) => {
          if (e instanceof ShotNotFoundError) return e;
          if (e instanceof InvalidReverseShotError) return e;
          return new DbError("addReverseShot", e);
        },
      );

      return toShape(result);
    },
  );
```

- [ ] **Step 3: Add `is_suggested` clearing to existing mutations**

Find each of these handlers in the same file: `addShot`, `updateShot`, `deleteShot`, `reorderShots`, `addManualTransition`, `updateTransition`, `deleteTransition`. After their main DB op succeeds and before `rebuildAutoTransitions` (or at the end of their tx block), add:

```typescript
await db
  .update(shotPlanScenarios)
  .set({ isSuggested: false, updatedAt: new Date() })
  .where(eq(shotPlanScenarios.id, /* scenarioId variable in scope */));
```

The exact scenarioId variable depends on each handler. For `addShot`, `reorderShots`, `addManualTransition`: directly available as `data.scenarioId`. For `updateShot`, `deleteShot`, `updateTransition`, `deleteTransition`: look up the shot/transition first to get the scenarioId.

If `setActiveScenario` is called (existing handler), do NOT clear `is_suggested` — selecting active is not a content edit.

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @oh-writers/web typecheck`
Expected: only pre-existing budget errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/features/shooting-plan/shooting-plan.errors.ts apps/web/app/features/shooting-plan/server/shooting-plan.server.ts
git commit --no-verify -m "[OHW] feat(shooting-plan): add addReverseShot + clear is_suggested on edits"
```

---

## Task 9: `useLocalStorage` SSR-safe hook

**Files:**

- Create: `apps/web/app/features/shooting-plan/hooks/useLocalStorage.ts`

- [ ] **Step 1: Write the hook**

Create `apps/web/app/features/shooting-plan/hooks/useLocalStorage.ts`:

```typescript
import { useEffect, useState, useCallback } from "react";

/**
 * SSR-safe localStorage state hook with debounced writes.
 * Returns [value, setValue, isHydrated].
 * Before hydration, returns the defaultValue and a no-op setter.
 */
export function useLocalStorage<T>(
  key: string,
  defaultValue: T,
): [T, (value: T) => void, boolean] {
  const [value, setValueState] = useState<T>(defaultValue);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== null) {
        setValueState(JSON.parse(raw) as T);
      }
    } catch {
      // ignore corrupted value
    }
    setIsHydrated(true);
  }, [key]);

  const setValue = useCallback(
    (next: T) => {
      setValueState(next);
      if (typeof window === "undefined") return;
      try {
        window.localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // quota / privacy mode — silent fail
      }
    },
    [key],
  );

  return [value, setValue, isHydrated];
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @oh-writers/web typecheck`
Expected: only pre-existing budget errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/features/shooting-plan/hooks/useLocalStorage.ts
git commit --no-verify -m "[OHW] feat(shooting-plan): add useLocalStorage hook"
```

---

## Task 10: `BlockingPlaceholder` component

**Files:**

- Create: `apps/web/app/features/shooting-plan/components/BlockingPlaceholder.tsx`
- Create: `apps/web/app/features/shooting-plan/components/BlockingPlaceholder.module.css`

- [ ] **Step 1: Write the component**

Create `BlockingPlaceholder.tsx`:

```typescript
import styles from "./BlockingPlaceholder.module.css";

export function BlockingPlaceholder() {
  return (
    <div className={styles.root} aria-label="Blocking 2D — disponibile in versione futura">
      <span className={styles.icon} aria-hidden="true">🎬</span>
      <span className={styles.text}>
        Blocking 2D — disponibile in versione futura (planimetria + posizioni camera)
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Write CSS**

Create `BlockingPlaceholder.module.css`:

```css
.root {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  block-size: 90px;
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.icon {
  font-size: var(--text-lg);
  opacity: 0.6;
}

.text {
  text-align: center;
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/features/shooting-plan/components/BlockingPlaceholder.tsx apps/web/app/features/shooting-plan/components/BlockingPlaceholder.module.css
git commit --no-verify -m "[OHW] feat(shooting-plan): add BlockingPlaceholder stub for spec 22c"
```

---

## Task 11: `ScriptPanel` collapsible component

**Files:**

- Create: `apps/web/app/features/shooting-plan/components/ScriptPanel.tsx`
- Create: `apps/web/app/features/shooting-plan/components/ScriptPanel.module.css`

- [ ] **Step 1: Find the screenplay fountain content for a scene**

The scene heading is stored, but the fountain body text is typically in `screenplays.content` (the entire screenplay) and split per-scene by `pageStart`/`pageEnd` or by a separate parsing helper. Find how breakdown displays scene text:

Run: `grep -rn "scene.*content\|scene.*body\|sceneFountain" apps/web/app/features/ --include="*.ts" --include="*.tsx" | head -10`

If a `getSceneText` server function exists in `features/breakdown/`, reuse it. Otherwise, for this task, render only the scene heading + the `notes` field of the scene (already in `scenes` table) as a minimum viable script panel.

- [ ] **Step 2: Write a minimum-viable ScriptPanel**

Create `ScriptPanel.tsx` rendering the heading + notes (text-only, no fountain parsing for now):

```typescript
import { useLocalStorage } from "../hooks/useLocalStorage";
import styles from "./ScriptPanel.module.css";

interface ScriptPanelProps {
  sceneNumber: number;
  sceneHeading: string;
  sceneNotes: string | null;
  storageKey: string; // e.g. `ohw:shooting-plan:script-panel:open`
  onJumpToScreenplay?: () => void;
}

export function ScriptPanel({
  sceneNumber,
  sceneHeading,
  sceneNotes,
  storageKey,
  onJumpToScreenplay,
}: ScriptPanelProps) {
  const [isOpen, setIsOpen] = useLocalStorage<boolean>(storageKey, false);

  if (!isOpen) {
    return (
      <button
        type="button"
        className={styles.collapsedTab}
        onClick={() => setIsOpen(true)}
        aria-label="Apri pannello sceneggiatura"
      >
        <span className={styles.collapsedIcon}>📄</span>
        <span className={styles.collapsedLabel}>SCENA ▶</span>
      </button>
    );
  }

  return (
    <aside className={styles.panel} aria-label="Pannello sceneggiatura">
      <header className={styles.header}>
        <div className={styles.headerTitle}>
          📄 Scena {sceneNumber} — testo
        </div>
        <div className={styles.headerActions}>
          {onJumpToScreenplay && (
            <button
              type="button"
              className={styles.iconBtn}
              onClick={onJumpToScreenplay}
              title="Apri nello Screenplay editor"
            >
              ↗
            </button>
          )}
          <button
            type="button"
            className={styles.iconBtn}
            onClick={() => setIsOpen(false)}
            aria-label="Chiudi pannello"
          >
            ◀
          </button>
        </div>
      </header>

      <div className={styles.body}>
        <div className={styles.sceneHeading}>{sceneHeading}</div>
        {sceneNotes ? (
          <div className={styles.notes}>{sceneNotes}</div>
        ) : (
          <p className={styles.empty}>
            Nessuna nota di scena. Apri lo Screenplay editor per il testo completo.
          </p>
        )}
      </div>

      <footer className={styles.footer}>
        <span>read-only</span>
      </footer>
    </aside>
  );
}
```

Note: full fountain rendering (action / character / dialogue formatting) is out of scope for this task. The current minimum-viable renders heading + scene notes. A follow-up task can extend it once the engineer has identified or built a scene-text server function.

- [ ] **Step 3: Write CSS**

Create `ScriptPanel.module.css`:

```css
.collapsedTab {
  inline-size: 36px;
  block-size: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  padding: var(--space-3) 0;
  background: var(--color-bg);
  border: none;
  border-inline-end: 1px solid var(--color-border);
  color: var(--color-text-muted);
  cursor: pointer;
  transition: background 120ms ease;

  &:hover {
    background: var(--color-surface-hover);
    color: var(--color-text);
  }
}

.collapsedIcon {
  font-size: var(--text-base);
}

.collapsedLabel {
  writing-mode: vertical-rl;
  text-orientation: mixed;
  font-size: var(--text-xs);
  letter-spacing: var(--tracking-caps);
  text-transform: uppercase;
}

.panel {
  inline-size: 320px;
  block-size: 100%;
  display: flex;
  flex-direction: column;
  background: var(--color-bg);
  border-inline-end: 1px solid var(--color-border);
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-2) var(--space-3);
  border-block-end: 1px solid var(--color-border);
}

.headerTitle {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: var(--tracking-caps);
}

.headerActions {
  display: flex;
  gap: var(--space-1);
}

.iconBtn {
  background: transparent;
  border: 1px solid var(--color-border);
  color: var(--color-text-muted);
  font-size: var(--text-xs);
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  cursor: pointer;

  &:hover {
    background: var(--color-surface-hover);
    color: var(--color-text);
  }
}

.body {
  flex: 1;
  padding: var(--space-3);
  overflow-y: auto;
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  line-height: var(--leading-normal);
  color: var(--color-text);
}

.sceneHeading {
  color: var(--color-fg);
  font-weight: var(--weight-bold);
  text-transform: uppercase;
  margin-block-end: var(--space-3);
}

.notes {
  white-space: pre-wrap;
}

.empty {
  color: var(--color-text-muted);
  font-style: italic;
  font-family: var(--font-sans);
  font-size: var(--text-xs);
}

.footer {
  padding: var(--space-2) var(--space-3);
  border-block-start: 1px solid var(--color-border);
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

@media (prefers-reduced-motion: reduce) {
  .collapsedTab {
    transition: none;
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/features/shooting-plan/components/ScriptPanel.tsx apps/web/app/features/shooting-plan/components/ScriptPanel.module.css
git commit --no-verify -m "[OHW] feat(shooting-plan): add ScriptPanel collapsible component"
```

---

## Task 12: `PlanPicker` with inline popover

**Files:**

- Create: `apps/web/app/features/shooting-plan/components/PlanPicker.tsx`
- Create: `apps/web/app/features/shooting-plan/components/PlanPicker.module.css`

- [ ] **Step 1: Write the component**

```typescript
import { useState } from "react";
import type { ScenarioView } from "../server/shooting-plan.server";
import styles from "./PlanPicker.module.css";

interface PlanPickerProps {
  scenarios: ScenarioView[];
  visibleScenarioIds: Set<string>;
  onToggleVisible: (scenarioId: string) => void;
  onCreatePlan: (init: "empty" | "copy" | "pattern") => void;
}

export function PlanPicker({
  scenarios,
  visibleScenarioIds,
  onToggleVisible,
  onCreatePlan,
}: PlanPickerProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);

  return (
    <div className={styles.root} role="group" aria-label="Selezione piani visibili">
      <span className={styles.label}>Mostra:</span>
      {scenarios.map((s) => {
        const visible = visibleScenarioIds.has(s.id);
        return (
          <button
            key={s.id}
            type="button"
            className={styles.pill}
            data-visible={visible || undefined}
            onClick={() => onToggleVisible(s.id)}
          >
            <span className={styles.check}>{visible ? "✓" : "○"}</span>
            <span>{s.name}</span>
          </button>
        );
      })}

      <div className={styles.addWrap}>
        <button
          type="button"
          className={styles.addBtn}
          onClick={() => setPopoverOpen((o) => !o)}
        >
          + piano
        </button>
        {popoverOpen && (
          <div className={styles.popover} role="menu">
            <div className={styles.popoverLabel}>Crea Piano come:</div>
            <button
              type="button"
              className={styles.popoverItem}
              onClick={() => {
                setPopoverOpen(false);
                onCreatePlan("empty");
              }}
            >
              Vuoto
            </button>
            <button
              type="button"
              className={styles.popoverItem}
              onClick={() => {
                setPopoverOpen(false);
                onCreatePlan("copy");
              }}
              disabled={scenarios.length === 0}
            >
              Copia piano attivo
            </button>
            <button
              type="button"
              className={styles.popoverItem}
              onClick={() => {
                setPopoverOpen(false);
                onCreatePlan("pattern");
              }}
            >
              Da pattern…
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write CSS**

```css
.root {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-xs);
}

.label {
  color: var(--color-text-muted);
}

.pill {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: 3px var(--space-2);
  border-radius: var(--radius-full);
  background: transparent;
  border: 1px solid var(--color-border);
  color: var(--color-text-muted);
  font-size: var(--text-xs);
  cursor: pointer;
  transition: background 120ms ease;

  &:hover {
    background: var(--color-surface-hover);
    color: var(--color-text);
  }

  &[data-visible] {
    background: var(--color-accent-subtle);
    border-color: var(--color-accent-border);
    color: var(--color-accent);
  }
}

.check {
  font-size: 10px;
  font-weight: var(--weight-bold);
}

.addWrap {
  position: relative;
}

.addBtn {
  padding: 3px var(--space-2);
  border-radius: var(--radius-full);
  background: transparent;
  border: 1px dashed var(--color-border-strong);
  color: var(--color-text-muted);
  font-size: var(--text-xs);
  cursor: pointer;

  &:hover {
    border-color: var(--color-accent);
    color: var(--color-accent);
  }
}

.popover {
  position: absolute;
  inset-block-start: calc(100% + var(--space-1));
  inset-inline-end: 0;
  min-inline-size: 180px;
  padding: var(--space-1);
  background: var(--color-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  z-index: var(--z-dropdown);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.popoverLabel {
  padding: var(--space-1) var(--space-2);
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: var(--tracking-caps);
}

.popoverItem {
  text-align: start;
  padding: var(--space-1) var(--space-2);
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--color-text);
  font-size: var(--text-sm);
  cursor: pointer;

  &:hover:not(:disabled) {
    background: var(--color-surface-hover);
  }

  &:disabled {
    color: var(--color-text-muted);
    cursor: not-allowed;
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/features/shooting-plan/components/PlanPicker.tsx apps/web/app/features/shooting-plan/components/PlanPicker.module.css
git commit --no-verify -m "[OHW] feat(shooting-plan): add PlanPicker with show/hide pills + new-plan popover"
```

---

## Task 13: `QuickAddToolbar` with tooltips and `PatternMenu`

**Files:**

- Create: `apps/web/app/features/shooting-plan/components/QuickAddToolbar.tsx`
- Create: `apps/web/app/features/shooting-plan/components/QuickAddToolbar.module.css`
- Create: `apps/web/app/features/shooting-plan/components/PatternMenu.tsx`
- Create: `apps/web/app/features/shooting-plan/components/PatternMenu.module.css`

- [ ] **Step 1: Write `PatternMenu.tsx`**

```typescript
import {
  COVERAGE_PATTERNS,
  PATTERN_IDS,
  type PatternId,
} from "@oh-writers/domain";
import styles from "./PatternMenu.module.css";

interface PatternMenuProps {
  recommendedId: PatternId | null;
  onSelect: (id: PatternId) => void;
  onClose: () => void;
}

const formatMin = (m: number): string =>
  m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;

export function PatternMenu({ recommendedId, onSelect, onClose }: PatternMenuProps) {
  return (
    <div className={styles.menu} role="menu">
      <div className={styles.label}>Pattern copertura</div>
      {PATTERN_IDS.map((id) => {
        const p = COVERAGE_PATTERNS[id];
        const isRecommended = id === recommendedId;
        return (
          <button
            key={id}
            type="button"
            className={styles.item}
            data-recommended={isRecommended || undefined}
            title={`${p.label} — ${p.description}`}
            onClick={() => {
              onSelect(id);
              onClose();
            }}
          >
            <span className={styles.itemMain}>
              <span className={styles.itemLabel}>{p.label}</span>
              <span className={styles.itemDesc}>
                {p.shots.length} shot · {formatMin(p.estimatedMinutesHint)}
              </span>
            </span>
            {isRecommended && (
              <span className={styles.recommendedBadge}>consigliato</span>
            )}
          </button>
        );
      })}
      <div className={styles.divider} />
      <button
        type="button"
        className={styles.item}
        disabled
        title="Disponibile in una versione futura"
      >
        + Salva piano attuale come pattern…
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Write `PatternMenu.module.css`**

```css
.menu {
  inline-size: 280px;
  padding: var(--space-1);
  background: var(--color-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.label {
  padding: var(--space-1) var(--space-2);
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: var(--tracking-caps);
}

.item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  text-align: start;
  padding: var(--space-2);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  color: var(--color-text);
  cursor: pointer;

  &:hover:not(:disabled) {
    background: var(--color-surface-hover);
  }

  &[data-recommended] {
    background: var(--color-accent-subtle);
    border-color: var(--color-accent-border);
  }

  &:disabled {
    color: var(--color-text-muted);
    cursor: not-allowed;
  }
}

.itemMain {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.itemLabel {
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
}

.itemDesc {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

.recommendedBadge {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: var(--tracking-caps);
  color: var(--color-accent);
  font-weight: var(--weight-bold);
}

.divider {
  block-size: 1px;
  background: var(--color-border);
  margin-block: var(--space-1);
}
```

- [ ] **Step 3: Write `QuickAddToolbar.tsx`**

```typescript
import { useState } from "react";
import type { PatternId, ShotSize } from "@oh-writers/domain";
import { PatternMenu } from "./PatternMenu";
import styles from "./QuickAddToolbar.module.css";

interface QuickAddToolbarProps {
  recommendedPatternId: PatternId | null;
  onAddShot: (size: ShotSize) => void;
  onApplyPattern: (id: PatternId) => void;
  disabled?: boolean;
}

const SHOT_BUTTONS: { size: ShotSize; tooltip: string; tone: string }[] = [
  { size: "WS", tooltip: "Wide Shot — figura intera con ambiente", tone: "green" },
  { size: "EWS", tooltip: "Extreme Wide Shot — soggetto piccolo, ambiente dominante", tone: "green" },
  { size: "MS", tooltip: "Medium Shot — dalla vita in su", tone: "blue" },
  { size: "OTS", tooltip: "Over The Shoulder — da dietro le spalle di un personaggio", tone: "blue" },
  { size: "CU", tooltip: "Close-Up — primo piano (volto)", tone: "red" },
  { size: "ECU", tooltip: "Extreme Close-Up — dettaglio (occhi, labbra)", tone: "red" },
  { size: "INSERT", tooltip: "Insert — dettaglio di un oggetto o azione", tone: "orange" },
];

export function QuickAddToolbar({
  recommendedPatternId,
  onAddShot,
  onApplyPattern,
  disabled,
}: QuickAddToolbarProps) {
  const [patternOpen, setPatternOpen] = useState(false);

  return (
    <div className={styles.root} role="toolbar" aria-label="Quick-add shot">
      <span className={styles.label}>+ shot:</span>
      {SHOT_BUTTONS.map((b) => (
        <button
          key={b.size}
          type="button"
          className={styles.shotBtn}
          data-tone={b.tone}
          title={b.tooltip}
          disabled={disabled}
          onClick={() => onAddShot(b.size)}
        >
          {b.size}
        </button>
      ))}

      <div className={styles.divider} aria-hidden="true" />

      <div className={styles.patternWrap}>
        <button
          type="button"
          className={styles.patternBtn}
          title="Aggiunge una copertura completa (es. campo/controcampo)"
          disabled={disabled}
          onClick={() => setPatternOpen((o) => !o)}
        >
          ▼ Pattern…
        </button>
        {patternOpen && (
          <PatternMenu
            recommendedId={recommendedPatternId}
            onSelect={onApplyPattern}
            onClose={() => setPatternOpen(false)}
          />
        )}
      </div>

      <div className={styles.spacer} />
      <span className={styles.hint}>⌘D duplica · ⌫ elimina</span>
    </div>
  );
}
```

- [ ] **Step 4: Write `QuickAddToolbar.module.css`**

```css
.root {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-3);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: var(--text-xs);
}

.label {
  color: var(--color-text-muted);
  margin-inline-end: var(--space-1);
}

.shotBtn {
  padding: 4px 10px;
  border-radius: var(--radius-sm);
  font-weight: var(--weight-semibold);
  font-size: var(--text-xs);
  cursor: pointer;
  border: 1px solid transparent;
  background: transparent;
  color: var(--color-text);

  &:hover:not(:disabled) {
    background: var(--color-surface-hover);
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  &[data-tone="green"] {
    background: color-mix(in oklab, var(--color-accent-green) 14%, var(--color-surface));
    border-color: color-mix(in oklab, var(--color-accent-green) 35%, var(--color-border));
    color: var(--color-accent-green);
  }

  &[data-tone="blue"] {
    background: color-mix(in oklab, var(--color-accent-blue) 14%, var(--color-surface));
    border-color: color-mix(in oklab, var(--color-accent-blue) 35%, var(--color-border));
    color: var(--color-accent-blue);
  }

  &[data-tone="red"] {
    background: color-mix(in oklab, var(--color-accent-red) 14%, var(--color-surface));
    border-color: color-mix(in oklab, var(--color-accent-red) 35%, var(--color-border));
    color: var(--color-accent-red);
  }

  &[data-tone="orange"] {
    background: color-mix(in oklab, var(--color-accent-orange) 14%, var(--color-surface));
    border-color: color-mix(in oklab, var(--color-accent-orange) 35%, var(--color-border));
    color: var(--color-accent-orange);
  }
}

.divider {
  inline-size: 1px;
  block-size: 18px;
  background: var(--color-border);
  margin-inline: var(--space-1);
}

.patternWrap {
  position: relative;
}

.patternBtn {
  padding: 4px 10px;
  border-radius: var(--radius-sm);
  background: transparent;
  border: 1px solid var(--color-border-strong);
  color: var(--color-text);
  font-size: var(--text-xs);
  cursor: pointer;

  &:hover:not(:disabled) {
    background: var(--color-surface-hover);
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
}

.spacer {
  flex: 1;
}

.hint {
  color: var(--color-text-muted);
  font-size: 10px;
}
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/features/shooting-plan/components/QuickAddToolbar.tsx apps/web/app/features/shooting-plan/components/QuickAddToolbar.module.css apps/web/app/features/shooting-plan/components/PatternMenu.tsx apps/web/app/features/shooting-plan/components/PatternMenu.module.css
git commit --no-verify -m "[OHW] feat(shooting-plan): add QuickAddToolbar + PatternMenu with recommendation"
```

---

## Task 14: `PlanTrack` with 0–8h scaling + overflow indicator

**Files:**

- Create: `apps/web/app/features/shooting-plan/components/PlanTrack.tsx`
- Create: `apps/web/app/features/shooting-plan/components/PlanTrack.module.css`
- Modify: `apps/web/app/features/shooting-plan/components/ShotBlock.tsx` — accept `widthPct` prop instead of computing internally
- Modify: `apps/web/app/features/shooting-plan/components/TransitionBlock.tsx` — accept `widthPct` prop

- [ ] **Step 1: Define the constant in domain**

Edit `packages/domain/src/schedule/effort.ts`. Below `DAILY_CAPACITY_HOURS`:

```typescript
export const SHOOTING_DAY_MINUTES = DAILY_CAPACITY_HOURS * 60; // 480
```

Then re-export from `packages/domain/src/schedule/index.ts` (likely already covered by `export * from "./effort.js"`).

- [ ] **Step 2: Modify `ShotBlock.tsx` to accept widthPct**

In `ShotBlock.tsx`, replace the internal `widthPct` computation with a prop:

```typescript
interface ShotBlockProps {
  shot: ShotView;
  widthPct: number; // 0..100, computed by parent against 480m
  isSelected: boolean;
  onSelect: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}
```

Remove the `totalMinutes` prop. Update the `style={{ inlineSize: ... }}` to use the prop. Add `onContextMenu` handler if passed.

- [ ] **Step 3: Modify `TransitionBlock.tsx` similarly**

Same pattern — accept `widthPct` as a prop, remove internal calculation.

- [ ] **Step 4: Write `PlanTrack.tsx`**

```typescript
import { SHOOTING_DAY_MINUTES } from "@oh-writers/domain";
import type {
  ShotView,
  TransitionSlotView,
  ScenarioView,
} from "../server/shooting-plan.server";
import { ShotBlock } from "./ShotBlock";
import { TransitionBlock } from "./TransitionBlock";
import styles from "./PlanTrack.module.css";

interface PlanTrackProps {
  scenario: ScenarioView;
  isActive: boolean;
  selectedShotId: string | null;
  onSelectShot: (shotId: string) => void;
  onContextMenuShot: (shotId: string, e: React.MouseEvent) => void;
  onMakeActive: () => void;
  onDragStart: (shotId: string, e: React.DragEvent) => void;
  onDragOverTrack: (e: React.DragEvent) => void;
  onDropOnTrack: (e: React.DragEvent) => void;
  dropIndicatorLeftPct: number | null;
  dropIndicatorIsSamePlan: boolean;
}

const widthPctForMinutes = (m: number): number =>
  Math.min((m / SHOOTING_DAY_MINUTES) * 100, 100);

const formatMin = (m: number): string =>
  m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;

export function PlanTrack(props: PlanTrackProps) {
  const {
    scenario,
    isActive,
    selectedShotId,
    onSelectShot,
    onContextMenuShot,
    onMakeActive,
    onDragStart,
    onDragOverTrack,
    onDropOnTrack,
    dropIndicatorLeftPct,
    dropIndicatorIsSamePlan,
  } = props;

  const items: Array<
    | { kind: "shot"; shot: ShotView }
    | { kind: "transition"; transition: TransitionSlotView }
  > = [];
  // Interleave shots with their following transitions by position
  const shotsSorted = [...scenario.shots].sort((a, b) => a.position - b.position);
  for (const shot of shotsSorted) {
    items.push({ kind: "shot", shot });
    const tr = scenario.transitions.find((t) => t.afterShotId === shot.id);
    if (tr) items.push({ kind: "transition", transition: tr });
  }

  const totalMinutes = scenario.totalMinutes;
  const overflowMinutes = Math.max(0, totalMinutes - SHOOTING_DAY_MINUTES);

  return (
    <div className={styles.track} data-active={isActive || undefined}>
      <div className={styles.label}>
        <div className={styles.nameRow}>
          <span className={styles.name}>{scenario.name}</span>
          {isActive ? (
            <span className={styles.activeChip}>ATTIVO</span>
          ) : (
            <button
              type="button"
              className={styles.makeActiveBtn}
              onClick={onMakeActive}
            >
              RENDI ATTIVO
            </button>
          )}
          {scenario.isSuggested && (
            <span
              className={styles.suggestedChip}
              title="Pattern generato automaticamente — modifica per personalizzare"
            >
              suggerito
            </span>
          )}
        </div>
        <div className={styles.meta}>
          {formatMin(totalMinutes)} · {scenario.shots.length} shot
          {overflowMinutes > 0 && (
            <span className={styles.overflowBadge}>
              +{formatMin(overflowMinutes)} oltre giornata
            </span>
          )}
        </div>
      </div>

      <div
        className={styles.canvas}
        onDragOver={onDragOverTrack}
        onDrop={onDropOnTrack}
      >
        <div className={styles.blocks}>
          {items.map((it) => {
            if (it.kind === "shot") {
              const widthPct = widthPctForMinutes(it.shot.resolvedMinutes);
              return (
                <ShotBlock
                  key={it.shot.id}
                  shot={it.shot}
                  widthPct={widthPct}
                  isSelected={it.shot.id === selectedShotId}
                  onSelect={() => onSelectShot(it.shot.id)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    onContextMenuShot(it.shot.id, e);
                  }}
                  onDragStart={(e) => onDragStart(it.shot.id, e)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={onDropOnTrack}
                />
              );
            }
            const widthPct = widthPctForMinutes(
              it.transition.estimatedMinutes ?? 0,
            );
            return (
              <TransitionBlock
                key={it.transition.id}
                transition={it.transition}
                widthPct={widthPct}
              />
            );
          })}
        </div>
        {dropIndicatorLeftPct !== null && (
          <div
            className={styles.dropIndicator}
            data-same={dropIndicatorIsSamePlan || undefined}
            style={{ insetInlineStart: `${dropIndicatorLeftPct}%` }}
          />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Write `PlanTrack.module.css`**

```css
.track {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: transparent;
}

.label {
  inline-size: 120px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.nameRow {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  flex-wrap: wrap;
}

.name {
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
  color: var(--color-fg);
}

.activeChip {
  font-size: 8px;
  background: var(--color-accent-green);
  color: var(--color-on-accent);
  font-weight: var(--weight-bold);
  padding: 2px 7px;
  border-radius: var(--radius-full);
  letter-spacing: var(--tracking-caps);
}

.makeActiveBtn {
  font-size: 8px;
  background: transparent;
  color: var(--color-text-muted);
  border: 1px solid var(--color-border);
  padding: 2px 7px;
  border-radius: var(--radius-full);
  letter-spacing: var(--tracking-caps);
  cursor: pointer;

  &:hover {
    color: var(--color-accent-green);
    border-color: var(--color-accent-green);
  }
}

.suggestedChip {
  font-size: 8px;
  background: var(--color-amber-subtle);
  color: var(--color-amber);
  padding: 2px 6px;
  border-radius: var(--radius-full);
  letter-spacing: var(--tracking-caps);
}

.meta {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.overflowBadge {
  color: var(--color-error);
  font-weight: var(--weight-semibold);
}

.canvas {
  flex: 1;
  position: relative;
  block-size: 30px;
  background: var(--color-surface-inset);
  border-radius: var(--radius-sm);
  overflow: visible;
}

.blocks {
  display: flex;
  gap: 2px;
  block-size: 100%;
  align-items: stretch;
}

.dropIndicator {
  position: absolute;
  inset-block: -2px;
  inline-size: 3px;
  background: var(--color-accent-blue);
  box-shadow: 0 0 6px var(--color-accent-blue);
  border-radius: 2px;
  pointer-events: none;

  &[data-same] {
    background: var(--color-accent-green);
    box-shadow: 0 0 6px var(--color-accent-green);
  }
}
```

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @oh-writers/web typecheck`
Expected: only pre-existing budget errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/features/shooting-plan/components/PlanTrack.tsx apps/web/app/features/shooting-plan/components/PlanTrack.module.css apps/web/app/features/shooting-plan/components/ShotBlock.tsx apps/web/app/features/shooting-plan/components/TransitionBlock.tsx packages/domain/src/schedule/effort.ts
git commit --no-verify -m "[OHW] feat(shooting-plan): add PlanTrack with 0-8h scaling + overflow indicator"
```

---

## Task 15: `ShotContextMenu` component

**Files:**

- Create: `apps/web/app/features/shooting-plan/components/ShotContextMenu.tsx`
- Create: `apps/web/app/features/shooting-plan/components/ShotContextMenu.module.css`

- [ ] **Step 1: Write the component**

```typescript
import { useEffect, useRef } from "react";
import type { ShotView, ScenarioView } from "../server/shooting-plan.server";
import styles from "./ShotContextMenu.module.css";

interface ShotContextMenuProps {
  shot: ShotView;
  otherScenarios: ScenarioView[]; // scenarios in the same scene excluding shot's own
  position: { x: number; y: number };
  canAddReverse: boolean;
  onDuplicate: () => void;
  onAddReverse: () => void;
  onMoveTo: (targetScenarioId: string) => void;
  onDelete: () => void;
  onClose: () => void;
}

export function ShotContextMenu({
  shot,
  otherScenarios,
  position,
  canAddReverse,
  onDuplicate,
  onAddReverse,
  onMoveTo,
  onDelete,
  onClose,
}: ShotContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", escape);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className={styles.menu}
      style={{ insetInlineStart: position.x, insetBlockStart: position.y }}
      role="menu"
    >
      <button
        type="button"
        className={styles.item}
        onClick={() => {
          onDuplicate();
          onClose();
        }}
      >
        <span>📋 Duplica</span>
        <span className={styles.shortcut}>⌘D</span>
      </button>
      <button
        type="button"
        className={styles.item}
        disabled={!canAddReverse}
        title={
          canAddReverse
            ? "Crea lo specchio dello shot per il personaggio opposto"
            : "Disponibile solo per OTS o MS in scene a 2 personaggi"
        }
        onClick={() => {
          if (canAddReverse) {
            onAddReverse();
            onClose();
          }
        }}
      >
        ↔ Aggiungi controcampo
      </button>

      {otherScenarios.length > 0 && (
        <>
          <div className={styles.divider} />
          {otherScenarios.map((s) => (
            <button
              key={s.id}
              type="button"
              className={styles.item}
              onClick={() => {
                onMoveTo(s.id);
                onClose();
              }}
            >
              → Sposta a {s.name}
            </button>
          ))}
        </>
      )}

      <div className={styles.divider} />
      <button
        type="button"
        className={styles.itemDanger}
        onClick={() => {
          onDelete();
          onClose();
        }}
      >
        <span>🗑 Elimina</span>
        <span className={styles.shortcut}>⌫</span>
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Write CSS**

```css
.menu {
  position: fixed;
  min-inline-size: 200px;
  padding: var(--space-1);
  background: var(--color-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  z-index: var(--z-overlay);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  text-align: start;
  padding: var(--space-1) var(--space-2);
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--color-text);
  font-size: var(--text-sm);
  cursor: pointer;

  &:hover:not(:disabled) {
    background: var(--color-surface-hover);
  }

  &:disabled {
    color: var(--color-text-muted);
    cursor: not-allowed;
  }
}

.itemDanger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  text-align: start;
  padding: var(--space-1) var(--space-2);
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--color-accent-red);
  font-size: var(--text-sm);
  cursor: pointer;

  &:hover {
    background: var(--color-error-subtle);
  }
}

.shortcut {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

.divider {
  block-size: 1px;
  background: var(--color-border);
  margin-block: var(--space-1);
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/features/shooting-plan/components/ShotContextMenu.tsx apps/web/app/features/shooting-plan/components/ShotContextMenu.module.css
git commit --no-verify -m "[OHW] feat(shooting-plan): add ShotContextMenu right-click component"
```

---

## Task 16: `ParallelPlansEditor` orchestrator

**Files:**

- Create: `apps/web/app/features/shooting-plan/components/ParallelPlansEditor.tsx`
- Create: `apps/web/app/features/shooting-plan/components/ParallelPlansEditor.module.css`

- [ ] **Step 1: Write the orchestrator**

```typescript
import { useCallback, useMemo, useState } from "react";
import { useSuspenseQuery, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { PatternId, ShotSize, BreakdownSummary } from "@oh-writers/domain";
import { SHOOTING_DAY_MINUTES, recommendPattern, COVERAGE_PATTERNS } from "@oh-writers/domain";
import {
  getShotPlan,
  shotPlanQueryOptions,
  breakdownSummaryQueryOptions,
  applyPattern,
  addShot,
  deleteShot,
  setActiveScenario,
  moveShot,
  addReverseShot,
  createShotPlanAndScenario,
  scenesWithPlanSummaryQueryOptions,
  type ShotPlanView,
  type ScenarioView,
  type ShotView,
} from "../server/shooting-plan.server";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { PlanPicker } from "./PlanPicker";
import { PlanTrack } from "./PlanTrack";
import { QuickAddToolbar } from "./QuickAddToolbar";
import { ShotContextMenu } from "./ShotContextMenu";
import { ShotDetailPanel } from "./ShotDetailPanel";
import styles from "./ParallelPlansEditor.module.css";

interface ParallelPlansEditorProps {
  sceneId: string;
  projectId: string;
  sceneNumber: number;
  scenePageStart: number | null;
  scenePageEnd: number | null;
  sceneHasSpecialEffect: boolean;
}

const RULER_HOURS = [0, 1, 2, 3, 4, 5, 6, 7, 8];

export function ParallelPlansEditor({
  sceneId,
  projectId,
  sceneNumber,
  scenePageStart,
  scenePageEnd,
  sceneHasSpecialEffect,
}: ParallelPlansEditorProps) {
  const qc = useQueryClient();
  const { data: planRes } = useSuspenseQuery(shotPlanQueryOptions(sceneId, projectId));
  const plan: ShotPlanView | null = planRes?.isOk ? planRes.value : null;

  const { data: breakdownRes } = useQuery(breakdownSummaryQueryOptions(sceneId));
  const breakdown: BreakdownSummary | null =
    breakdownRes?.isOk ? breakdownRes.value : null;

  const recommendedPatternId: PatternId | null = useMemo(() => {
    if (!plan) return null;
    return recommendPattern(breakdown, {
      pageStart: scenePageStart,
      pageEnd: scenePageEnd,
      hasSpecialEffect: sceneHasSpecialEffect,
    });
  }, [breakdown, scenePageStart, scenePageEnd, sceneHasSpecialEffect, plan]);

  // Visibility per-scene from localStorage
  const [visibleIds, setVisibleIds] = useLocalStorage<string[]>(
    `ohw:shooting-plan:scene:${sceneId}:visible-plans`,
    plan ? plan.scenarios.map((s) => s.id) : [],
  );
  const visibleSet = useMemo(() => new Set(visibleIds), [visibleIds]);

  const visibleScenarios = useMemo(
    () => (plan ? plan.scenarios.filter((s) => visibleSet.has(s.id)) : []),
    [plan, visibleSet],
  );

  // If active scenario is hidden, banner
  const activeHidden =
    plan && plan.activeScenarioId && !visibleSet.has(plan.activeScenarioId);

  // Drag-and-drop state
  const [dragState, setDragState] = useState<{
    shotId: string;
    sourceScenarioId: string;
  } | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    scenarioId: string;
    position: number;
    leftPct: number;
  } | null>(null);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    shotId: string;
    position: { x: number; y: number };
  } | null>(null);

  // Selected shot for inline editor
  const [selectedShotId, setSelectedShotId] = useState<string | null>(null);
  const selectedShot: ShotView | null = useMemo(() => {
    if (!plan || !selectedShotId) return null;
    for (const s of plan.scenarios) {
      const found = s.shots.find((sh) => sh.id === selectedShotId);
      if (found) return found;
    }
    return null;
  }, [plan, selectedShotId]);

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["shot-plan", sceneId] });
    qc.invalidateQueries({ queryKey: ["shooting-plan", "scenes", projectId] });
  }, [qc, sceneId, projectId]);

  const addShotMut = useMutation({
    mutationFn: async (vars: { scenarioId: string; size: ShotSize }) => {
      return await addShot({
        data: {
          scenarioId: vars.scenarioId,
          shotPlanId: plan!.id,
          projectId,
          shotSize: vars.size,
          cameraMovement: "STATIC",
          estimatedMinutes: null,
          notes: null,
          cameraLabel: "A",
        },
      });
    },
    onSuccess: invalidate,
  });

  const applyPatternMut = useMutation({
    mutationFn: async (vars: { scenarioId: string; patternId: PatternId }) => {
      return await applyPattern({
        data: { scenarioId: vars.scenarioId, patternId: vars.patternId },
      });
    },
    onSuccess: invalidate,
  });

  const setActiveMut = useMutation({
    mutationFn: async (scenarioId: string) =>
      await setActiveScenario({
        data: { shotPlanId: plan!.id, scenarioId, projectId },
      }),
    onSuccess: invalidate,
  });

  const moveShotMut = useMutation({
    mutationFn: async (vars: {
      shotId: string;
      targetScenarioId: string;
      position: number;
    }) => await moveShot({ data: vars }),
    onSuccess: invalidate,
  });

  const deleteShotMut = useMutation({
    mutationFn: async (shotId: string) =>
      await deleteShot({ data: { shotId, shotPlanId: plan!.id, projectId } }),
    onSuccess: invalidate,
  });

  const addReverseMut = useMutation({
    mutationFn: async (shotId: string) =>
      await addReverseShot({ data: { shotId } }),
    onSuccess: invalidate,
  });

  const createPlanMut = useMutation({
    mutationFn: async (vars: { name: string }) =>
      await createShotPlanAndScenario({
        data: { sceneId, projectId, scenarioName: vars.name },
      }),
    onSuccess: invalidate,
  });

  if (!plan) {
    return (
      <div className={styles.empty}>
        <p>Caricamento piano in corso…</p>
      </div>
    );
  }

  const activeScenarioId = plan.activeScenarioId;

  const handleAddShot = (size: ShotSize) => {
    if (!activeScenarioId) return;
    addShotMut.mutate({ scenarioId: activeScenarioId, size });
  };

  const handleApplyPattern = (patternId: PatternId) => {
    if (!activeScenarioId) return;
    applyPatternMut.mutate({ scenarioId: activeScenarioId, patternId });
  };

  const handleDragStart = (shotId: string, e: React.DragEvent) => {
    const shot = plan.scenarios
      .flatMap((s) => s.shots.map((sh) => ({ ...sh, scenarioId: s.id })))
      .find((sh) => sh.id === shotId);
    if (!shot) return;
    setDragState({ shotId, sourceScenarioId: shot.scenarioId });
    e.dataTransfer.setData("application/x-shot-id", shotId);
    e.dataTransfer.setData("application/x-source-scenario", shot.scenarioId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOverTrack = (scenarioId: string) => (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (!dragState) return;
    // Determine insertion position by clientX vs track shots
    const trackEl = e.currentTarget as HTMLElement;
    const rect = trackEl.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const scenario = plan.scenarios.find((s) => s.id === scenarioId);
    if (!scenario) return;
    const shotsSorted = [...scenario.shots].sort((a, b) => a.position - b.position);
    // Find which shot the cursor is over and decide before/after
    let leftPx = 0;
    let position = shotsSorted.length;
    for (let i = 0; i < shotsSorted.length; i++) {
      const sh = shotsSorted[i];
      const wPct = (sh.resolvedMinutes / SHOOTING_DAY_MINUTES) * 100;
      const wPx = (wPct / 100) * rect.width;
      if (relX < leftPx + wPx / 2) {
        position = i;
        setDropTarget({
          scenarioId,
          position,
          leftPct: (leftPx / rect.width) * 100,
        });
        return;
      }
      leftPx += wPx + 2;
    }
    setDropTarget({
      scenarioId,
      position,
      leftPct: Math.min(100, (leftPx / rect.width) * 100),
    });
  };

  const handleDropOnTrack = (scenarioId: string) => (e: React.DragEvent) => {
    e.preventDefault();
    if (!dragState || !dropTarget) return;
    moveShotMut.mutate({
      shotId: dragState.shotId,
      targetScenarioId: scenarioId,
      position: dropTarget.position,
    });
    setDragState(null);
    setDropTarget(null);
  };

  const handleContextMenuShot = (shotId: string, e: React.MouseEvent) => {
    setContextMenu({ shotId, position: { x: e.clientX, y: e.clientY } });
  };

  const contextShot: ShotView | null = useMemo(() => {
    if (!contextMenu) return null;
    return (
      plan.scenarios
        .flatMap((s) => s.shots)
        .find((sh) => sh.id === contextMenu.shotId) ?? null
    );
  }, [plan, contextMenu]);

  const contextShotScenario: ScenarioView | null = useMemo(() => {
    if (!contextShot) return null;
    return plan.scenarios.find((s) => s.shots.some((sh) => sh.id === contextShot.id)) ?? null;
  }, [plan, contextShot]);

  const canAddReverse =
    !!contextShot &&
    (contextShot.shotSize === "OTS" || contextShot.shotSize === "MS") &&
    (breakdown?.castWithDialogue.length ?? 0) === 2;

  return (
    <div className={styles.editor}>
      {/* Picker row */}
      <div className={styles.pickerRow}>
        <PlanPicker
          scenarios={plan.scenarios}
          visibleScenarioIds={visibleSet}
          onToggleVisible={(sid) => {
            const next = new Set(visibleIds);
            if (next.has(sid)) next.delete(sid);
            else next.add(sid);
            setVisibleIds(Array.from(next));
          }}
          onCreatePlan={(init) => {
            const nextName = `Piano ${String.fromCharCode(
              65 + plan.scenarios.length,
            )}`;
            createPlanMut.mutate({ name: nextName });
            // init handling (copy/pattern) deferred to a follow-up — empty plan is the MVP
          }}
        />
      </div>

      {activeHidden && (
        <div className={styles.activeHiddenBanner} role="alert">
          Il piano attivo è nascosto —{" "}
          <button
            type="button"
            onClick={() => {
              if (plan.activeScenarioId) {
                setVisibleIds([...visibleIds, plan.activeScenarioId]);
              }
            }}
          >
            mostra
          </button>
        </div>
      )}

      {/* Toolbar */}
      <QuickAddToolbar
        recommendedPatternId={recommendedPatternId}
        onAddShot={handleAddShot}
        onApplyPattern={handleApplyPattern}
        disabled={!activeScenarioId}
      />

      {/* Ruler */}
      <div className={styles.rulerRow}>
        <div className={styles.rulerLabel}></div>
        <div className={styles.ruler}>
          {RULER_HOURS.map((h) => (
            <span key={h} className={styles.rulerTick} data-end={h === 8 || undefined}>
              {h === 8 ? "8h fine GG" : `${h}h`}
            </span>
          ))}
        </div>
      </div>

      {/* Tracks */}
      <div className={styles.tracks}>
        {visibleScenarios.map((s) => (
          <div
            key={s.id}
            onDragOver={handleDragOverTrack(s.id)}
            onDrop={handleDropOnTrack(s.id)}
          >
            <PlanTrack
              scenario={s}
              isActive={s.id === activeScenarioId}
              selectedShotId={selectedShotId}
              onSelectShot={setSelectedShotId}
              onContextMenuShot={handleContextMenuShot}
              onMakeActive={() => setActiveMut.mutate(s.id)}
              onDragStart={handleDragStart}
              onDragOverTrack={handleDragOverTrack(s.id)}
              onDropOnTrack={handleDropOnTrack(s.id)}
              dropIndicatorLeftPct={
                dropTarget?.scenarioId === s.id ? dropTarget.leftPct : null
              }
              dropIndicatorIsSamePlan={
                dropTarget?.scenarioId === s.id &&
                dragState?.sourceScenarioId === s.id
              }
            />
          </div>
        ))}
      </div>

      {/* Detail panel */}
      {selectedShot && (
        <div className={styles.detailPanel}>
          <ShotDetailPanel
            shot={selectedShot}
            shotPlanId={plan.id}
            projectId={projectId}
            onClose={() => setSelectedShotId(null)}
          />
        </div>
      )}

      {/* Context menu */}
      {contextMenu && contextShot && contextShotScenario && (
        <ShotContextMenu
          shot={contextShot}
          otherScenarios={plan.scenarios.filter(
            (s) => s.id !== contextShotScenario.id,
          )}
          position={contextMenu.position}
          canAddReverse={canAddReverse}
          onDuplicate={() => {
            addShotMut.mutate({
              scenarioId: contextShotScenario.id,
              size: contextShot.shotSize,
            });
          }}
          onAddReverse={() => addReverseMut.mutate(contextShot.id)}
          onMoveTo={(target) =>
            moveShotMut.mutate({
              shotId: contextShot.id,
              targetScenarioId: target,
              position: 9999,
            })
          }
          onDelete={() => deleteShotMut.mutate(contextShot.id)}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
```

Note: `shotPlanQueryOptions` must already exist (from spec 22). Check the existing exports.

- [ ] **Step 2: Write CSS**

```css
.editor {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  block-size: 100%;
}

.pickerRow {
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

.activeHiddenBanner {
  padding: var(--space-2) var(--space-3);
  background: var(--color-amber-subtle);
  border: 1px solid var(--color-amber);
  border-radius: var(--radius-md);
  color: var(--color-amber);
  font-size: var(--text-sm);

  & button {
    background: transparent;
    border: none;
    color: var(--color-amber);
    text-decoration: underline;
    cursor: pointer;
    font: inherit;
  }
}

.rulerRow {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding-inline: var(--space-3);
}

.rulerLabel {
  inline-size: 120px;
  flex-shrink: 0;
}

.ruler {
  flex: 1;
  display: flex;
  justify-content: space-between;
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  border-block-end: 1px solid var(--color-border);
  padding-block-end: var(--space-1);
}

.rulerTick {
  &[data-end] {
    color: var(--color-fg-secondary);
    font-weight: var(--weight-semibold);
  }
}

.tracks {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.detailPanel {
  margin-block-start: var(--space-3);
}

.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  block-size: 200px;
  color: var(--color-text-muted);
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @oh-writers/web typecheck`
Expected: only pre-existing budget errors. New errors expected to be fixed in this task — for any referenced server function (e.g., `shotPlanQueryOptions`) that doesn't exist with that exact name, find the correct one in `shooting-plan.server.ts` and adapt the call.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/features/shooting-plan/components/ParallelPlansEditor.tsx apps/web/app/features/shooting-plan/components/ParallelPlansEditor.module.css
git commit --no-verify -m "[OHW] feat(shooting-plan): add ParallelPlansEditor orchestrator"
```

---

## Task 17: Rewrite `ShootingPlanPage` to use new layout and auto-populate

**Files:**

- Modify: `apps/web/app/features/shooting-plan/components/ShootingPlanPage.tsx`
- Modify: `apps/web/app/features/shooting-plan/components/ShootingPlanPage.module.css`
- Modify: `apps/web/app/features/shooting-plan/index.ts`

- [ ] **Step 1: Update `ShootingPlanPage.tsx`**

Overwrite with:

```typescript
import { useState, useEffect } from "react";
import { useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  scenesWithPlanSummaryQueryOptions,
  getOrCreateInitialPlan,
} from "../server/shooting-plan.server";
import { ScriptPanel } from "./ScriptPanel";
import { BlockingPlaceholder } from "./BlockingPlaceholder";
import { ParallelPlansEditor } from "./ParallelPlansEditor";
import styles from "./ShootingPlanPage.module.css";

interface ShootingPlanPageProps {
  projectId: string;
}

const formatMinutes = (m: number): string => {
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h === 0) return `${rem}m`;
  if (rem === 0) return `${h}h`;
  return `${h}h ${rem}m`;
};

export function ShootingPlanPage({ projectId }: ShootingPlanPageProps) {
  const qc = useQueryClient();
  const { data } = useSuspenseQuery(scenesWithPlanSummaryQueryOptions(projectId));
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);

  const scenes = data?.isOk ? data.value : [];
  const selectedScene =
    scenes.find((s) => s.sceneId === selectedSceneId) ?? null;

  // Auto-populate on scene selection
  const initialPlanMut = useMutation({
    mutationFn: async (sceneId: string) =>
      await getOrCreateInitialPlan({ data: { sceneId, projectId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shot-plan"] });
      qc.invalidateQueries({ queryKey: ["shooting-plan", "scenes", projectId] });
    },
  });

  useEffect(() => {
    if (selectedSceneId && selectedScene && selectedScene.shotCount === 0) {
      initialPlanMut.mutate(selectedSceneId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSceneId]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Piano di Ripresa</h1>
      </header>
      <div className={styles.body}>
        <aside className={styles.sceneSidebar}>
          <div className={styles.sidebarLabel}>Scene del progetto</div>
          {scenes.length === 0 && (
            <p className={styles.sidebarEmpty}>
              Nessuna scena trovata. Importa una sceneggiatura per iniziare.
            </p>
          )}
          {scenes.map((scene) => {
            const isPlanned = scene.totalMinutes !== null && scene.shotCount > 0;
            return (
              <button
                key={scene.sceneId}
                type="button"
                className={styles.sceneItem}
                data-active={scene.sceneId === selectedSceneId || undefined}
                onClick={() => setSelectedSceneId(scene.sceneId)}
              >
                <span className={styles.sceneNumber}>SC.{scene.sceneNumber}</span>
                <span className={styles.sceneHeading}>
                  {scene.intExt}. {scene.location}
                </span>
                <span
                  className={styles.sceneStatus}
                  data-planned={isPlanned || undefined}
                >
                  {isPlanned
                    ? `● ${scene.shotCount} shot · ${formatMinutes(scene.totalMinutes ?? 0)}`
                    : "○ non pianificata"}
                </span>
              </button>
            );
          })}
        </aside>

        {selectedScene ? (
          <>
            <div className={styles.scriptColumn}>
              <ScriptPanel
                sceneNumber={selectedScene.sceneNumber}
                sceneHeading={selectedScene.sceneHeading}
                sceneNotes={null}
                storageKey="ohw:shooting-plan:script-panel:open"
              />
            </div>
            <main className={styles.main}>
              <BlockingPlaceholder />
              <ParallelPlansEditor
                key={selectedScene.sceneId}
                sceneId={selectedScene.sceneId}
                projectId={projectId}
                sceneNumber={selectedScene.sceneNumber}
                scenePageStart={null}
                scenePageEnd={null}
                sceneHasSpecialEffect={false}
              />
            </main>
          </>
        ) : (
          <main className={styles.main}>
            <div className={styles.mainEmpty}>
              <p>Seleziona una scena dalla lista per iniziare a pianificare gli shot.</p>
            </div>
          </main>
        )}
      </div>
    </div>
  );
}
```

Note on `scenePageStart` / `scenePageEnd` / `sceneHasSpecialEffect`: these are not in the current `SceneWithPlanSummary` type. To get them, either:

(a) Extend `SceneWithPlanSummary` to include them, or
(b) Pass them through a separate query inside `ParallelPlansEditor`.

For this task, pass `null`/`false` defaults (the recommendation will fallback to `master_plus_mids`). A follow-up task can plumb the real values.

- [ ] **Step 2: Update CSS for 3-column layout**

Replace the body grid in `ShootingPlanPage.module.css`:

```css
.body {
  flex: 1;
  display: grid;
  grid-template-columns: 240px auto 1fr;
  min-block-size: 0;
}

.scriptColumn {
  display: flex;
  block-size: 100%;
}
```

Keep the other classes as they are.

- [ ] **Step 3: Update `index.ts` exports**

Edit `apps/web/app/features/shooting-plan/index.ts` — remove exports for `SceneShotTimeline` and `ScenarioTabs`, add exports for `ParallelPlansEditor`, `ScriptPanel`, `BlockingPlaceholder`, `PlanPicker`, `PlanTrack`, `QuickAddToolbar`, `PatternMenu`, `ShotContextMenu`.

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @oh-writers/web typecheck`
Expected: only pre-existing budget errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/features/shooting-plan/components/ShootingPlanPage.tsx apps/web/app/features/shooting-plan/components/ShootingPlanPage.module.css apps/web/app/features/shooting-plan/index.ts
git commit --no-verify -m "[OHW] feat(shooting-plan): rewire ShootingPlanPage to v2 layout + auto-populate"
```

---

## Task 18: Remove obsolete components

**Files:**

- Delete: `apps/web/app/features/shooting-plan/components/SceneShotTimeline.tsx`
- Delete: `apps/web/app/features/shooting-plan/components/SceneShotTimeline.module.css`
- Delete: `apps/web/app/features/shooting-plan/components/ScenarioTabs.tsx`
- Delete: `apps/web/app/features/shooting-plan/components/ScenarioTabs.module.css`

- [ ] **Step 1: Delete the files**

```bash
rm apps/web/app/features/shooting-plan/components/SceneShotTimeline.tsx
rm apps/web/app/features/shooting-plan/components/SceneShotTimeline.module.css
rm apps/web/app/features/shooting-plan/components/ScenarioTabs.tsx
rm apps/web/app/features/shooting-plan/components/ScenarioTabs.module.css
```

- [ ] **Step 2: Verify no remaining imports**

Run: `grep -rn "SceneShotTimeline\|ScenarioTabs" apps/ packages/ tests/`
Expected: zero matches.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @oh-writers/web typecheck`
Expected: only pre-existing budget errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/features/shooting-plan/components/
git commit --no-verify -m "[OHW] chore(shooting-plan): remove obsolete SceneShotTimeline + ScenarioTabs"
```

---

## Task 19: Rewrite Playwright E2E for v2

**Files:**

- Modify: `tests/shooting-plan/shooting-plan.spec.ts`

- [ ] **Step 1: Overwrite the spec**

Replace the file with:

```typescript
import { expect } from "@playwright/test";
import { test } from "../fixtures";
import { SHOOTING_PLAN_PROJECT_ID, navigateToShootingPlan } from "./helpers";

test.describe("[OHW-022b] Piano di Ripresa v2 — parallel plans", () => {
  test("[OHW-022b] Auto-populate creates Piano A with shots on first scene open", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToShootingPlan(page, SHOOTING_PLAN_PROJECT_ID);

    const sceneButtons = page.locator('[class*="sceneItem"]');
    await expect(sceneButtons.first()).toBeVisible({ timeout: 15_000 });

    // Click first unplanned scene
    const unplanned = sceneButtons.filter({ hasText: "non pianificata" }).first();
    const found = await unplanned.count();
    if (found === 0) {
      test.skip();
      return;
    }
    await unplanned.click();

    // Piano A track should appear with at least one shot
    await expect(page.getByText("Piano A")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/\d+ shot/)).toBeVisible({ timeout: 10_000 });

    // Suggested badge present
    await expect(page.getByText(/suggerito/)).toBeVisible({ timeout: 5_000 });
  });

  test("[OHW-022b] Quick-add toolbar adds shot to active plan", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToShootingPlan(page, SHOOTING_PLAN_PROJECT_ID);

    const sceneButtons = page.locator('[class*="sceneItem"]');
    await sceneButtons.first().click();

    // Click +CU button
    const cuBtn = page.getByRole("button", { name: "CU", exact: true });
    await expect(cuBtn).toBeVisible({ timeout: 10_000 });
    const initialShotCount = await page.locator('[class*="block"][data-shot-id], [class*="ShotBlock_block"]').count();
    await cuBtn.click();

    // Wait for new shot to render
    await page.waitForTimeout(500);
    const newCount = await page.locator('[class*="block"][data-shot-id], [class*="ShotBlock_block"]').count();
    expect(newCount).toBeGreaterThan(initialShotCount);
  });

  test("[OHW-022b] Pattern menu shows recommended badge", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToShootingPlan(page, SHOOTING_PLAN_PROJECT_ID);

    const sceneButtons = page.locator('[class*="sceneItem"]');
    await sceneButtons.first().click();

    const patternBtn = page.getByRole("button", { name: /Pattern/ });
    await expect(patternBtn).toBeVisible({ timeout: 10_000 });
    await patternBtn.click();

    // At least one pattern is marked "consigliato"
    await expect(page.getByText("consigliato").first()).toBeVisible({ timeout: 5_000 });
  });

  test("[OHW-022b] Script panel toggles open and persists", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToShootingPlan(page, SHOOTING_PLAN_PROJECT_ID);

    const sceneButtons = page.locator('[class*="sceneItem"]');
    await sceneButtons.first().click();

    const scriptTab = page.getByRole("button", { name: /Apri pannello sceneggiatura/ });
    await expect(scriptTab).toBeVisible({ timeout: 10_000 });
    await scriptTab.click();

    await expect(page.getByText(/Scena \d+ — testo/)).toBeVisible({ timeout: 5_000 });

    // Reload and verify state persisted
    await page.reload();
    await sceneButtons.first().click();
    await expect(page.getByText(/Scena \d+ — testo/)).toBeVisible({ timeout: 10_000 });
  });

  test("[OHW-022b] PlanPicker creates a second plan", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToShootingPlan(page, SHOOTING_PLAN_PROJECT_ID);

    const sceneButtons = page.locator('[class*="sceneItem"]');
    await sceneButtons.first().click();

    await expect(page.getByText("Piano A")).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: "+ piano" }).click();
    await page.getByRole("button", { name: "Vuoto", exact: true }).click();

    await expect(page.getByText("Piano B")).toBeVisible({ timeout: 10_000 });
  });
});
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @oh-writers/web typecheck`
Expected: only pre-existing budget errors.

- [ ] **Step 3: Commit**

```bash
git add tests/shooting-plan/shooting-plan.spec.ts
git commit --no-verify -m "[OHW] test(shooting-plan): rewrite E2E for Piano di Ripresa v2"
```

---

## Final verification

- [ ] **Step 1: Full domain test run**

Run: `pnpm --filter @oh-writers/domain vitest run`
Expected: all tests pass, including the new `coverage-patterns.test.ts` (≥6 tests) and `recommend-pattern.test.ts` (10 tests).

- [ ] **Step 2: Web typecheck**

Run: `pnpm --filter @oh-writers/web typecheck`
Expected: only pre-existing `projectRateCard` / `RateCardSection` errors in `apps/web/app/features/budget/`. No errors in `shooting-plan/`.

- [ ] **Step 3: Confirm no stale references**

Run: `grep -rn "SceneShotTimeline\|ScenarioTabs\|syncStripEffort\|DayBalanceTimeline" apps/ packages/ tests/`
Expected: zero matches.

- [ ] **Step 4: Confirm commits sequence**

Run: `git log --oneline | head -22`
Expected: 19 commits prefixed with `[OHW]` covering Tasks 1–19, on top of the spec 22b doc commit and spec 22a baseline.

- [ ] **Step 5: Manual smoke test in browser**

1. Run `pnpm dev`. Open http://localhost:3001.
2. Navigate to a project with scenes → Piano di Ripresa.
3. Click an unplanned scene → verify "Piano A · suggerito" appears with auto-populated shots.
4. Click "+CU" in toolbar → verify shot added, "suggerito" badge disappears.
5. Click "▼ Pattern…" → verify one pattern has "consigliato" badge based on breakdown.
6. Click "+ piano" → "Vuoto" → verify Piano B track appears.
7. Drag a shot from Piano A to Piano B → verify blue insertion line, shot moves on drop.
8. Right-click a shot → verify menu with Duplica / Sposta a / Elimina options.
9. Click "📄 SCENA" tab → verify panel opens, reload → verify persistent.
10. Hide Piano A (the active one) via picker pill → verify "il piano attivo è nascosto" banner appears.
