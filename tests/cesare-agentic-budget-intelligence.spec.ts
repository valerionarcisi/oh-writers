import { test, expect } from "./fixtures";
import { navigateToBudget, BUDGET_PROJECT_ID } from "./budget/helpers";
import type { Page } from "@playwright/test";
import {
  openCesareSheet,
  sendCesareMessage,
  TRANSIENT_FAILURE_RE,
} from "./helpers/cesare";

/**
 * [Spec 30] Cesare agentic — Budget intelligence (Wave 3 — Agent C)
 *
 * Covers the four new budget-intelligence tools:
 *  - set_budget_cap            (write)
 *  - evaluate_against_cap      (read)
 *  - propose_excessive_lines_flags (read-only proposal)
 *  - the weekly view tab (no Cesare; rendering check)
 *
 * Tests share `BUDGET_PROJECT_ID`. The LLM is mocked via MOCK_AI=true.
 */

// Multi-turn-safe reply waiter (mirrors cost-foundation spec). Match the
// assistant markdown body, present in both the plain and tool-using bubble
// shapes; the skeleton LoadingIndicator carries no `bubbleMarkdown`.
const ASSISTANT_BUBBLE = '[class*="bubbleMarkdown"]';

async function sendAndWaitForReply(
  page: Page,
  prompt: string,
): Promise<string> {
  // The floating drawer renders `<div data-testid="cesare-conversation">`; the
  // legacy `role="log"` wrapper now lives only on the routed session page.
  const log = page.getByTestId("cesare-conversation");

  const sendOnce = async (): Promise<string> => {
    const before = await log.locator(ASSISTANT_BUBBLE).count();
    await sendCesareMessage(page, prompt);
    await expect
      .poll(async () => log.locator(ASSISTANT_BUBBLE).count(), {
        timeout: 30_000,
      })
      .toBeGreaterThan(before);
    const bubbles = log.locator(ASSISTANT_BUBBLE);
    const n = await bubbles.count();
    return (await bubbles.nth(n - 1).textContent()) ?? "";
  };

  // Resend once on the transient empty-context failure (slow-CI seed-vs-read
  // race), matching the shared `sendCesareWithRetry`.
  let reply = await sendOnce();
  if (TRANSIENT_FAILURE_RE.test(reply)) {
    await page.waitForTimeout(1_500);
    reply = await sendOnce();
  }
  return reply;
}

test.describe("[Spec 30] Cesare Agentic — Budget intelligence", () => {
  test("[590] set_budget_cap inserts the cap and the bar reflects it", async ({
    authenticatedPage,
  }) => {
    await navigateToBudget(authenticatedPage, BUDGET_PROJECT_ID);

    // The cap bar is always rendered.
    await expect(authenticatedPage.getByTestId("budget-cap-bar")).toBeVisible({
      timeout: 10_000,
    });

    await openCesareSheet(authenticatedPage);
    const reply = await sendAndWaitForReply(
      authenticatedPage,
      "Imposta tetto a 50000.",
    );
    expect(reply.toLowerCase()).toMatch(/tetto|cap|50/);

    // After Cesare emits set_budget_cap the bar should switch to has-cap=true.
    await expect
      .poll(
        async () =>
          authenticatedPage
            .getByTestId("budget-cap-bar")
            .getAttribute("data-has-cap"),
        { timeout: 10_000 },
      )
      .toBe("true");
  });

  test("[591] evaluate_against_cap returns a textual reply mentioning residual", async ({
    authenticatedPage,
  }) => {
    await navigateToBudget(authenticatedPage, BUDGET_PROJECT_ID);
    await openCesareSheet(authenticatedPage);
    const reply = await sendAndWaitForReply(
      authenticatedPage,
      "Siamo nel budget?",
    );
    expect(reply.toLowerCase()).toMatch(/budget|tetto|residu|rimane/);
  });

  test("[592] propose_excessive_lines_flags returns a list reply", async ({
    authenticatedPage,
  }) => {
    await navigateToBudget(authenticatedPage, BUDGET_PROJECT_ID);
    await openCesareSheet(authenticatedPage);
    const reply = await sendAndWaitForReply(
      authenticatedPage,
      "Ci sono voci eccessive nel budget?",
    );
    expect(reply.toLowerCase()).toMatch(/voci|sopra|categoria|media/);
  });

  test("[593] Weekly view tab renders the timeline", async ({
    authenticatedPage,
  }) => {
    await navigateToBudget(authenticatedPage, BUDGET_PROJECT_ID);

    // Click the "Settimane" option in the SegmentedControl. Each option is a
    // radio input, so we target it by its testid rather than the role.
    await authenticatedPage.getByTestId("segmented-weekly").click();

    await expect(
      authenticatedPage.getByTestId("budget-weekly-view"),
    ).toBeVisible({ timeout: 10_000 });

    // The component either renders week cards (when shooting days exist) or an
    // empty state. Both are acceptable; the test guards the wire-up.
    const card = authenticatedPage.getByTestId("budget-week-card").first();
    const empty = authenticatedPage.getByText(
      /Genera lo schedule e il budget/i,
    );
    await expect(card.or(empty)).toBeVisible({ timeout: 10_000 });
  });
});
