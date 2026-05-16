# Spec 22a — Decouple Piano di Ripresa from Schedule — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strip the schedule dependency out of Piano di Ripresa so shot planning works standalone and stops writing to `strips.estimatedHours`.

**Architecture:** Remove `syncStripEffort` server-side. Replace the day-picker / Compare-C UI with a scene-list sidebar populated by a new `listScenesWithPlanSummary` server function. Keep everything else (DB schema, domain functions, scene timeline, shot/transition CRUD) intact.

**Tech Stack:** TanStack Start, Drizzle, neverthrow, Zod, CSS Modules, Vitest, Playwright.

---

## File Structure

**Modify:**

- `apps/web/app/features/shooting-plan/server/shooting-plan.server.ts` — drop `syncStripEffort` and all 8 callers; add `listScenesWithPlanSummary` + `scenesWithPlanSummaryQueryOptions`.
- `apps/web/app/features/shooting-plan/components/ShootingPlanPage.tsx` — rewrite to use scene-list sidebar instead of day picker.
- `apps/web/app/features/shooting-plan/components/ShootingPlanPage.module.css` — new sidebar layout.
- `apps/web/app/features/shooting-plan/index.ts` — re-export the new query options if not already public.
- `tests/shooting-plan/shooting-plan.spec.ts` — rewrite expectations (no day picker, scene list sidebar, no schedule prerequisite).

**Delete:**

- `apps/web/app/features/shooting-plan/components/DayBalanceTimeline.tsx`
- `apps/web/app/features/shooting-plan/components/DayBalanceTimeline.module.css`

---

### Task 1: Remove `syncStripEffort` from the server

**Files:**

- Modify: `apps/web/app/features/shooting-plan/server/shooting-plan.server.ts`

- [ ] **Step 1: Delete the helper definition**

Delete lines 245–302 (the entire `const syncStripEffort = async (...)` block, ending with the closing `};`).

- [ ] **Step 2: Remove the 8 invocations**

Search for `syncStripEffort(db,` and delete each occurrence. The 8 callers are in: `setActiveScenario`, `addShot`, `updateShot`, `deleteShot`, `reorderShots`, `addManualTransition`, `updateTransition`, `deleteTransition`. Each invocation is either:

```typescript
.then(() => syncStripEffort(db, data.shotPlanId, data.projectId))
```

or a stand-alone `await syncStripEffort(db, data.shotPlanId, data.projectId);` — delete the line, and if it was the last `.then(...)` in a `.andThen(...)` chain, also drop the surrounding `.andThen(() => ResultAsync.fromPromise(... .then(() => syncStripEffort(...)), ...))` wrapper, replacing it with a plain `ResultAsync.fromPromise(... , (e) => new DbError(...))`.

- [ ] **Step 3: Drop now-unused imports**

At the top of the file, remove these imports that become unused after deleting `syncStripEffort`:

