/**
 * [OHW-834] Spec 83 — LLM spoglio trigger policy (explicit action, no on-mount call)
 *
 * `streamFullSpoglio` (the LLM/Sonnet full-script breakdown) must never fire
 * on Breakdown mount — only `runAutoSpoglioForVersion` (the cheap RegEx
 * baseline, no model call) is allowed to auto-run. The LLM run starts only
 * from the "Ri-spogliare con AI" button (`breakdown-respoglio-cta`), which
 * flips on when the screenplay's active version changes
 * (`screenplays.breakdownStale`, see `breakdown-stale-banner`).
 *
 * These specs do NOT force `breakdownStale=true` on the shared TEAM_PROJECT_ID
 * fixture (creating a new screenplay version would leave a permanent, empty
 * active version behind for the rest of the suite run — the same caution
 * `breakdown-stale.spec.ts` already takes: "the seed ships them non-stale").
 * The button-press contract is verified directly instead, since the CTA is
 * gated on `canEdit` + in-flight state, not on staleness.
 */

import { expect } from "@playwright/test";
import { test } from "../fixtures";
import { navigateToBreakdown, TEAM_PROJECT_ID } from "./helpers";

const streamFullSpoglioUrl = /--streamFullSpoglio_createServerFn_handler/;

test.describe("[OHW-834] Breakdown — spoglio trigger policy", () => {
  test("mounting the Breakdown page never calls streamFullSpoglio", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    let spoglioHits = 0;
    await page.route(streamFullSpoglioUrl, (route) => {
      spoglioHits += 1;
      void route.continue();
    });

    await navigateToBreakdown(page, TEAM_PROJECT_ID);
    // Let auto-spoglio (the regex baseline) and any settle-time network
    // activity finish before asserting the LLM endpoint stayed silent.
    await page.waitForTimeout(2_000);

    expect(spoglioHits).toBe(0);
  });

  test("pressing 'Ri-spogliare con AI' is the only thing that calls streamFullSpoglio", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    let spoglioHits = 0;
    await page.route(streamFullSpoglioUrl, (route) => {
      spoglioHits += 1;
      void route.continue();
    });

    await navigateToBreakdown(page, TEAM_PROJECT_ID);
    expect(spoglioHits).toBe(0);

    const cta = page.getByTestId("breakdown-respoglio-cta");
    await expect(cta).toBeVisible();
    await expect(cta).toBeEnabled();
    await cta.click();

    // Our own confirm modal (not the native window.confirm) — accept the
    // visible one (the dialog primitive keeps a hidden instance mounted),
    // same pattern as tests/editor/versions-drawer.spec.ts.
    await page
      .getByTestId("confirm-dialog-confirm-btn")
      .filter({ visible: true })
      .click();

    // The button disables while the mutation is in flight and re-enables once
    // the (mocked) run resolves — the client-visible completion signal.
    await expect(cta).toBeDisabled({ timeout: 5_000 });
    await expect(cta).toBeEnabled({ timeout: 15_000 });

    expect(spoglioHits).toBeGreaterThan(0);
  });

  test("a viewer never sees the respoglio CTA or a spoglio call", async ({
    authenticatedViewerPage,
  }) => {
    const page = authenticatedViewerPage;
    let spoglioHits = 0;
    await page.route(streamFullSpoglioUrl, (route) => {
      spoglioHits += 1;
      void route.continue();
    });

    await navigateToBreakdown(page, TEAM_PROJECT_ID);
    await expect(page.getByTestId("breakdown-respoglio-cta")).toHaveCount(0);
    await page.waitForTimeout(1_000);

    expect(spoglioHits).toBe(0);
  });
});
