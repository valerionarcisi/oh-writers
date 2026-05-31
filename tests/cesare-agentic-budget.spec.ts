import { test, expect } from "./fixtures";
import { navigateToBudget, BUDGET_PROJECT_ID } from "./budget/helpers";
import {
  openCesareSheet,
  sendCesareMessage,
  waitForCesareReply,
  setMockContext,
  resetCesareState,
} from "./helpers/cesare";

/**
 * [Spec 34 + Audit F-A3] Cesare agentic — Budget, honest success only.
 *
 * The user asks Cesare to lower a budget line. The scripted scenario emits an
 * `update_budget_line` tool_use; with an unknown line UUID the executor surfaces
 * a typed error — a genuine no-op against the DB. The success TOAST must then
 * NOT appear: it is bound to the real `entity-applied` marker, not to the reply
 * text. (The DB-write path is covered by the `executeUpdateBudgetLine` Vitest
 * and by the marker-emission unit test in cesare-tools.test.ts.)
 */
test.describe("[Spec 34] Cesare Agentic — Budget", () => {
  test("[OHW-546] a failed budget update shows NO false success toast (F-A3)", async ({
    authenticatedPage,
  }) => {
    // Start from a clean conversation so no prior successful turn's card leaks
    // into this assertion.
    await resetCesareState(authenticatedPage, BUDGET_PROJECT_ID);
    await navigateToBudget(authenticatedPage, BUDGET_PROJECT_ID);

    // Placeholder UUID: the executor returns a typed error, so nothing is
    // written. The reply may still mention "aggiornato" — the toast must NOT
    // fire off that text any more.
    await setMockContext(authenticatedPage, {
      BUDGET_LINE_ID: "00000000-0000-4000-a000-0000000aaaaa",
      NEW_RATE: 100,
    });

    await openCesareSheet(authenticatedPage);
    await sendCesareMessage(authenticatedPage, "Abbassa la voce di 200€.");
    await waitForCesareReply(authenticatedPage);

    // No fabricated success: the toast keyed to a real apply must stay absent,
    // and so must the result card claiming a change.
    await expect(
      authenticatedPage.getByText("✦ Cesare ha aggiornato il budget"),
    ).toHaveCount(0);
    await expect(
      authenticatedPage.getByTestId("cesare-change-trace"),
    ).toHaveCount(0);
  });
});
