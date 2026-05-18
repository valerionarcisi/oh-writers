import { test, expect } from "./fixtures";
import {
  navigateToBreakdown,
  openSceneInBreakdown,
  TEAM_PROJECT_ID,
} from "./breakdown/helpers";
import {
  openCesareSheet,
  sendCesareMessage,
  waitForCesareReply,
  setMockContext,
} from "./helpers/cesare";

/**
 * [Spec 34] Cesare agentic — Breakdown
 *
 * - OHW-542: SceneCostPanel renders cost + difficulty for an active scene.
 *   This is a deterministic computation (no LLM involvement), so it works
 *   identically under MOCK_AI=true.
 * - OHW-543: The user asks Cesare to estimate scene cost. The scripted
 *   scenario emits an `estimate_scene_cost` tool_use; the executor returns the
 *   pure-function output and Cesare's textual reply mentions a euro figure.
 */
test.describe("[Spec 34] Cesare Agentic — Breakdown", () => {
  test("[OHW-542] SceneCostPanel renders cost and difficulty", async ({
    authenticatedPage,
  }) => {
    await navigateToBreakdown(authenticatedPage, TEAM_PROJECT_ID);
    await openSceneInBreakdown(authenticatedPage, 3);

    const panel = authenticatedPage.getByTestId("scene-cost-panel");
    await expect(panel).toBeVisible({ timeout: 15_000 });

    // Eur figure rendered as something like "€ 4.200" or "€4.200" in the
    // total slot.
    await expect(panel).toContainText("€", { timeout: 10_000 });
    await expect(panel.getByText(/Difficoltà/i)).toBeVisible();
  });

  test("[OHW-543] Cesare estimates scene cost via estimate_scene_cost tool", async ({
    authenticatedPage,
  }) => {
    await navigateToBreakdown(authenticatedPage, TEAM_PROJECT_ID);
    await openSceneInBreakdown(authenticatedPage, 3);

    await setMockContext(authenticatedPage, { SCENE_NUMBER: 3 });

    await openCesareSheet(authenticatedPage);
    await sendCesareMessage(
      authenticatedPage,
      "Stima il costo della scena 3.",
    );
    const reply = await waitForCesareReply(authenticatedPage);

    // Mock scenario text: "Costo stimato per la scena: circa €4.200…"
    expect(reply.toLowerCase()).toMatch(/costo|€|difficolt/);
  });
});
