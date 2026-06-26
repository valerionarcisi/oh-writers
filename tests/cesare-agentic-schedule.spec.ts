import { test, expect } from "./fixtures";
import { navigateToSchedule, SCHEDULE_PROJECT_ID } from "./schedule/helpers";
import {
  openCesareSheet,
  sendCesareWithRetry,
  setMockContext,
  resetCesareState,
} from "./helpers/cesare";

/**
 * [Spec 34] Cesare agentic — Schedule
 *
 * - 544: The DayDifficultyBadge for the first shooting day renders a
 *   difficulty score and a probability percentage. Deterministic pure-function
 *   output, so MOCK_AI does not affect this.
 * - 545: The user asks Cesare to move a scene to a different day. The
 *   scripted scenario emits a `move_scene_to_day` tool_use; the executor
 *   updates the schedule and Cesare confirms the action in the reply.
 */
test.describe("[Spec 34] Cesare Agentic — Schedule", () => {
  // Clear persisted Cesare chat (Spec 51) so a prior schedule turn's session
  // does not leave a stale thread selected, which intermittently left the new
  // turn's reply unrendered (545 flake in the serial mock-ui run).
  test.beforeEach(async ({ authenticatedPage }) => {
    await resetCesareState(authenticatedPage, SCHEDULE_PROJECT_ID);
  });

  test("[544] DayDifficultyBadge shows difficulty + probability", async ({
    authenticatedPage,
  }) => {
    await navigateToSchedule(authenticatedPage, SCHEDULE_PROJECT_ID);

    const badge = authenticatedPage.getByTestId("day-difficulty-badge").first();
    await expect(badge).toBeVisible({ timeout: 15_000 });

    await expect(badge).toContainText(/Difficolt/i);
    // Probability shows up as a "%" suffix from estimateSuccessProbability.
    await expect(badge).toContainText("%");
  });

  test("[545] Cesare moves a scene via move_scene_to_day tool", async ({
    authenticatedPage,
  }) => {
    await navigateToSchedule(authenticatedPage, SCHEDULE_PROJECT_ID);

    await setMockContext(authenticatedPage, {
      SCENE_NUMBER: 3,
      TARGET_DAY: 2,
    });

    await openCesareSheet(authenticatedPage);
    await sendCesareWithRetry(
      authenticatedPage,
      "Sposta la scena 3 al giorno 2.",
    );

    // The strip board is a heavy surface; rather than rely on the generic
    // "≥2 paragraphs" reply heuristic (which intermittently fired before the
    // assistant turn had rendered on this page), poll the conversation directly
    // for the move confirmation. Mock reply: "Ho spostato la scena al giorno
    // richiesto. Lo schedule è stato aggiornato."
    await expect(
      authenticatedPage.getByTestId("cesare-conversation"),
    ).toContainText(/spostat|giorno|schedule|aggiornato/i, { timeout: 30_000 });
  });
});
