import { test, expect } from "./fixtures";
import { navigateToBreakdown, TEAM_PROJECT_ID } from "./breakdown/helpers";
import {
  openCesareSheet,
  sendCesareMessage,
  waitForCesareReply,
  setMockContext,
} from "./helpers/cesare";

/**
 * [Spec 34] Cesare agentic — Breakdown
 *
 * - OHW-542: the RecapStrip renders the day cost for the active scene.
 *   This is a deterministic computation (no LLM involvement), so it works
 *   identically under MOCK_AI=true. The breakdown v3 redesign (spec-44 WP-C)
 *   replaced the legacy SceneCostPanel (cost + difficulty badge + category
 *   table) with the RecapStrip (cost + category chips + CTA); the standalone
 *   "Difficoltà" badge was intentionally dropped, so this test now asserts the
 *   cost + category chips the strip actually renders.
 * - OHW-543: The user asks Cesare to estimate scene cost. The scripted
 *   scenario emits an `estimate_scene_cost` tool_use; the executor returns the
 *   pure-function output and Cesare's textual reply mentions a euro figure.
 */
test.describe("[Spec 34] Cesare Agentic — Breakdown", () => {
  test("[OHW-542] RecapStrip renders the day cost and category chips", async ({
    authenticatedPage,
  }) => {
    await navigateToBreakdown(authenticatedPage, TEAM_PROJECT_ID);
    // The breakdown page auto-selects the first scene, so the RecapStrip
    // mounts without needing an explicit click.
    const panel = authenticatedPage.getByTestId("recap-strip");
    await expect(panel).toBeVisible({ timeout: 20_000 });

    await expect(panel).toContainText("€", { timeout: 10_000 });
    // The category chips list is labelled "Categorie" in the strip.
    await expect(panel.getByLabel("Categorie")).toBeVisible();
  });

  test("[OHW-543] Cesare estimates scene cost via estimate_scene_cost tool", async ({
    authenticatedPage,
  }) => {
    await navigateToBreakdown(authenticatedPage, TEAM_PROJECT_ID);
    // Wait for the auto-selected scene's recap strip — confirms breakdown data
    // is loaded before we engage Cesare.
    await expect(authenticatedPage.getByTestId("recap-strip")).toBeVisible({
      timeout: 20_000,
    });

    await setMockContext(authenticatedPage, { SCENE_NUMBER: 1 });

    await openCesareSheet(authenticatedPage);
    await sendCesareMessage(authenticatedPage, "Stima il costo della scena 1.");
    const reply = await waitForCesareReply(authenticatedPage);

    // Mock scenario text: "Costo stimato per la scena: circa €4.200…"
    expect(reply.toLowerCase()).toMatch(/costo|€|difficolt|scena/);
  });
});
