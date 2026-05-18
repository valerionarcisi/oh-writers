import { test, expect } from "./fixtures";
import { navigateToBudget, BUDGET_PROJECT_ID } from "./budget/helpers";
import {
  openCesareSheet,
  sendCesareMessage,
  waitForCesareReply,
  setMockContext,
} from "./helpers/cesare";

/**
 * [Spec 34] Cesare agentic — Budget
 *
 * The user asks Cesare to lower a budget line by 200€. The scripted scenario
 * emits an `update_budget_line` tool_use; the executor attempts the update
 * (it may fail if the line UUID is unknown for the test project — that's OK,
 * we only verify the scenario fired and the AppShell toast handler surfaced
 * "✦ Cesare ha aggiornato il budget" because the reply mentions "aggiornato").
 *
 * Verifying the actual DB write is the job of a Vitest unit test against
 * `executeUpdateBudgetLine`; here we exercise the Cesare wire-up only.
 */
test.describe("[Spec 34] Cesare Agentic — Budget", () => {
  test("[OHW-546] Cesare updates a budget line via update_budget_line tool", async ({
    authenticatedPage,
  }) => {
    await navigateToBudget(authenticatedPage, BUDGET_PROJECT_ID);

    // The team-project budget may not be generated. The Cesare flow still
    // works because the LLM is mocked — we don't need a real row to verify
    // the agentic path. Use a placeholder UUID so the executor surfaces a
    // typed error inside Cesare's reply rather than crashing the loop.
    await setMockContext(authenticatedPage, {
      BUDGET_LINE_ID: "00000000-0000-4000-a000-0000000aaaaa",
      NEW_RATE: 100,
    });

    await openCesareSheet(authenticatedPage);
    await sendCesareMessage(authenticatedPage, "Abbassa la voce di 200€.");
    const reply = await waitForCesareReply(authenticatedPage);

    // The scripted scenario emits the tool_use then a confirmation text.
    expect(reply.toLowerCase()).toMatch(/aggiornato|modificat|rate|voce/);

    await expect(
      authenticatedPage.getByText("✦ Cesare ha aggiornato il budget"),
    ).toBeVisible({ timeout: 5_000 });
  });
});
