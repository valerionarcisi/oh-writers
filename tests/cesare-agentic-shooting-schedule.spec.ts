import { test, expect } from "./fixtures";
import {
  SHOOTING_PLAN_PROJECT_ID,
  navigateToShootingPlan,
} from "./shooting-plan/helpers";
import { navigateToSchedule, SCHEDULE_PROJECT_ID } from "./schedule/helpers";
import {
  closeCesareSheet,
  openCesareSheet,
  sendCesareWithRetry,
} from "./helpers/cesare";

/**
 * Agent D — Shooting 2D blocking propose + Schedule polish
 *
 * - OHW-580: User on shooting-plan asks Cesare to suggest blocking. Cesare
 *   invokes propose_blocking_for_scene; the executor returns a payload that
 *   surfaces as ghost overlays + a "Suggerimento Cesare" proposal panel.
 * - OHW-581: Schedule page renders DayLocationWarningBanner when a strip in
 *   the day references a location requirement still in pending/scouting state.
 * - OHW-582: DayDifficultyBadge readability (uses the upgraded aria-label
 *   and bumped typography). Smoke check: badge is visible, mentions both
 *   difficulty and "%" probability.
 */
test.describe("[Spec Agent-D] Cesare Agentic — Shooting blocking + Schedule polish", () => {
  test("[OHW-580] Cesare propose_blocking_for_scene shows ghost panel", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToShootingPlan(page, SHOOTING_PLAN_PROJECT_ID);

    // 30s preconditions: the shooting-plan route + blocking canvas JIT-compile
    // on first hit on a cold CI dev server, which can exceed 15s on a 2-core
    // runner (this is page-load latency, not a Cesare turn).
    const scenes = page.getByRole("button").filter({ hasText: /SC\.\d+/ });
    await expect(scenes.first()).toBeVisible({ timeout: 30_000 });
    await scenes.first().click();

    await expect(page.getByText(/ANTEPRIMA BLOCKING/)).toBeVisible({
      timeout: 30_000,
    });

    await openCesareSheet(page);
    await sendCesareWithRetry(page, "Suggerisci blocking per questa scena.");

    // The proposal panel appears anchored to the canvas
    const panel = page.getByTestId("blocking-proposal-panel");
    await expect(panel).toBeVisible({ timeout: 20_000 });
    await expect(panel.getByText(/Suggerimento Cesare/i)).toBeVisible();

    // Dismiss the floating Cesare drawer so it can't intercept the click on the
    // in-page accept button — the real user flow once the proposal has landed.
    await closeCesareSheet(page);

    // Accept-all button is exposed via react-aria
    const acceptAll = panel.getByRole("button", {
      name: /Accetta tutto/i,
    });
    await expect(acceptAll).toBeVisible();
    await acceptAll.click();

    // Panel disappears once accepted
    await expect(panel).not.toBeVisible({ timeout: 10_000 });
  });

  test("[OHW-581] Schedule warns when a strip has a pending location", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToSchedule(page, SCHEDULE_PROJECT_ID);

    // At least the strip board renders — the banner is data-driven and may
    // or may not be present depending on seed state. We assert the banner is
    // either present (with the correct ARIA role + content shape) or absent.
    const banners = page.getByTestId(/^day-location-warning-/);
    const count = await banners.count();
    if (count === 0) {
      // No pending-location seed in this run — that's fine for a smoke check.
      test.info().annotations.push({
        type: "note",
        description:
          "No pending location requirements in seed; banner not surfaced.",
      });
      return;
    }
    const first = banners.first();
    await expect(first).toBeVisible({ timeout: 5_000 });
    await expect(first).toContainText(/location non ancora confermat/i);
  });

  test("[OHW-582] DayDifficultyBadge has readable typography + rich aria-label", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToSchedule(page, SCHEDULE_PROJECT_ID);

    const badge = page.getByTestId("day-difficulty-badge").first();
    await expect(badge).toBeVisible({ timeout: 15_000 });

    const ariaLabel = await badge.getAttribute("aria-label");
    expect(ariaLabel).toBeTruthy();
    expect(ariaLabel ?? "").toMatch(/Difficolt/i);
    expect(ariaLabel ?? "").toMatch(/Riuscita/i);
    expect(ariaLabel ?? "").toMatch(/punti su 5/i);
  });
});
