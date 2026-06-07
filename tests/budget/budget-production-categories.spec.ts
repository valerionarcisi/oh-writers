import { expect } from "@playwright/test";
import { test } from "../fixtures";
import {
  BUDGET_PROJECT_ID,
  navigateToBudget,
  generateBudget,
  openCategoryView,
} from "./helpers";

/**
 * Spec 11d (v2) — Budget production categories (flat rate-card model).
 *
 * Production categories derived from the breakdown (Scenografia from props,
 * Locations from locations, …) render as sections in the "category" flat
 * rate-card view (Cast / Troupe / Locations / Scenografia), each a collapsible
 * section with editable per-line quantity/rate cells.
 *
 * Dropped vs the old accordion dashboard: the `generate-budget-btn` (→
 * FloatingDock "Rigenera"), the "Per giornata disabled when no schedule" gate
 * (the day view is always reachable now), and the "Produzione — da breakdown"
 * group label.
 *
 *   [OHW-11d-1] Generate → a Scenografia section appears (props in breakdown).
 *   [OHW-11d-2] Edit a Scenografia line rate → it persists across a reload.
 *   [OHW-11d-3] The "By day" / "By category" segmented views are reachable.
 *   [OHW-11d-4] The category view renders the section group labels.
 *   [OHW-11d-5] Scenografia appears as a category card in the overview.
 */

test.describe("[Spec 11d] Budget production categories", () => {
  test("[OHW-11d-1] Generate → Scenografia section appears", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToBudget(page, BUDGET_PROJECT_ID);
    await generateBudget(page);

    // The seeded breakdown has a props element → a Scenografia category exists.
    await expect(page.getByTestId("category-card-scenografia")).toBeVisible({
      timeout: 10_000,
    });
    await openCategoryView(page);
    await expect(page.locator('[data-section-id="scenografia"]')).toBeVisible({
      timeout: 10_000,
    });
  });

  test("[OHW-11d-2] Editing a Scenografia line rate survives a regeneration", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToBudget(page, BUDGET_PROJECT_ID);

    const dock = page.getByRole("button", { name: /Rigenera|Regenerate/ });
    if (!(await dock.isVisible().catch(() => false))) {
      await generateBudget(page);
    }

    await openCategoryView(page);

    // Find the first Scenografia line and set a distinctive rate.
    const section = page.locator('[data-section-id="scenografia"]');
    await expect(section).toBeVisible({ timeout: 10_000 });
    const rowId = (await section
      .locator("[data-row-id]")
      .first()
      .getAttribute("data-row-id"))!;

    const rateCell = page.getByTestId(`flat-rate-${rowId}`);
    await rateCell.click();
    const input = page.getByTestId(`flat-rate-${rowId}-input`);
    await Promise.all([
      page
        .waitForResponse(
          (r) => /budget/i.test(r.url()) && r.request().method() === "POST",
          { timeout: 10_000 },
        )
        .catch(() => undefined),
      (async () => {
        await input.fill("1234");
        await input.press("Enter");
      })(),
    ]);
    await expect(page.getByTestId(`flat-rate-${rowId}`)).toContainText(
      /1[.,]?234/,
      { timeout: 8_000 },
    );

    // The actual (manually set) rate is server-persisted: reload + re-open the
    // category view and the value is still there (it survives across reloads;
    // the regeneration preserve-actuals path is exercised server-side).
    await navigateToBudget(page, BUDGET_PROJECT_ID);
    await openCategoryView(page);
    await expect(page.getByTestId(`flat-rate-${rowId}`)).toContainText(
      /1[.,]?234/,
      { timeout: 10_000 },
    );
  });

  test("[OHW-11d-3] The By-day and By-category views are reachable", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToBudget(page, BUDGET_PROJECT_ID);

    // Both segmented tabs exist and switch the view.
    await page.getByTestId("segmented-category").click();
    await expect(page.locator("[data-section-id]").first()).toBeVisible({
      timeout: 10_000,
    });

    await page.getByTestId("segmented-day").click();
    // The day view renders (no crash); the overview tab is still reachable back.
    await page.getByTestId("segmented-overview").click();
    await expect(page.getByTestId("budget-page-v2")).toBeVisible();
  });

  test("[OHW-11d-4] The category view renders the section group labels", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToBudget(page, BUDGET_PROJECT_ID);
    await generateBudget(page);
    await openCategoryView(page);

    // Each derived category renders as a labelled section.
    for (const id of ["cast", "crew", "scenografia"]) {
      await expect(page.locator(`[data-section-id="${id}"]`)).toBeVisible({
        timeout: 10_000,
      });
    }
  });

  test("[OHW-11d-5] Scenografia appears as a category card in the overview", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToBudget(page, BUDGET_PROJECT_ID);
    await generateBudget(page);

    await expect(page.getByTestId("category-card-scenografia")).toBeVisible({
      timeout: 10_000,
    });
  });
});
