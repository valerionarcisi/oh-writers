import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { test } from "../fixtures";
import { BUDGET_PROJECT_ID, navigateToBudget, generateBudget } from "./helpers";

// Spec 67: Export moved off the FloatingDock into the TopBar `⋯` ("Altre azioni")
// menu. Open the menu and click "Esporta" to launch the export modal.
const openExportModal = async (page: Page) => {
  await page.getByLabel("Altre azioni").click();
  await page.getByRole("menuitem", { name: "Esporta" }).click();
};

test.describe("[Spec 11b] Budget — export (PDF + CSV)", () => {
  // ─── OHW-390 ─────────────────────────────────────────────────────────────────

  test("[OHW-390] Budget exposes Esporta in the TopBar ⋯ menu", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToBudget(page, BUDGET_PROJECT_ID);

    await page.getByLabel("Altre azioni").click();
    await expect(page.getByRole("menuitem", { name: "Esporta" })).toBeVisible({
      timeout: 10_000,
    });
  });

  // ─── OHW-391 ─────────────────────────────────────────────────────────────────

  test("[OHW-391] Clicking Esporta → export modal appears with PDF and CSV options", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToBudget(page, BUDGET_PROJECT_ID);

    await openExportModal(page);

    // Modal title must be present
    await expect(
      page.getByRole("heading", { name: "Esporta budget" }),
    ).toBeVisible({ timeout: 8_000 });

    // Format selector exposes both PDF and CSV options
    const formatSelect = page.getByTestId("budget-export-format");
    await expect(formatSelect).toBeVisible();
    await expect(formatSelect.locator("option[value='pdf']")).toHaveText("PDF");
    await expect(formatSelect.locator("option[value='csv']")).toHaveText("CSV");
  });

  // ─── OHW-392 ─────────────────────────────────────────────────────────────────

  test("[OHW-392] Clicking Esporta PDF → PDF preview opens in new tab", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToBudget(page, BUDGET_PROJECT_ID);
    await generateBudget(page);

    await openExportModal(page);

    const formatSelect = page.getByTestId("budget-export-format");
    await formatSelect.selectOption("pdf");

    // PDF opens a blob URL in a new browser tab
    // Intercept window.open so we can capture the blob URL without relying on
    // Playwright's page event (blob: navigations bypass the browser's network
    // stack and may not fire a page event in Chromium).
    await page.evaluate(() => {
      const w = window as Window & { __openedUrl?: string };
      const orig = window.open.bind(window);
      window.open = (...args) => {
        w.__openedUrl = String(args[0]);
        return orig(...args);
      };
    });

    await page.getByTestId("budget-export-generate").click();

    // Wait for the mutation to complete and window.open to be called.
    await page.waitForFunction(
      () => !!(window as Window & { __openedUrl?: string }).__openedUrl,
      { timeout: 10_000 },
    );
    const openedUrl = await page.evaluate(
      () => (window as Window & { __openedUrl?: string }).__openedUrl ?? "",
    );
    expect(openedUrl).toMatch(/blob:/);
  });

  // ─── OHW-393 ─────────────────────────────────────────────────────────────────

  test("[OHW-393] Clicking Esporta CSV → CSV file downloaded, filename matches *-budget-*.csv", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToBudget(page, BUDGET_PROJECT_ID);
    await generateBudget(page);

    await openExportModal(page);

    const formatSelect = page.getByTestId("budget-export-format");
    await formatSelect.selectOption("csv");

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("budget-export-generate").click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/budget.*\.csv$/);
  });

  // ─── OHW-394 ─────────────────────────────────────────────────────────────────

  test("[OHW-394] CSV contains expected column headers: Category, Line Item, Amount", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToBudget(page, BUDGET_PROJECT_ID);
    await generateBudget(page);

    await openExportModal(page);

    const formatSelect = page.getByTestId("budget-export-format");
    await formatSelect.selectOption("csv");

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("budget-export-generate").click(),
    ]);

    const filePath = await download.path();
    if (!filePath) throw new Error("Download path is null — file not saved");

    const { readFile } = await import("node:fs/promises");
    const content = await readFile(filePath, "utf-8");

    // First line is the header row
    const headerLine = content.split("\n")[0] ?? "";
    expect(headerLine).toContain("Category");
    expect(headerLine).toContain("Line Item");
    expect(headerLine).toMatch(/Amount/);
  });

  // ─── OHW-395 ─────────────────────────────────────────────────────────────────

  test("[OHW-395] Export with no budget generated → CSV download still works (empty rows)", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    // Navigate directly without calling generateBudget — budget row may or may
    // not exist depending on test order.  The server gracefully returns an
    // empty CSV when there are no budget lines, so clicking Genera must not
    // throw an error and the Genera button must not be disabled.
    await navigateToBudget(page, BUDGET_PROJECT_ID);

    await openExportModal(page);

    await expect(
      page.getByRole("heading", { name: "Esporta budget" }),
    ).toBeVisible({ timeout: 8_000 });

    const formatSelect = page.getByTestId("budget-export-format");
    await formatSelect.selectOption("csv");

    const generateBtn = page.getByTestId("budget-export-generate");
    await expect(generateBtn).toBeEnabled();

    // Trigger the download — server returns empty CSV (header + TOTAL row only)
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      generateBtn.click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/\.csv$/);

    const filePath = await download.path();
    if (!filePath) throw new Error("Download path is null — file not saved");

    const { readFile } = await import("node:fs/promises");
    const content = await readFile(filePath, "utf-8");

    // Must at minimum contain the header row — no crash, no empty file
    expect(content).toContain("Category");
  });

  // ─── OHW-396 ─────────────────────────────────────────────────────────────────

  test("[OHW-396] Viewer can export budget (read action)", async ({
    authenticatedViewerPage,
  }) => {
    const page = authenticatedViewerPage;
    await navigateToBudget(page, BUDGET_PROJECT_ID);

    // Viewer has view-only access; Esporta is a read action and must be available
    // in the ⋯ menu.
    await page.getByLabel("Altre azioni").click();
    const esportaItem = page.getByRole("menuitem", { name: "Esporta" });
    await expect(esportaItem).toBeVisible({ timeout: 10_000 });
    await esportaItem.click();
    await expect(
      page.getByRole("heading", { name: "Esporta budget" }),
    ).toBeVisible({ timeout: 8_000 });

    const formatSelect = page.getByTestId("budget-export-format");
    await formatSelect.selectOption("csv");

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("budget-export-generate").click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/\.csv$/);
  });
});
