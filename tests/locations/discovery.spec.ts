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

// Discovery pins are divIcon markers. Below the cluster threshold (the common
// case, and the 2 mock fixtures) they render individually as .ohw-discovery-pin;
// above it they collapse into a .marker-cluster icon.
const DISCOVERY_PIN_SELECTOR = ".ohw-discovery-pin";
const CLUSTER_SELECTOR = "[class*=marker-cluster]";
// Sentinel radius that makes the mock return a dense (25-place) result set.
const DENSE_RADIUS_M = 9999;

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

    // Two mock places (< cluster threshold) render as individual discovery pins.
    // Center on the area so they're laid out; the poll wins the race against the
    // async discovery fetch.
    await expect
      .poll(
        async () => {
          await page.evaluate(() => {
            (
              window as unknown as {
                __ohwLeafletMap?: {
                  setView(c: [number, number], z: number): void;
                };
              }
            ).__ohwLeafletMap?.setView([45.46, 9.19], 14);
          });
          return page.locator(DISCOVERY_PIN_SELECTOR).count();
        },
        { timeout: 15_000 },
      )
      .toBeGreaterThan(0);

    // Open a discovery pin's popup and add it as a candidate.
    await page.locator(DISCOVERY_PIN_SELECTOR).first().click();
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

  test("[OHW-374] Dense discovery results collapse into a cluster icon", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToLocations(page, LOCATIONS_PROJECT_ID);

    // The sentinel radius makes the mock return 25 places — above the cluster
    // threshold — so MarkerCluster groups them instead of drawing 25 loose pins.
    await page.evaluate((radius) => {
      window.dispatchEvent(
        new CustomEvent("ohw:test-draw-circle", {
          detail: { lat: 45.46, lng: 9.19, radius_m: radius },
        }),
      );
    }, DENSE_RADIUS_M);

    // Center on the area; the 25 markers cluster. Poll setView so we win the
    // race against the async discovery fetch and trigger MarkerCluster layout.
    await expect
      .poll(
        async () => {
          await page.evaluate(() => {
            (
              window as unknown as {
                __ohwLeafletMap?: {
                  setView(c: [number, number], z: number): void;
                };
              }
            ).__ohwLeafletMap?.setView([45.46, 9.19], 13);
          });
          return page.locator(CLUSTER_SELECTOR).count();
        },
        { timeout: 15_000 },
      )
      .toBeGreaterThan(0);
  });
});
