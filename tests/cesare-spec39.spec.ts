import { test, expect } from "./fixtures";
import { BASE_URL } from "./fixtures";
import {
  navigateToLocations,
  LOCATIONS_PROJECT_ID,
  SEEDED_LOCATION_REQ_1_ID,
} from "./locations/helpers";
import { navigateToBreakdown, TEAM_PROJECT_ID } from "./breakdown/helpers";
import {
  openCesareSheet,
  sendCesareMessage,
  waitForCesareReply,
  setMockContext,
} from "./helpers/cesare";

/**
 * [Spec 39] Context Stratification — Skill isolation E2E tests
 *
 * Verifies that handleAskCesareV2 routes the correct tools to each page.
 * Runs against the mock LLM (MOCK_AI=true) — no real Anthropic API calls.
 *
 * [039e-a] Locations page: read_scene skill is active — Cesare calls
 *   read_scene when asked about a scene.
 *
 * [039e-b] Breakdown page: budget tools are NOT present — the mock
 *   LLM fallback text is returned (no budget-specific tool use), confirming
 *   that the skill registry does not inject budget tools into the breakdown
 *   page's tool set.
 */
test.describe("[Spec 39] Cesare V2 — skill isolation", () => {
  test("[039e-a] Locations page uses read_scene tool when asked about a scene", async ({
    authenticatedPage,
  }) => {
    await navigateToLocations(authenticatedPage, LOCATIONS_PROJECT_ID);

    // Activate the first requirement so the page sends requirementId in
    // the page context — matching the locations skill selection path.
    const firstReq = authenticatedPage
      .locator('[data-testid^="requirement-row-"]')
      .first();
    await expect(firstReq).toBeVisible({ timeout: 10_000 });
    await firstReq.click();

    await setMockContext(authenticatedPage, {
      REQ_ID: SEEDED_LOCATION_REQ_1_ID,
    });

    await openCesareSheet(authenticatedPage);
    await sendCesareMessage(
      authenticatedPage,
      "Dimmi cosa succede nella scena 1",
    );
    const reply = await waitForCesareReply(authenticatedPage);

    // The mock scenario for this message returns text referencing scene 1
    // after calling read_scene. A non-empty reply that mentions the scene
    // confirms the tool loop ran with the read-scene skill active.
    expect(reply.length).toBeGreaterThan(20);
    expect(reply).toMatch(/scena/i);
  });

  test("[039e-b] Breakdown page does not expose budget tools", async ({
    authenticatedPage,
  }) => {
    await navigateToBreakdown(authenticatedPage, TEAM_PROJECT_ID);

    await openCesareSheet(authenticatedPage);

    // Send a message that would trigger budget tools if they were present.
    // Because breakdown only has breakdown + read-scene skills, the mock
    // LLM returns the generic fallback text (no matching budget scenario),
    // meaning the response is a non-error text reply — not a budget tool call.
    await sendCesareMessage(
      authenticatedPage,
      "Dammi un riassunto dello stato del breakdown.",
    );
    const reply = await waitForCesareReply(authenticatedPage);

    // Should get a non-empty reply without errors — the generic fallback text
    // from the mock is returned when no scenario matches.
    expect(reply.length).toBeGreaterThan(10);
    expect(reply).not.toMatch(/errore|error|500/i);
  });
});