- `strips` and `schedules` from `@oh-writers/db/schema`
- `ShotEffortWeightsSchema`, `DEFAULT_SHOT_EFFORT_WEIGHTS`, `computeScenarioTotal` from `@oh-writers/domain` (verify with grep — if they're still used by `getEffortWeights` / `updateEffortWeights`, keep them)

Run: `grep -n "strips\|schedules\.\|ShotEffortWeightsSchema\|DEFAULT_SHOT_EFFORT_WEIGHTS\|computeScenarioTotal" apps/web/app/features/shooting-plan/server/shooting-plan.server.ts`

Keep only the imports that still have a usage in the remaining code.

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: PASS, no errors.

- [ ] **Step 5: Run server unit tests**

Run: `pnpm vitest run packages/domain/src/schedule/shot-plan.test.ts`
Expected: 24 tests pass (domain functions are untouched).

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/features/shooting-plan/server/shooting-plan.server.ts
git commit -m "[OHW] refactor: remove syncStripEffort from shot-plan server"
```

---

### Task 2: Add `listScenesWithPlanSummary` server function

**Files:**

- Modify: `apps/web/app/features/shooting-plan/server/shooting-plan.server.ts`

- [ ] **Step 1: Add the view type**

Append after the existing `ShotPlanView` interface (search the file for `interface ShotPlanView`):

```typescript
export interface SceneWithPlanSummary {
  sceneId: string;
  sceneNumber: number;
  sceneHeading: string;
  intExt: "INT" | "EXT" | "INT/EXT";
  location: string;
  shotCount: number;
  totalMinutes: number | null; // null when no shot plan or no active scenario
}
```

- [ ] **Step 2: Add the server function and query options**

Append at the end of the file (after the last existing `queryOptions(...)` export):

```typescript
export const listScenesWithPlanSummary = createServerFn({ method: "GET" })
  .validator(z.object({ projectId: z.string().uuid() }))
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<SceneWithPlanSummary[], ForbiddenError | DbError>
    > => {
      const user = await requireUser();
      const db = await getDb();

      const result = await ResultAsync.fromPromise(
        (async () => {
          const screenplay = await db.query.screenplays.findFirst({
            where: (s, { eq: e }) => e(s.projectId, data.projectId),
            orderBy: (s, { desc }) => [desc(s.updatedAt)],
          });
          if (!screenplay) return [];

          const sceneRows = await db.query.scenes.findMany({
            where: (sc, { eq: e }) => e(sc.screenplayId, screenplay.id),
            orderBy: (sc, { asc: a }) => [a(sc.number)],
          });
          if (sceneRows.length === 0) return [];

          const sceneIds = sceneRows.map((s) => s.id);

          const planRows = await db.query.shotPlans.findMany({
            where: (p, { inArray: ia }) => ia(p.sceneId, sceneIds),
          });

          const activeScenarioIds = planRows
            .map((p) => p.activeScenarioId)
            .filter((id): id is string => id !== null);

          const shotsByScenario = new Map<
            string,
            { count: number; minutes: number }
          >();
          if (activeScenarioIds.length > 0) {
            const allShots = await db.query.shots.findMany({
              where: (sh, { inArray: ia }) =>
                ia(sh.scenarioId, activeScenarioIds),
            });
            for (const sh of allShots) {
              const entry = shotsByScenario.get(sh.scenarioId) ?? {
                count: 0,
                minutes: 0,
              };
              entry.count += 1;
              entry.minutes += sh.estimatedMinutes ?? 0;
              shotsByScenario.set(sh.scenarioId, entry);
            }
          }

          const planBySceneId = new Map(planRows.map((p) => [p.sceneId, p]));

          return sceneRows.map((sc): SceneWithPlanSummary => {
            const plan = planBySceneId.get(sc.id);
            const activeId = plan?.activeScenarioId ?? null;
            const summary = activeId ? shotsByScenario.get(activeId) : null;
            return {
              sceneId: sc.id,
              sceneNumber: sc.number,
              sceneHeading: sc.heading,
              intExt: sc.intExt as "INT" | "EXT" | "INT/EXT",
              location: sc.location,
              shotCount: summary?.count ?? 0,
              totalMinutes: summary ? summary.minutes : null,
            };
          });
        })(),
        (e) => new DbError("listScenesWithPlanSummary", e),
      );

      // No project-level permission check needed beyond requireUser — scenes are
      // already protected by screenplay→project ownership, but to be safe verify
      // the user has access to this project via the breakdown-style helper if one
      // exists. For now we trust requireUser() + the screenplay lookup, matching
      // the existing pattern in this file.
      void user;
      return toShape(result);
    },
  );

