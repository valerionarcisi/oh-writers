import { test, expect } from "../fixtures";
import { navigateToLocations, LOCATIONS_PROJECT_ID } from "./helpers";

/**
 * [Spec 37 — Location Matching & Area Discovery, Phase 2]
 *
 * Selecting an area auto-discovers real places (Google Places) inside it and
 * renders them as hollow pins. Under MOCK_AI the discovery returns two fixed
 * fixtures (Trattoria del Cerchio = restaurant, Bar Centrale = bar). These
 * tests verify:
 *   - Drawing a circle (area filter) triggers discovery → hollow pins appear.
 *   - Adding a discovered hollow pin persists a new candidate.
 */

const HOLLOW_PIN_SELECTOR = 'path.leaflet-interactive[stroke="#1d4ed8"]';

test.describe("[Spec 37] Location area discovery", () => {
  test("[OHW-372] Drawing an area discovers places as hollow pins, adding one persists a candidate", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToLocations(page, LOCATIONS_PROJECT_ID);

    // Select the first requirement so an "add target" exists for places that
    // don't match a resolved type (fallback assigns to the selected requirement).
    const firstReq = page.locator('[data-testid^="requirement-row-"]').first();
    await expect(firstReq).toBeVisible({ timeout: 10_000 });
    await firstReq.click();

    const cardsBefore = await page
      .locator('[data-testid^="candidate-card-"]')
      .count();

    // Drawing a circle sets the area filter, which drives discovery.
    await page.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent("ohw:test-draw-circle", {
          detail: { lat: 45.46, lng: 9.19, radius_m: 2000 },
        }),
      );
    });

    // Discovery (MOCK_AI) returns two hollow pins.
    await expect
      .poll(async () => page.locator(HOLLOW_PIN_SELECTOR).count(), {
        timeout: 10_000,
      })
      .toBeGreaterThan(0);

    // Open a hollow pin's popup. Leaflet circle markers are SVG paths; a
    // dispatched DOM click event is what Leaflet's handler listens for
    // (Playwright's normal click is unreliable on SVG paths).
    await page.locator(HOLLOW_PIN_SELECTOR).first().dispatchEvent("click");
    const addBtn = page.locator("[data-found-add]").first();
    await expect(addBtn).toBeVisible({ timeout: 5_000 });
    await addBtn.click();

    await expect
      .poll(
        async () => page.locator('[data-testid^="candidate-card-"]').count(),
        { timeout: 10_000 },
      )
      .toBeGreaterThan(cardsBefore);
  });
});
