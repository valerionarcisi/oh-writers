import { expect } from "@playwright/test";
import { test } from "../fixtures";
import { navigateToBreakdown, TEAM_PROJECT_ID } from "./helpers";

/**
 * [Spec 10e] Auto-spoglio via RegEx
 *
 * On first mount of the breakdown page, a server fan-out runs RegEx
 * extractors over every scene of the active version. Items land as
 * accepted (high-confidence categories) or pending ghosts. The run is
 * idempotent — text_hash short-circuits on subsequent mounts.
 *
 * Auto-extracted elements are no longer surfaced as side-panel `accepted-tag-*`
 * chips (the BreakdownPanel was removed in the v3 redesign). They now render as
 * inline decorations over the matched text in the screenplay reader: accepted
 * elements as `[data-cat][data-element-id]` highlights, pending ones with an
 * additional `[data-ghost="true"]`. The team version text (NON_FA_RIDERE)
 * reliably yields accepted CAST highlights from its CAPS character cues, which
 * is what these tests anchor on.
 */
test.describe("[Spec 10e] Breakdown — auto-spoglio", () => {
  test("[320] auto-spoglio extracts elements on mount without user action", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToBreakdown(page, TEAM_PROJECT_ID);

    // No "Suggerisci"/manual action: simply mounting the page must produce
    // committed inline highlights over the screenplay text.
    const reader = page.getByTestId("readonly-screenplay-view");
    await expect(
      reader.locator('[data-element-id]:not([data-ghost="true"])').first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("[321] re-opening the breakdown page does not duplicate auto-extracted occurrences", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    const reader = page.getByTestId("readonly-screenplay-view");
    const accepted = reader.locator(
      '[data-element-id]:not([data-ghost="true"])',
    );

    // First visit — wait for the auto-spoglio result to land, then snapshot
    // the committed-highlight count.
    await navigateToBreakdown(page, TEAM_PROJECT_ID);
    await expect(accepted.first()).toBeVisible({ timeout: 15_000 });
    const firstCount = await accepted.count();

    // Navigate away then back — the second mount must short-circuit
    // server-side via the text_hash check, so the count cannot grow.
    await page.goto("/dashboard");
    await page.waitForURL("**/dashboard", { timeout: 10_000 });

    await navigateToBreakdown(page, TEAM_PROJECT_ID);
    await expect(accepted.first()).toBeVisible({ timeout: 15_000 });
    const secondCount = await accepted.count();

    expect(secondCount).toBe(firstCount);
  });

  test("[322] viewer never triggers auto-spoglio (no banner, mutation requires edit)", async ({
    authenticatedViewerPage,
  }) => {
    const page = authenticatedViewerPage;
    await navigateToBreakdown(page, TEAM_PROJECT_ID);
    // The banner is keyed off the mutation's pending state, which is gated
    // by canEdit. A read-only viewer must never see it.
    await expect(page.getByTestId("auto-spoglio-banner")).toHaveCount(0);
  });
});
