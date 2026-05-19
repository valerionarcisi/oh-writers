import { test, expect } from "./fixtures";
import {
  navigateToLocations,
  LOCATIONS_PROJECT_ID,
  SEEDED_LOCATION_CANDIDATE_1_ID,
} from "./locations/helpers";

/**
 * [Spec 29 — Cesare UI / Locations UX] Detail modal, photo lightbox,
 * area-search panel.
 *
 * These tests exercise the new "location detail UX" surface that sits between
 * the map and the panel:
 *   1. Click a pin's "Vedi dettagli" → modal opens with photos grid
 *   2. Click a photo in the modal → lightbox full-screen + ESC closes
 *   3. Programmatically draw a circle on the map → AreaSearchPanel shows up,
 *      a stubbed Places response feeds the result list, clicking "Aggiungi"
 *      writes a real candidate row via the existing server function.
 *
 * The area-search Places API call is stubbed at the network layer via
 * `page.route()` — no Google API key is required and the response is
 * deterministic.
 */

test.describe("[Spec 29] Locations UX — modal + lightbox + area search", () => {
  test("[OHW-585] Detail modal: pin popup 'Vedi dettagli' opens the modal with photos grid", async ({
    authenticatedPage,
  }) => {
    await navigateToLocations(authenticatedPage, LOCATIONS_PROJECT_ID);

    // Activate the first requirement so the seeded candidate is in view.
    const firstReq = authenticatedPage
      .locator('[data-testid^="requirement-row-"]')
      .first();
    await expect(firstReq).toBeVisible({ timeout: 10_000 });
    await firstReq.click();

    // Open the detail modal via the test-only event hook. Production code
    // path (Leaflet popup button → `onOpenDetailModal`) is identical; the
    // event simply skips the asynchronous Leaflet marker DOM that is hard to
    // target deterministically in CI.
    await authenticatedPage.evaluate((id) => {
      window.dispatchEvent(
        new CustomEvent("ohw:open-detail-modal", { detail: { id } }),
      );
    }, SEEDED_LOCATION_CANDIDATE_1_ID);

    const modal = authenticatedPage.getByTestId("location-detail-modal");
    await expect(modal).toBeVisible({ timeout: 5_000 });

    // Photos grid renders the two seeded photos for candidate 1.
    await expect(
      authenticatedPage.getByTestId("detail-modal-photos"),
    ).toBeVisible();
    await expect(
      authenticatedPage.locator('[data-testid^="detail-modal-photo-"]'),
    ).toHaveCount(2);

    // Status badge reflects the seed.
    await expect(
      authenticatedPage.getByTestId("detail-modal-status-badge"),
    ).toBeVisible();
  });

  test("[OHW-586] Photo lightbox: clicking a photo opens the lightbox, ESC closes it", async ({
    authenticatedPage,
  }) => {
    await navigateToLocations(authenticatedPage, LOCATIONS_PROJECT_ID);

    const firstReq = authenticatedPage
      .locator('[data-testid^="requirement-row-"]')
      .first();
    await firstReq.click();

    // Open the detail modal via the same event hook.
    await authenticatedPage.evaluate((id) => {
      window.dispatchEvent(
        new CustomEvent("ohw:open-detail-modal", { detail: { id } }),
      );
    }, SEEDED_LOCATION_CANDIDATE_1_ID);

    await expect(
      authenticatedPage.getByTestId("location-detail-modal"),
    ).toBeVisible({ timeout: 5_000 });

    // Click the first photo
    await authenticatedPage.getByTestId("detail-modal-photo-0").click();

    const lightbox = authenticatedPage.getByTestId("photo-lightbox");
    await expect(lightbox).toBeVisible();

    // ESC closes
    await authenticatedPage.keyboard.press("Escape");
    await expect(lightbox).not.toBeVisible();
  });

  test("[OHW-587] Area search: draw a circle, search returns mocked results, 'Aggiungi' creates a candidate", async ({
    authenticatedPage,
  }) => {
    await navigateToLocations(authenticatedPage, LOCATIONS_PROJECT_ID);

    // Stub the upstream Google Places fetch — the server fn forwards the
    // request as-is, so intercepting at this URL is enough.
    await authenticatedPage.route(
      "https://places.googleapis.com/v1/places:searchNearby",
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            places: [
              {
                id: "place_mock_1",
                displayName: { text: "Trattoria del Cerchio" },
                formattedAddress: "Via del Test 1, Milano",
                location: { latitude: 45.46, longitude: 9.19 },
                types: ["restaurant"],
                photos: [],
              },
              {
                id: "place_mock_2",
                displayName: { text: "Bar Centrale" },
                formattedAddress: "Via del Test 2, Milano",
                location: { latitude: 45.461, longitude: 9.191 },
                types: ["bar"],
                photos: [],
              },
            ],
          }),
        });
      },
    );

    const firstReq = authenticatedPage
      .locator('[data-testid^="requirement-row-"]')
      .first();
    await firstReq.click();

    const cardsBefore = await authenticatedPage
      .locator('[data-testid^="candidate-card-"]')
      .count();

    // Simulate the Leaflet draw event programmatically — same payload the
    // map's drawcreated handler emits.
    await authenticatedPage.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent("ohw:test-draw-circle", {
          detail: { lat: 45.46, lng: 9.19, radius_m: 2000 },
        }),
      );
    });

    const panel = authenticatedPage.getByTestId("area-search-panel");
    await expect(panel).toBeVisible({ timeout: 5_000 });

    await authenticatedPage.getByTestId("area-search-go-btn").click();

    const results = authenticatedPage.getByTestId("area-search-results");
    await expect(results).toBeVisible({ timeout: 10_000 });

    const addBtn = authenticatedPage.getByTestId(
      "area-search-add-place_mock_1",
    );
    await expect(addBtn).toBeVisible();
    await addBtn.click();

    // The candidate count grows by one in the panel (TanStack invalidates).
    await expect
      .poll(
        async () =>
          authenticatedPage.locator('[data-testid^="candidate-card-"]').count(),
        { timeout: 10_000 },
      )
      .toBeGreaterThan(cardsBefore);
  });
});
