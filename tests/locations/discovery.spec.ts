import { test, expect } from "../fixtures";
import {
  navigateToLocations,
  LOCATIONS_PROJECT_ID,
  SEEDED_LOCATION_REQ_1_ID,
  SEEDED_LOCATION_REQ_2_ID,
} from "./helpers";

/**
 * [Spec 37 + 37b — Location Matching, Area Discovery, scene-aware]
 *
 * Selecting an area auto-discovers real places (Google Places) inside it and
 * renders them as hollow pins, scoped to the SELECTED requirement's type.
 * Under MOCK_AI the discovery returns type-aware fixtures. These tests verify:
 *   - Drawing a circle (area filter) triggers discovery → hollow pins appear.
 *   - Adding a discovered hollow pin persists a new candidate.
 *   - A non-searchable scene (a street) yields no pins (skipped).
 *   - The clear-area pill removes the boundary + pins.
 *   - Dense results collapse into a cluster icon.
 *
 * Seeded project 11: REQ_1 = appartamento (searchable), REQ_2 = strada (skipped).
 */

const setAreaView = async (
  page: import("@playwright/test").Page,
  lat: number,
  lng: number,
  zoom: number,
) => {
  await page.evaluate(
    ([la, ln, z]) => {
      (
        window as unknown as {
          __ohwLeafletMap?: {
            setView(c: [number, number], z: number): void;
          };
        }
      ).__ohwLeafletMap?.setView([la, ln], z);
    },
    [lat, lng, zoom] as const,
  );
};

const drawCircle = async (
  page: import("@playwright/test").Page,
  radius = 2000,
) => {
  await page.evaluate((r) => {
    window.dispatchEvent(
      new CustomEvent("ohw:test-draw-circle", {
        detail: { lat: 45.46, lng: 9.19, radius_m: r },
      }),
    );
  }, radius);
};

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

  test("[OHW-377] A non-searchable scene (a street) yields no discovery pins", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToLocations(page, LOCATIONS_PROJECT_ID);

    // REQ_2 = "Strada del paese" (type strada) — not searchable by place type.
    await page
      .getByTestId(`requirement-row-${SEEDED_LOCATION_REQ_2_ID}`)
      .click();
    await drawCircle(page);

    // Give discovery time, nudge the view, and confirm no pins appear.
    await setAreaView(page, 45.46, 9.19, 14);
    await page.waitForTimeout(4000);
    await setAreaView(page, 45.46, 9.19, 14);
    expect(await page.locator(DISCOVERY_PIN_SELECTOR).count()).toBe(0);
    expect(await page.locator(CLUSTER_SELECTOR).count()).toBe(0);
  });

  test("[OHW-379] The clear-area pill removes the boundary and the pins", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToLocations(page, LOCATIONS_PROJECT_ID);

    // REQ_1 = appartamento (searchable) → pins appear.
    await page
      .getByTestId(`requirement-row-${SEEDED_LOCATION_REQ_1_ID}`)
      .click();
    await drawCircle(page);
    await expect
      .poll(
        async () => {
          await setAreaView(page, 45.46, 9.19, 14);
          return page.locator(DISCOVERY_PIN_SELECTOR).count();
        },
        { timeout: 15_000 },
      )
      .toBeGreaterThan(0);

    const pill = page.getByTestId("clear-area-pill");
    await expect(pill).toBeVisible();
    await pill.click();

    await expect(pill).toBeHidden();
    await expect
      .poll(async () => page.locator(DISCOVERY_PIN_SELECTOR).count(), {
        timeout: 5_000,
      })
      .toBe(0);
  });

  test("[OHW-381] 'Ordina per scena' ranks the discovered places (atmosphere)", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToLocations(page, LOCATIONS_PROJECT_ID);

    // REQ_1 = appartamento (searchable) → mock returns the restaurant set
    // (Trattoria + Ristorante Stellato), each with atmosphere signals.
    await page
      .getByTestId(`requirement-row-${SEEDED_LOCATION_REQ_1_ID}`)
      .click();
    await drawCircle(page);
    await expect
      .poll(
        async () => {
          await setAreaView(page, 45.46, 9.19, 14);
          return page.locator(DISCOVERY_PIN_SELECTOR).count();
        },
        { timeout: 15_000 },
      )
      .toBeGreaterThan(0);

    // The rank affordance appears once there are discovered places + a scene.
    const rankPill = page.getByTestId("rank-by-scene-pill");
    await expect(rankPill).toBeVisible();
    await rankPill.click();

    // Ranking completes (the button leaves its "Ordino…" pending state).
    await expect(rankPill).toHaveText(/Ordina per scena/, { timeout: 15_000 });
  });
});
