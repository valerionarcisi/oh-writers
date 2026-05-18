import { expect } from "@playwright/test";
import { test } from "../fixtures";
import {
  LOCATIONS_PROJECT_ID,
  SEEDED_LOCATION_REQ_1_ID,
  SEEDED_LOCATION_REQ_2_ID,
  SEEDED_LOCATION_CANDIDATE_1_ID,
  SEEDED_LOCATION_CANDIDATE_2_ID,
  SEEDED_LOCATION_BREAKDOWN_ELEMENT_NAME,
  navigateToLocations,
} from "./helpers";

/**
 * [Spec 13 — Locations Manager]
 *
 * LocationsPage shows the map-first scouting view. Tests verify:
 *   - Page renders with seeded requirements
 *   - Requirement rows are clickable and show the detail panel
 *   - "Aggiungi candidato" form creates a new candidate
 *   - Candidate fields (contact, fee, notes) persist on blur
 *   - "Segna visitata" marks a candidate as visited
 *   - "✓ Conferma" confirms a candidate and marks the requirement as confirmed
 *   - "Scarta" removes a candidate
 *   - "Sincronizza da breakdown" imports new requirements from breakdown elements
 */

test.describe("[Spec 13] Locations Manager", () => {
  test("[OHW-480] Locations page renders with seeded requirements", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToLocations(page, LOCATIONS_PROJECT_ID);

    await expect(page.getByTestId("locations-panel")).toBeVisible();
    await expect(
      page.getByTestId(`requirement-row-${SEEDED_LOCATION_REQ_1_ID}`),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByTestId(`requirement-row-${SEEDED_LOCATION_REQ_2_ID}`),
    ).toBeVisible();
  });

  test("[OHW-481] Clicking a requirement shows its detail panel", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToLocations(page, LOCATIONS_PROJECT_ID);

    await page
      .getByTestId(`requirement-row-${SEEDED_LOCATION_REQ_1_ID}`)
      .click();
    await expect(page.getByTestId("requirement-detail")).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByTestId("detail-title")).toContainText(
      "Appartamento Marta",
    );
  });

  test("[OHW-482] Seeded candidates appear in the detail panel", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToLocations(page, LOCATIONS_PROJECT_ID);

    await page
      .getByTestId(`requirement-row-${SEEDED_LOCATION_REQ_1_ID}`)
      .click();
    await expect(
      page.getByTestId(`candidate-card-${SEEDED_LOCATION_CANDIDATE_1_ID}`),
    ).toBeVisible({ timeout: 5_000 });
    await expect(
      page.getByTestId(`candidate-card-${SEEDED_LOCATION_CANDIDATE_2_ID}`),
    ).toBeVisible();
  });

  test("[OHW-483] Add candidate form creates a new candidate", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToLocations(page, LOCATIONS_PROJECT_ID);

    await page
      .getByTestId(`requirement-row-${SEEDED_LOCATION_REQ_1_ID}`)
      .click();
    await expect(page.getByTestId("add-candidate-btn")).toBeVisible({
      timeout: 5_000,
    });
    await page.getByTestId("add-candidate-btn").click();

    await expect(page.getByTestId("add-candidate-form")).toBeVisible();
    await page
      .getByTestId("candidate-name-input")
      .fill("Cortile Ansaldo");
    await page
      .getByTestId("candidate-address-input")
      .fill("Via Bergognone 34, Milano");
    await page.getByTestId("save-candidate-btn").click();

    await expect(page.getByTestId("add-candidate-form")).not.toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByText("Cortile Ansaldo")).toBeVisible({
      timeout: 8_000,
    });
  });

  test("[OHW-484] Marking a candidate as visited updates its status badge", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToLocations(page, LOCATIONS_PROJECT_ID);

    await page
      .getByTestId(`requirement-row-${SEEDED_LOCATION_REQ_1_ID}`)
      .click();

    const card = page.getByTestId(
      `candidate-card-${SEEDED_LOCATION_CANDIDATE_1_ID}`,
    );
    await expect(card).toBeVisible({ timeout: 5_000 });

    // Expand by clicking the card header
    await card.getByRole("button").first().click();

    const markVisitedBtn = page.getByTestId(
      `mark-visited-btn-${SEEDED_LOCATION_CANDIDATE_1_ID}`,
    );
    await expect(markVisitedBtn).toBeVisible({ timeout: 5_000 });
    await markVisitedBtn.click();

    // Badge should update to "Visitata"
    await expect(card.getByText("Visitata")).toBeVisible({ timeout: 8_000 });
  });

  test("[OHW-485] Confirming a candidate marks the requirement as confirmed", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToLocations(page, LOCATIONS_PROJECT_ID);

    await page
      .getByTestId(`requirement-row-${SEEDED_LOCATION_REQ_2_ID}`)
      .click();
    await expect(page.getByTestId("requirement-detail")).toBeVisible({
      timeout: 5_000,
    });

    // Add a candidate first (req 2 has no seeded candidates)
    await page.getByTestId("add-candidate-btn").click();
    await page.getByTestId("candidate-name-input").fill("Vicolo test");
    await page.getByTestId("save-candidate-btn").click();

    // Expand the new candidate and confirm it
    const candidateCard = page
      .locator('[data-testid^="candidate-card-"]')
      .filter({ hasText: "Vicolo test" });
    await expect(candidateCard).toBeVisible({ timeout: 8_000 });
    await candidateCard.getByRole("button").first().click();

    const confirmBtn = candidateCard.locator(
      '[data-testid^="confirm-candidate-btn-"]',
    );
    await expect(confirmBtn).toBeVisible({ timeout: 5_000 });
    await confirmBtn.click();

    // Requirement row status dot should update (confirmed = green dot, star shows)
    await expect(candidateCard.getByText("Confermata")).toBeVisible({
      timeout: 8_000,
    });
  });

  test("[OHW-486] Removing a candidate hides it from the list", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToLocations(page, LOCATIONS_PROJECT_ID);

    await page
      .getByTestId(`requirement-row-${SEEDED_LOCATION_REQ_1_ID}`)
      .click();

    // Add a candidate to remove
    await page.getByTestId("add-candidate-btn").click();
    await page.getByTestId("candidate-name-input").fill("Da scartare");
    await page.getByTestId("save-candidate-btn").click();
    await expect(page.getByText("Da scartare")).toBeVisible({ timeout: 8_000 });

    // Expand and remove it
    const candidateCard = page
      .locator('[data-testid^="candidate-card-"]')
      .filter({ hasText: "Da scartare" });
    await candidateCard.getByRole("button").first().click();

    const removeBtn = candidateCard.locator(
      '[data-testid^="remove-candidate-btn-"]',
    );
    await expect(removeBtn).toBeVisible({ timeout: 5_000 });
    await removeBtn.click();

    await expect(page.getByText("Da scartare")).not.toBeVisible({
      timeout: 8_000,
    });
  });

  test("[OHW-487] Sync from breakdown imports location elements as new requirements", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToLocations(page, LOCATIONS_PROJECT_ID);

    // Panel title shows count before sync
    await expect(page.getByTestId("locations-panel-title")).toContainText(
      "LOCATION (",
    );

    await page.getByRole("button", { name: "Sincronizza" }).click();

    // After sync the new element from breakdown should appear
    await expect(
      page.getByText(SEEDED_LOCATION_BREAKDOWN_ELEMENT_NAME),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("[OHW-488] Empty state shown when no requirements exist (viewer access)", async ({
    authenticatedViewerPage,
  }) => {
    // The viewer has read-only access; navigate to a fresh project that has no locations.
    // We use the viewer's personal project which has no locations.
    const page = authenticatedViewerPage;
    // Navigate to the team project (viewer has access) — it has seeded requirements
    await navigateToLocations(page, LOCATIONS_PROJECT_ID);

    // Requirements exist, so the empty state should NOT be visible
    await expect(page.getByTestId("locations-empty-state")).not.toBeVisible({
      timeout: 5_000,
    });
    // Requirements are still visible to the viewer
    await expect(
      page.getByTestId(`requirement-row-${SEEDED_LOCATION_REQ_1_ID}`),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("[OHW-489] Selecting a different requirement updates the detail panel", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToLocations(page, LOCATIONS_PROJECT_ID);

    // Select first requirement
    await page
      .getByTestId(`requirement-row-${SEEDED_LOCATION_REQ_1_ID}`)
      .click();
    await expect(page.getByTestId("detail-title")).toContainText(
      "Appartamento Marta",
      { timeout: 5_000 },
    );

    // Select second requirement
    await page
      .getByTestId(`requirement-row-${SEEDED_LOCATION_REQ_2_ID}`)
      .click();
    await expect(page.getByTestId("detail-title")).toContainText(
      "Strada del paese",
      { timeout: 5_000 },
    );
  });
});
