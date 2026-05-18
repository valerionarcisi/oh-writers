import { test, expect } from "./fixtures";
import { navigateToSchedule, SCHEDULE_PROJECT_ID } from "./schedule/helpers";
import {
  openCesareSheet,
  sendCesareMessage,
  waitForCesareReply,
  setMockContext,
} from "./helpers/cesare";

/**
 * [Spec 34] Cesare agentic — Schedule
 *
 * - OHW-544: The DayDifficultyBadge for the first shooting day renders a
 *   difficulty score and a probability percentage. Deterministic pure-function
 *   output, so MOCK_AI does not affect this.
 * - OHW-545: The user asks Cesare to move a scene to a different day. The
 *   scripted scenario emits a `move_scene_to_day` tool_use; the executor
 *   updates the schedule and Cesare confirms the action in the reply.
 */
test.describe("[Spec 34] Cesare Agentic — Schedule", () => {
  test("[OHW-544] DayDifficultyBadge shows difficulty + probability", async ({
    authenticatedPage,
  }) => {
    await navigateToSchedule(authenticatedPage, SCHEDULE_PROJECT_ID);

    const badge = authenticatedPage.getByTestId("day-difficulty-badge").first();
    await expect(badge).toBeVisible({ timeout: 15_000 });

    await expect(badge).toContainText(/Difficolt/i);
    // Probability shows up as a "%" suffix from estimateSuccessProbability.
    await expect(badge).toContainText("%");
  });

  test("[OHW-545] Cesare moves a scene via move_scene_to_day tool", async ({
    authenticatedPage,
  }) => {
    await navigateToSchedule(authenticatedPage, SCHEDULE_PROJECT_ID);

    await setMockContext(authenticatedPage, {
      SCENE_NUMBER: 3,
      TARGET_DAY: 2,
    });

    await openCesareSheet(authenticatedPage);
    await sendCesareMessage(
      authenticatedPage,
      "Sposta la scena 3 al giorno 2.",
    );
    const reply = await waitForCesareReply(authenticatedPage);

    // Mock reply confirms "Ho spostato la scena al giorno richiesto."
    expect(reply.toLowerCase()).toMatch(/spostat|giorno|schedule|aggiornato/);
  });
});
