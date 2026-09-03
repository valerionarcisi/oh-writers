import { type Page, expect } from "@playwright/test";
import { BASE_URL } from "../fixtures";

// `reseedTestDb` lives in `tests/helpers.ts` — it's a general test-DB utility
// used across many unrelated spec folders (teams, documents, cesare, user
// settings…), not something specific to breakdown. Re-exported here so the
// existing `../breakdown/helpers` import sites keep working.
export { reseedTestDb } from "../helpers";

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
  // Switching to full scope loads the whole script — on the seeded 12-page
  // doc the headings can take longer than the 5s default to render ([284]).
  const heading = page.getByTestId(`scene-${sceneNumber}-heading`);
  await expect(heading).toBeVisible({ timeout: 15_000 });
  await heading.click();
};

/** The root each view mounts the moment React accepts the switch. `per-scene`
 *  is the default view the page already settled on in `navigateToBreakdown`. */
const VIEW_ROOT: Record<string, string | null> = {
  "per-project": '[data-testid="project-breakdown-table"]',
  matrice: '[data-testid="breakdown-matrix-view"]',
  "per-scene": null,
};

/**
 * Switch the v3 breakdown viewbar to a SegmentedControl tab and wait until the
 * switch actually took effect.
 *
 * The control is CONTROLLED (`activeId` + `onSelect`), so `toBeChecked` alone is
 * a lying gate: a click that lands before React has wired `onSelect` flips the
 * NATIVE radio — checked reads true — while the state never changed, and the
 * next controlled render flips it straight back (the reverted-tab snapshots in
 * #116; the same pre-hydration class as #117). The proof React accepted the
 * click is the destination view MOUNTING, so that — not the radio — closes the
 * retry loop; a reverted click simply gets clicked again, as a user would.
 *
 * Mounting is awaited INSIDE the retry, data readiness OUTSIDE it: the root
 * appears synchronously with the accepted state change (its loading skeleton
 * carries the same testid), while awaiting the DATA inside the loop makes the
 * retry re-click the tab and restart the very query being awaited — the
 * livelock documented in #116.
 */
export const switchBreakdownView = async (
  page: Page,
  view: "per-scene" | "per-project" | "matrice",
) => {
  // SegmentedControl is a radio group (react-aria useRadioGroup): each option is
  // a radio input carrying data-testid="segmented-<id>"; selection is the native
  // `checked` state, not aria-selected.
  const tab = page.getByTestId(`segmented-${view}`);
  const root = VIEW_ROOT[view];
  await expect(async () => {
    await tab.click();
    await expect(tab).toBeChecked({ timeout: 1_000 });
    if (root) {
      await expect(page.locator(root)).toBeAttached({ timeout: 2_000 });
    }
  }).toPass({ timeout: 20_000 });

  if (view === "per-project") {
    await expect(
      page.locator(
        '[data-testid="project-breakdown-table"]:not([data-loading])',
      ),
    ).toBeVisible({ timeout: 20_000 });
  }
};
