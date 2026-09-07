/**
 * Spec 89b — AI disclosure stamp, budget: direct plumbing coverage.
 *
 * Complements ai-disclosure-stamp.spec.ts (export-level assertion, driven by
 * a test-hook) with a check that a REAL Cesare tool call (set_budget_cap,
 * cesare-tools.ts) actually sets budgets.everAiTouched = true via the shared
 * markBudgetAiTouched helper — not just that the export reads the field
 * correctly once it's set by hand. Mirrors
 * tests/schedule/ai-disclosure-stamp-plumbing.spec.ts.
 */
import { test, expect } from "../fixtures";
import { navigateToBudget, generateBudget, BUDGET_PROJECT_ID } from "./helpers";
import {
  openCesareSheet,
  sendCesareWithRetry,
  resetCesareState,
} from "../helpers/cesare";
import { BASE_URL } from "../helpers";

test.describe("[OHW-148] Budget — Cesare tool sets everAiTouched directly", () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await resetCesareState(authenticatedPage, BUDGET_PROJECT_ID);
  });

  test.afterEach(async ({ authenticatedPage }) => {
    await authenticatedPage.request.post(
      `${BASE_URL}/api/test/set-budget-ai-touched`,
      {
        data: { projectId: BUDGET_PROJECT_ID, touched: false },
        headers: { "Content-Type": "application/json" },
      },
    );
  });

  test("set_budget_cap sets everAiTouched=true on the budget", async ({
    authenticatedPage: page,
  }) => {
    await navigateToBudget(page, BUDGET_PROJECT_ID);
    await generateBudget(page);

    // Ensure a clean starting state now that the budget definitely exists.
    await page.request.post(`${BASE_URL}/api/test/set-budget-ai-touched`, {
      data: { projectId: BUDGET_PROJECT_ID, touched: false },
      headers: { "Content-Type": "application/json" },
    });
    const before = await page.request.get(
      `${BASE_URL}/api/test/set-budget-ai-touched?projectId=${BUDGET_PROJECT_ID}`,
    );
    expect((await before.json()).everAiTouched).toBe(false);

    await openCesareSheet(page);
    await sendCesareWithRetry(page, "Metti un tetto globale di 50.000€.");
    await expect(page.getByTestId("cesare-conversation")).toContainText(
      /tetto|budget|impostato/i,
      { timeout: 30_000 },
    );

    const after = await page.request.get(
      `${BASE_URL}/api/test/set-budget-ai-touched?projectId=${BUDGET_PROJECT_ID}`,
    );
    expect((await after.json()).everAiTouched).toBe(true);
  });
});