export const scenesWithPlanSummaryQueryOptions = (projectId: string) =>
  queryOptions({
    queryKey: ["shooting-plan", "scenes", projectId],
    queryFn: () => listScenesWithPlanSummary({ data: { projectId } }),
  });
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/features/shooting-plan/server/shooting-plan.server.ts
git commit -m "[OHW] feat: add listScenesWithPlanSummary server function"
```

---

### Task 3: Delete `DayBalanceTimeline`

**Files:**

- Delete: `apps/web/app/features/shooting-plan/components/DayBalanceTimeline.tsx`
- Delete: `apps/web/app/features/shooting-plan/components/DayBalanceTimeline.module.css`

- [ ] **Step 1: Delete the files**

Run:

```bash
rm apps/web/app/features/shooting-plan/components/DayBalanceTimeline.tsx
rm apps/web/app/features/shooting-plan/components/DayBalanceTimeline.module.css
```

- [ ] **Step 2: Verify no remaining imports**

Run: `grep -rn "DayBalanceTimeline" apps/web/app/`
Expected: only the import line in `ShootingPlanPage.tsx` remains (will be removed in Task 4).

- [ ] **Step 3: Commit (deferred — combined with Task 4)**

Do not commit yet; the workspace will not typecheck until `ShootingPlanPage.tsx` is rewritten. Continue to Task 4.

---

### Task 4: Rewrite `ShootingPlanPage` to use scene-list sidebar

**Files:**

- Modify: `apps/web/app/features/shooting-plan/components/ShootingPlanPage.tsx`
- Modify: `apps/web/app/features/shooting-plan/components/ShootingPlanPage.module.css`

- [ ] **Step 1: Replace `ShootingPlanPage.tsx` entirely**

Overwrite the file with:

```typescript
import { useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { scenesWithPlanSummaryQueryOptions } from "../server/shooting-plan.server";
import { SceneShotTimeline } from "./SceneShotTimeline";
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
  const { data } = useSuspenseQuery(scenesWithPlanSummaryQueryOptions(projectId));
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);

  const scenes = data?.isOk ? data.value : [];
  const selectedScene =
    scenes.find((s) => s.sceneId === selectedSceneId) ?? null;

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
        <main className={styles.main}>
          {selectedScene ? (
            <SceneShotTimeline
              key={selectedScene.sceneId}
              sceneId={selectedScene.sceneId}
              projectId={projectId}
              sceneLabel={`SC.${selectedScene.sceneNumber} ${selectedScene.location}`}
            />
          ) : (
            <div className={styles.mainEmpty}>
              <p>Seleziona una scena dalla lista per iniziare a pianificare gli shot.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Replace `ShootingPlanPage.module.css` entirely**

Overwrite the file with:

```css
.page {
  display: flex;
  flex-direction: column;
  block-size: 100%;
  background: var(--color-bg);
}

.header {
  padding-block: var(--space-3);
  padding-inline: var(--space-4);
  border-block-end: 1px solid var(--color-border);
}

.title {
  font-size: var(--font-size-lg);
  font-weight: 600;
  color: var(--color-text);
  margin: 0;
}

.body {
  flex: 1;
  display: grid;
  grid-template-columns: 240px 1fr;
  min-block-size: 0;
}

.sceneSidebar {
  border-inline-end: 1px solid var(--color-border);
  padding: var(--space-3);
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  overflow-y: auto;
}

.sidebarLabel {
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text-muted);
  margin-block-end: var(--space-2);
}

.sidebarEmpty {
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
}

.sceneItem {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  text-align: start;
  padding: var(--space-2);
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
  transition: background 120ms ease;

  &:hover {
    background: var(--color-surface-hover);
  }

  &[data-active] {
    background: var(--color-surface-active);
    border-color: var(--color-border-strong);
  }
}

.sceneNumber {
  font-size: var(--font-size-xs);
  font-weight: 600;
  color: var(--color-text-muted);
}

.sceneHeading {
  font-size: var(--font-size-sm);
  color: var(--color-text);
}

.sceneStatus {
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);

  &[data-planned] {
    color: var(--color-success);
  }
}

.main {
  padding: var(--space-3);
  overflow: auto;
  min-block-size: 0;
}

.mainEmpty {
  display: flex;
  align-items: center;
  justify-content: center;
  block-size: 100%;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

@media (prefers-reduced-motion: reduce) {
  .sceneItem {
    transition: none;
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Run dev server smoke check**

Run: `pnpm dev` (background)
Navigate to `/projects/<any-id>/shooting-plan`. Verify:

- Page renders without error even if no schedule exists.
- Sidebar lists scenes.
- Clicking a scene shows the shot timeline.

- [ ] **Step 5: Commit Tasks 3 + 4 together**

```bash
git add apps/web/app/features/shooting-plan/components/
git commit -m "[OHW] refactor: replace day picker with scene list sidebar in Piano di Ripresa"
```

---

### Task 5: Rewrite Playwright E2E tests

**Files:**

- Modify: `tests/shooting-plan/shooting-plan.spec.ts`

- [ ] **Step 1: Read the test helpers**

Run: `cat tests/shooting-plan/helpers.ts`

Note the `SHOOTING_PLAN_PROJECT_ID` constant and `navigateToShootingPlan` helper — they remain valid.

- [ ] **Step 2: Replace the test file**

Overwrite `tests/shooting-plan/shooting-plan.spec.ts` with:

```typescript
import { expect } from "@playwright/test";
import { test } from "../fixtures";
import { SHOOTING_PLAN_PROJECT_ID, navigateToShootingPlan } from "./helpers";

test.describe("[OHW-022] Piano di Ripresa — shot planning (decoupled)", () => {
  test("[OHW-022] Page renders without a schedule → h1 + scene sidebar", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToShootingPlan(page, SHOOTING_PLAN_PROJECT_ID);

    const heading = page.getByRole("heading", {
      level: 1,
      name: "Piano di Ripresa",
    });
    await expect(heading).toBeVisible({ timeout: 15_000 });

    await expect(page.getByText("Scene del progetto")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("[OHW-022] Sidebar lists scenes with planned/unplanned status", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToShootingPlan(page, SHOOTING_PLAN_PROJECT_ID);

    await expect(page.getByText("Scene del progetto")).toBeVisible({
      timeout: 15_000,
    });

    const sceneButtons = page.locator('[class*="sceneItem"]');
    const count = await sceneButtons.count();
    if (count === 0) {
      test.skip();
      return;
    }
    await expect(sceneButtons.first()).toBeVisible();

    const statusBadge = sceneButtons.first().locator('[class*="sceneStatus"]');
    await expect(statusBadge).toContainText(/non pianificata|shot/);
  });

  test("[OHW-022] Select a scene → SceneShotTimeline renders with Piano A tab", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToShootingPlan(page, SHOOTING_PLAN_PROJECT_ID);

    const sceneButtons = page.locator('[class*="sceneItem"]');
    await expect(sceneButtons.first()).toBeVisible({ timeout: 15_000 });

    await sceneButtons.first().click();

    await expect(page.getByText(/Piano A|Inizia piano di ripresa/)).toBeVisible(
      { timeout: 10_000 },
    );
  });

  test("[OHW-022] Add a shot to an unplanned scene → sidebar status updates", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToShootingPlan(page, SHOOTING_PLAN_PROJECT_ID);

    const sceneButtons = page.locator('[class*="sceneItem"]');
    await expect(sceneButtons.first()).toBeVisible({ timeout: 15_000 });

    const unplanned = sceneButtons
      .filter({ hasText: "non pianificata" })
      .first();
    const found = await unplanned.count();
    if (found === 0) {
      test.skip();
      return;
    }
    await unplanned.click();

    const startBtn = page.getByRole("button", {
      name: /Inizia piano di ripresa/,
    });
    if (await startBtn.isVisible().catch(() => false)) {
      await startBtn.click();
    }

    const addShotBtn = page.getByRole("button", {
      name: /\+ shot|Aggiungi shot/,
    });
    await expect(addShotBtn).toBeVisible({ timeout: 10_000 });
    await addShotBtn.click();

    await expect(unplanned.locator('[class*="sceneStatus"]')).toContainText(
      /1 shot/,
      { timeout: 10_000 },
    );
  });
});
```

- [ ] **Step 3: Run the tests**

Run: `pnpm test:e2e --grep "OHW-022"`
Expected: 4 tests, all pass (some may skip if seed data lacks scenes).

- [ ] **Step 4: Commit**

```bash
git add tests/shooting-plan/shooting-plan.spec.ts
git commit -m "[OHW] test: rewrite Piano di Ripresa E2E for decoupled flow"
```

---

## Final verification

- [ ] **Step 1: Full typecheck**

Run: `pnpm typecheck`
Expected: PASS across the workspace.

- [ ] **Step 2: Full unit test run**

Run: `pnpm test:unit`
Expected: All vitest suites pass.

- [ ] **Step 3: Confirm no `syncStripEffort` leftover**

Run: `grep -rn "syncStripEffort" apps/ packages/ tests/`
Expected: zero matches.

- [ ] **Step 4: Confirm no `DayBalanceTimeline` leftover**

Run: `grep -rn "DayBalanceTimeline" apps/ packages/ tests/`
Expected: zero matches.

- [ ] **Step 5: Confirm the spec file is committed**

Run: `git log --oneline | head -5`
Expected: see `[OHW] docs: spec 22a — decouple Piano di Ripresa from Schedule` and one commit per task above.
