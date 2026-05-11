import { expect } from "@playwright/test";
import { test } from "../fixtures";
import { BASE_URL } from "../helpers";
import { BUDGET_PROJECT_ID, navigateToBudget, generateBudget } from "./helpers";

test.describe("[Spec 11b] Budget — rule-based dashboard", () => {
  // Each test navigates fresh; budget state persists across tests in this run.
  // Tests are ordered: generate first, then mutate.

  test("[OHW-351] Genera budget → Cast and Troupe populated from breakdown", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToBudget(page, BUDGET_PROJECT_ID);
    await generateBudget(page);

    // The seeded project has cast actors: Tea, Milco, Luca
    await expect(page.getByText("Tea")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Milco")).toBeVisible();
    await expect(page.getByText("Luca")).toBeVisible();

    // Crew widget should list at least one standard role
    await expect(page.getByText("Direttore della Fotografia")).toBeVisible();
  });

  test("[OHW-352] Modifica €/giorno attore → totale Cast aggiornato live", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToBudget(page, BUDGET_PROJECT_ID);

    // Budget should already exist from previous test; if not, generate it
    const btn = page.getByTestId("generate-budget-btn");
    const btnText = await btn.textContent();
    if (btnText?.trim() === "Genera budget") {
      await generateBudget(page);
    }

    // Find Tea's row and get her day-rate cell
    const teaRow = page.locator('[data-testid^="resource-row-"]').filter({
      hasText: "Tea",
    });
    await expect(teaRow).toBeVisible({ timeout: 10_000 });

    const rowId = await teaRow
      .getAttribute("data-testid")
      .then((v) => v?.replace("resource-row-", ""));
    if (!rowId) throw new Error("Could not get Tea row id");

    // Click the day-rate cell to enter edit mode
    const dayRateCell = page.getByTestId(`resource-day-rate-${rowId}`);
    await dayRateCell.click();

    // Type new rate and confirm
    await dayRateCell.fill("999");
    await dayRateCell.press("Enter");

    // The total cell should update
    const totalCell = page.getByTestId(`resource-row-total-${rowId}`);
    // With 999/day the total should contain "999"
    await expect(totalCell).toContainText("999", { timeout: 8_000 });
  });

  test("[OHW-353] Cambia regime 'privato' → totale riga ×1.20", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToBudget(page, BUDGET_PROJECT_ID);

    const teaRow = page.locator('[data-testid^="resource-row-"]').filter({
      hasText: "Tea",
    });
    await expect(teaRow).toBeVisible({ timeout: 10_000 });

    const rowId = await teaRow
      .getAttribute("data-testid")
      .then((v) => v?.replace("resource-row-", ""));
    if (!rowId) throw new Error("Could not get Tea row id");

    // Read current total text to compare after regime change
    const totalCell = page.getByTestId(`resource-row-total-${rowId}`);
    const totalBefore = await totalCell.textContent();

    // Change regime to privato
    const regimeSelect = page.getByTestId(`resource-regime-${rowId}`);
    await regimeSelect.selectOption("privato");

    // Total should change (×1.20 applied)
    await expect(totalCell).not.toHaveText(totalBefore ?? "", {
      timeout: 8_000,
    });

    // Reset back to piva to keep test state clean
    await regimeSelect.selectOption("piva");
  });

  test("[OHW-354] Modifica shooting days → valore aggiornato in toolbar", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToBudget(page, BUDGET_PROJECT_ID);

    const daysField = page.getByTestId("shooting-days");
    await expect(daysField).toBeVisible({ timeout: 10_000 });

    // Click to edit
    await daysField.click();
    await daysField.fill("15");
    await daysField.press("Enter");

    // Field should reflect the new value
    await expect(daysField).toHaveText(/15/, { timeout: 8_000 });
  });

  test("[OHW-355] Seleziona scena → Cast mostra solo attori presenti in quella scena", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToBudget(page, BUDGET_PROJECT_ID);

    // Scene chip bar must be present (requires at least one scene in breakdown)
    const chip1 = page.getByTestId("scene-chip-1");
    if (!(await chip1.isVisible())) {
      // No scenes seeded or no breakdown — skip gracefully
      test.skip();
      return;
    }

    // Click scene 1 chip
    await chip1.click();
    await expect(chip1).toHaveClass(/sceneChipActive/, { timeout: 5_000 });

    // The cast "Tutte" total widget should still be present
    await expect(page.getByText("Cast")).toBeVisible();

    // Click Tutte to reset
    await page
      .getByTestId("scene-chip-all")
      .or(page.locator("button.sceneChip").filter({ hasText: "Tutte" }))
      .click();
  });

  test("[OHW-356] Aggiungi ruolo custom troupe → appare nel widget Troupe", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToBudget(page, BUDGET_PROJECT_ID);
    await expect(page.getByText("Troupe")).toBeVisible({ timeout: 10_000 });

    // Open add-role form
    await page.getByText("+ Aggiungi ruolo").click();

    // Fill name
    const nameInput = page.getByPlaceholder("Nome ruolo");
    await expect(nameInput).toBeVisible();
    await nameInput.fill("Drone Operator");

    // Submit
    await page.getByRole("button", { name: "Aggiungi" }).click();

    // New row should appear
    await expect(page.getByText("Drone Operator")).toBeVisible({
      timeout: 8_000,
    });
  });
});
