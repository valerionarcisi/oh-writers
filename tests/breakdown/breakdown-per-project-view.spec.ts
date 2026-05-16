import { expect } from "@playwright/test";
import { test } from "../fixtures";
import { navigateToBreakdown, TEAM_PROJECT_ID } from "./helpers";

/**
 * [Spec 10 — Per-project view]
 *
 * The ProjectBreakdownView tab was introduced in spec 10j (per-project
 * breakdown). It renders a KPI strip, category-grouped accordion table,
 * filter toolbar, and a bulk action bar. None of those UI surfaces had
 * dedicated E2E coverage before this file.
 */

test.describe("[Spec 10j] Breakdown — per-project view", () => {
  test("[OHW-400] Switching to 'Per progetto' renders the project breakdown table", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToBreakdown(page, TEAM_PROJECT_ID);

    // The SegmentedControl renders data-testid="segmented-per-project"
    const perProjectTab = page.getByTestId("segmented-per-project");
    await expect(perProjectTab).toBeVisible({ timeout: 10_000 });
    await perProjectTab.click();

    // ProjectBreakdownView root has data-testid="project-breakdown-table"
    await expect(page.getByTestId("project-breakdown-table")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("[OHW-401] Per-progetto KPI strip shows 'Elementi totali' and 'Confermati'", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToBreakdown(page, TEAM_PROJECT_ID);

    await page.getByTestId("segmented-per-project").click();
    await expect(page.getByTestId("project-breakdown-table")).toBeVisible({
      timeout: 10_000,
    });

    // The KPI strip section has aria-label="Riepilogo spoglio"
    const kpis = page.getByRole("region", { name: "Riepilogo spoglio" });
    await expect(kpis).toBeVisible();

    // KPI labels are always rendered regardless of data
    await expect(kpis.getByText("Elementi totali")).toBeVisible();
    await expect(kpis.getByText("Confermati")).toBeVisible();
    await expect(kpis.getByText("In sospeso")).toBeVisible();
    await expect(kpis.getByText("Obsoleti")).toBeVisible();
  });

  test("[OHW-402] Per-progetto category group expands and shows table rows", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToBreakdown(page, TEAM_PROJECT_ID);

    await page.getByTestId("segmented-per-project").click();
    await expect(page.getByTestId("project-breakdown-table")).toBeVisible({
      timeout: 10_000,
    });

    // The seeded project has cast elements — find the cast group
    const castGroup = page.getByTestId("breakdown-group-cast");
    if (!(await castGroup.isVisible())) {
      // No cast elements in this seed — check for any group
      const firstGroup = page
        .locator('[data-testid^="breakdown-group-"]')
        .first();
      if (!(await firstGroup.isVisible())) {
        test.skip();
        return;
      }
      const groupHead = firstGroup.getByRole("button").first();
      await groupHead.click();
      // After clicking, at least one table row should appear
      await expect(firstGroup.locator("tbody tr").first()).toBeVisible({
        timeout: 5_000,
      });
      return;
    }

    // Cast group head is a button with aria-expanded
    const castHead = castGroup.getByRole("button").first();
    const isAlreadyOpen =
      (await castHead.getAttribute("aria-expanded")) === "true";

    if (!isAlreadyOpen) {
      await castHead.click();
    }

    // After expanding, table rows should be visible
    await expect(castGroup.locator("tbody tr").first()).toBeVisible({
      timeout: 5_000,
    });
  });

  test("[OHW-403] Per-progetto search filter narrows visible rows", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToBreakdown(page, TEAM_PROJECT_ID);

    await page.getByTestId("segmented-per-project").click();
    await expect(page.getByTestId("project-breakdown-table")).toBeVisible({
      timeout: 10_000,
    });

    // Expand all groups to get a baseline row count
    const groups = page.locator('[data-testid^="breakdown-group-"]');
    const groupCount = await groups.count();
    for (let i = 0; i < groupCount; i++) {
      const head = groups.nth(i).getByRole("button").first();
      const expanded = await head.getAttribute("aria-expanded");
      if (expanded !== "true") {
        await head.click();
      }
    }

    const rowsBefore = await page.locator("tbody tr").count();

    // Type a search query unlikely to match all elements
    const searchInput = page.getByTestId("breakdown-view-search");
    await expect(searchInput).toBeVisible();
    await searchInput.fill("ZZZNOTPOSSIBLE");

    // Wait for the deferred filter to apply
    await page.waitForTimeout(300);

    // All groups should be gone (empty state) or row count should be 0
    const rowsAfter = await page.locator("tbody tr").count();
    expect(rowsAfter).toBeLessThan(rowsBefore);

    // Clear search and verify rows come back
    await searchInput.fill("");
    await page.waitForTimeout(300);
    const rowsRestored = await page.locator("tbody tr").count();
    expect(rowsRestored).toBeGreaterThanOrEqual(rowsBefore);
  });

  test("[OHW-404] Status filter dropdown is present and changes the select value", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToBreakdown(page, TEAM_PROJECT_ID);

    await page.getByTestId("segmented-per-project").click();
    await expect(page.getByTestId("project-breakdown-table")).toBeVisible({
      timeout: 10_000,
    });

    const statusFilter = page.getByTestId("breakdown-status-filter");
    await expect(statusFilter).toBeVisible();
    await expect(statusFilter).toHaveValue("all");

    await statusFilter.selectOption("pending");
    await expect(statusFilter).toHaveValue("pending");

    // Reset
    await statusFilter.selectOption("all");
  });

  test("[OHW-405] Switching back to 'Per scena' hides the project breakdown table", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToBreakdown(page, TEAM_PROJECT_ID);

    // Switch to per-project
    await page.getByTestId("segmented-per-project").click();
    await expect(page.getByTestId("project-breakdown-table")).toBeVisible({
      timeout: 10_000,
    });

    // Switch back to per-scene
    await page.getByTestId("segmented-per-scene").click();

    // Project breakdown table must be gone
    await expect(page.getByTestId("project-breakdown-table")).not.toBeVisible({
      timeout: 5_000,
    });

    // The original per-scene view should be visible
    await expect(page.getByTestId("breakdown-page-v2")).toBeVisible();
  });
});
