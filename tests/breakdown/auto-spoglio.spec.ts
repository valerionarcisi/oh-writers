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
 * The team-seed (see packages/db/src/seed/fixtures/breakdown-fixtures.ts)
 * gives us:
 *   - Scene 1 — "INT. APPARTAMENTO - NOTTE" → location "Appartamento" (accepted)
 *   - Scene 2 — "EXT. STRADA - GIORNO"     → location "Strada" (accepted)
 *                                          → vehicle "Macchina" (pending)
 *
 * Scene 1 is the default active scene on mount, so the tags should appear
 * in the breakdown panel without further interaction.
 */
test.describe("[Spec 10e] Breakdown — auto-spoglio", () => {
  test("[OHW-320] auto-spoglio extracts the seeded scene-1 location without user action", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToBreakdown(page, TEAM_PROJECT_ID);

    // The location extractor turns "INT. APPARTAMENTO - NOTTE" into the
    // accepted tag "Appartamento". We never click "Suggerisci".
    await expect(
      page.getByTestId("accepted-tag-Appartamento").first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("[OHW-321] re-opening the breakdown page does not duplicate auto-extracted occurrences", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;

    // First visit — wait for the auto-spoglio result to land.
    await navigateToBreakdown(page, TEAM_PROJECT_ID);
    const tag = page.getByTestId("accepted-tag-Appartamento");
    await expect(tag.first()).toBeVisible({ timeout: 15_000 });
    const firstCount = await tag.count();

    // Navigate away then back — the second mount must short-circuit
    // server-side via the text_hash check, so the count cannot grow.
    await page.goto("/dashboard");
    await page.waitForURL("**/dashboard", { timeout: 10_000 });

    await navigateToBreakdown(page, TEAM_PROJECT_ID);
    await expect(
      page.getByTestId("accepted-tag-Appartamento").first(),
    ).toBeVisible({ timeout: 15_000 });
    const secondCount = await page
      .getByTestId("accepted-tag-Appartamento")
      .count();

    expect(secondCount).toBe(firstCount);
  });

  test("[OHW-322] viewer never triggers auto-spoglio (no banner, mutation requires edit)", async ({
    authenticatedViewerPage,
  }) => {
    const page = authenticatedViewerPage;
    await navigateToBreakdown(page, TEAM_PROJECT_ID);
    // The banner is keyed off the mutation's pending state, which is gated
    // by canEdit. A read-only viewer must never see it.
    await expect(page.getByTestId("auto-spoglio-banner")).toHaveCount(0);
  });
});
