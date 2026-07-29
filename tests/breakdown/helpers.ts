import { execSync } from "node:child_process";
import path from "node:path";
import { type Page, expect } from "@playwright/test";
import { BASE_URL } from "../fixtures";

/**
 * Reseed the test database to the pristine seed state.
 *
 * The breakdown suite shares a single seeded DB (workers: 1). Some specs mutate
 * shared rows permanently — e.g. bulk-confirm/archive in the per-project view
 * commits the auto-spoglio pending ghosts to accepted, so by the time the
 * alphabetically-later ghost-interaction tests run there are no
 * `[data-ghost="true"]` occurrences left. Tests that REQUIRE pristine pending
 * ghosts call this in a `beforeAll` to restore them. Mirrors global-setup.
 */
export const reseedTestDb = () => {
  const root = path.resolve(__dirname, "..", "..");
  execSync("pnpm --filter @oh-writers/db seed:reset", {
    cwd: root,
    stdio: "ignore",
    env: {
      ...process.env,
      DATABASE_URL:
        process.env["DATABASE_URL_TEST"] ??
        "postgresql://oh-writers:oh-writers@localhost:5432/oh-writers_test",
    },
  });
};

export const TEAM_PROJECT_ID = "00000000-0000-4000-a000-000000000011";
export const TEAM_VERSION_ID = "00000000-0000-4000-a000-000000000023";
export const TEAM_SCENE_1_ID = "00000000-0000-4000-a000-000000010010";
export const TEAM_SCENE_2_ID = "00000000-0000-4000-a000-000000010011";

export const navigateToBreakdown = async (page: Page, projectId: string) => {
  await page.goto(`${BASE_URL}/projects/${projectId}/breakdown`);
  // BreakdownPage renders data-testid="breakdown-page-v2" since the v2 redesign
  await expect(page.getByTestId("breakdown-page-v2")).toBeVisible({
    timeout: 10_000,
  });
  // The page renders behind nested Suspense boundaries (breakdown context →
  // RecapStrip → ScriptReader). breakdown-page-v2 paints before those resolve,
  // so the viewbar SegmentedControl can briefly re-mount and a tab click can
  // land on a detached / zero-size node. Wait for the screenplay reader (the
  // heaviest async child of the per-scene view) so the page has fully settled
  // before any interaction.
  await expect(page.getByTestId("readonly-screenplay-view")).toBeVisible({
    timeout: 15_000,
  });
};

/**
 * Focus a scene in the v3 breakdown reader.
 *
 * v3 dropped the standalone SceneTOC sidebar (`scene-toc-item-*` is orphaned);
 * scene navigation is driven by clicking a heading inside the screenplay
 * reader, which the ScriptReader resolves to the active scene. Headings carry
 * the `scene-N-heading` testid via the scene-testid PM decoration.
 *
 * BUG-N68 Part A made "Scena singola" the default scope, so the reader renders
 * only the active scene and heading-click navigation has no other heading to
 * jump to. Heading-click navigation is a "Copione intero" affordance, so this
 * helper first switches to the full-script scope before clicking the target
 * heading (idempotent — a no-op once already in full scope).
 */
export const openSceneInBreakdown = async (page: Page, sceneNumber: number) => {
  const fullScope = page.getByTestId("segmented-full");
  if ((await fullScope.count()) > 0 && !(await fullScope.isChecked())) {
    await expect(async () => {
      await fullScope.click();
      await expect(fullScope).toBeChecked({ timeout: 1_000 });
    }).toPass({ timeout: 15_000 });
  }
  const heading = page.getByTestId(`scene-${sceneNumber}-heading`);
  await expect(heading).toBeVisible();
  await heading.click();
};

/**
 * Switch the v3 breakdown viewbar to a SegmentedControl tab and wait until the
 * switch actually took effect.
 *
 * The viewbar is `position: sticky` and the SegmentedControl re-mounts while the
 * nested Suspense boundaries settle, so a single `click()` can land on the tab a
 * frame before React wires its handler — the click is swallowed and the view
 * never changes. Clicking inside an `expect.toPass` retry loop, gated on the
 * tab's own `aria-selected` flipping to `true`, makes the switch deterministic
 * without weakening any assertion (the caller still asserts the target view).
 */
export const switchBreakdownView = async (
  page: Page,
  view: "per-scene" | "per-project" | "matrice",
) => {
  // SegmentedControl is a radio group (react-aria useRadioGroup): each option is
  // a radio input carrying data-testid="segmented-<id>"; selection is the native
  // `checked` state, not aria-selected.
  const tab = page.getByTestId(`segmented-${view}`);
  await expect(async () => {
    await tab.click();
    await expect(tab).toBeChecked({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });

  // Then wait for the view's DATA, outside the retry loop above. It has to be
  // outside: inside, a still-loading view fails the callback and `toPass`
  // responds by clicking the tab again, which remounts the subtree and restarts
  // the very query being waited on — the wait invalidates its own condition.
  if (view === "per-project") {
    await expect(
      page.locator(
        '[data-testid="project-breakdown-table"]:not([data-loading])',
      ),
    ).toBeVisible({ timeout: 20_000 });
  }
};
