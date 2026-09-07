/**
 * Spec 89b — AI disclosure stamp, locations: direct plumbing coverage.
 *
 * Complements ai-disclosure-stamp.spec.ts (export-level assertion, driven by
 * a test-hook) with a check that a REAL Cesare tool call (add_candidate,
 * cesare-tools.ts) actually sets the touched requirement's everAiTouched =
 * true — not just that the export reads the field correctly once it's set
 * by hand. Mirrors tests/schedule/ai-disclosure-stamp-plumbing.spec.ts.
 */
import { test, expect } from "../fixtures";
import {
  navigateToLocations,
  LOCATIONS_PROJECT_ID,
  SEEDED_LOCATION_REQ_1_ID,
} from "./helpers";
import {
  openCesareSheet,
  sendCesareWithRetry,
  setMockContext,
  resetCesareState,
} from "../helpers/cesare";
import { BASE_URL } from "../helpers";

test.describe("[OHW-148] Locations — Cesare tool sets everAiTouched directly", () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await resetCesareState(authenticatedPage, LOCATIONS_PROJECT_ID);
    await authenticatedPage.request.post(
      `${BASE_URL}/api/test/set-location-requirement-ai-touched`,
      {
        data: { requirementId: SEEDED_LOCATION_REQ_1_ID, touched: false },
        headers: { "Content-Type": "application/json" },
      },
    );
  });

  test.afterEach(async ({ authenticatedPage }) => {
    await authenticatedPage.request.post(
      `${BASE_URL}/api/test/set-location-requirement-ai-touched`,
      {
        data: { requirementId: SEEDED_LOCATION_REQ_1_ID, touched: false },
        headers: { "Content-Type": "application/json" },
      },
    );
  });

  test("add_candidate sets everAiTouched=true on the touched requirement", async ({
    authenticatedPage: page,
  }) => {
    await navigateToLocations(page, LOCATIONS_PROJECT_ID);

    const firstReq = page.locator('[data-testid^="requirement-row-"]').first();
    await expect(firstReq).toBeVisible({ timeout: 10_000 });
    await firstReq.click();

    await setMockContext(page, { REQ_ID: SEEDED_LOCATION_REQ_1_ID });

    const before = await page.request.get(
      `${BASE_URL}/api/test/set-location-requirement-ai-touched?requirementId=${SEEDED_LOCATION_REQ_1_ID}`,
    );
    expect((await before.json()).everAiTouched).toBe(false);

    await openCesareSheet(page);
    await sendCesareWithRetry(page, "Trova candidati per questa scena.");
    await expect(page.getByTestId("cesare-conversation")).toContainText(
      /candidat|trovat|aggiunt/i,
      { timeout: 30_000 },
    );

    const after = await page.request.get(
      `${BASE_URL}/api/test/set-location-requirement-ai-touched?requirementId=${SEEDED_LOCATION_REQ_1_ID}`,
    );
    expect((await after.json()).everAiTouched).toBe(true);
  });
});
