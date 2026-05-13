import { expect } from "@playwright/test";
import { test } from "../fixtures";
import { BUDGET_PROJECT_ID, navigateToBudget, generateBudget } from "./helpers";

test.describe("[Spec 11d] Budget production categories", () => {
  test("[OHW-11d-1] Genera budget → Scenografia accordion appears when breakdown has props elements", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToBudget(page, BUDGET_PROJECT_ID);
    await generateBudget(page);

    // The seeded breakdown has a "Bloody knife" props element — Scenografia section must appear
    await expect(page.getByText("Scenografia")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("[OHW-11d-2] Rigenera preserves actual values — Scenografia rate survives regeneration", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToBudget(page, BUDGET_PROJECT_ID);

    // Ensure budget exists
    const btn = page.getByTestId("generate-budget-btn");
    if ((await btn.textContent())?.trim() === "Genera budget") {
      await generateBudget(page);
    }

    // Expand Scenografia accordion
    await page.getByText("Scenografia").click();

    // Click the Tariffa button to enter edit mode — first numeric button in the body
    const rateBtn = page
      .getByRole("button")
      .filter({ hasText: /^[€0-9]/ })
      .first();
    await rateBtn.click();

    // Set a distinctive rate value
    const input = page.getByRole("spinbutton").first();
    await input.fill("1234");
    await input.press("Enter");

    // Wait for save
    await expect(
      page
        .getByRole("button")
        .filter({ hasText: /1\.234/ })
        .first(),
    ).toBeVisible({ timeout: 8_000 });

    // Rigenera
    await page.getByTestId("generate-budget-btn").click();
    await expect(btn).toHaveText("Rigenera", { timeout: 20_000 });

    // Re-open Scenografia
    await page.getByText("Scenografia").click();

    // Rate should still be 1234
    await expect(
      page
        .getByRole("button")
        .filter({ hasText: /1\.234/ })
        .first(),
    ).toBeVisible({ timeout: 8_000 });
  });

  test("[OHW-11d-3] View toggle Per giornata is disabled when no schedule exists", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToBudget(page, BUDGET_PROJECT_ID);

    const dayToggle = page.getByRole("button", { name: "Per giornata" });
    await expect(dayToggle).toBeVisible({ timeout: 10_000 });
    await expect(dayToggle).toBeDisabled();
  });

  test("[OHW-11d-4] Per categoria toggle renders category group labels", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToBudget(page, BUDGET_PROJECT_ID);
    await generateBudget(page);

    // Per categoria is default view — group label should be visible
    await expect(page.getByText("Produzione — da breakdown")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("[OHW-11d-5] TotalWidget shows per-category production lines after generation", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToBudget(page, BUDGET_PROJECT_ID);
    await generateBudget(page);

    // The sidebar total widget should show Scenografia as a line item
    await expect(page.getByText("Scenografia")).toBeVisible({
      timeout: 10_000,
    });
  });
});
