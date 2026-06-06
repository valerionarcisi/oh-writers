/**
 * Spec — Shooting Plan Export (CSV + PDF shot list)
 *
 * [OHW-400] Shooting plan page has an "Esporta" button visible in the dock
 * [OHW-401] Both export actions (CSV via "Esporta", PDF via "Stampa") are
 *           visible in the dock without any additional click
 * [OHW-402] Clicking "Stampa" triggers a PDF download with a .pdf filename
 * [OHW-403] Clicking "Esporta" triggers a CSV download matching *-shot-list-*.csv
 * [OHW-404] "Stampa" downloads a PDF — server response carries a valid base64 PDF
 * [OHW-405] Export on a project with no planned shots completes without error
 * [OHW-406] Viewer on team project can trigger CSV export (read-only action)
 */

import { test, expect, TEST_TEAM_PROJECT_ID } from "../fixtures";
import { SHOOTING_PLAN_PROJECT_ID, navigateToShootingPlan } from "./helpers";

test.describe("Shooting Plan Export", () => {
  test("[OHW-400] 'Esporta' button is visible in the dock", async ({
    authenticatedPage: page,
  }) => {
    await navigateToShootingPlan(page, SHOOTING_PLAN_PROJECT_ID);

    const exportBtn = page.getByTestId("export-csv-btn");
    await expect(exportBtn).toBeVisible({ timeout: 15_000 });
  });

  test("[OHW-401] Both 'Esporta' (CSV) and 'Stampa' (PDF) buttons are visible without extra clicks", async ({
    authenticatedPage: page,
  }) => {
    await navigateToShootingPlan(page, SHOOTING_PLAN_PROJECT_ID);

    await expect(page.getByTestId("export-csv-btn")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("export-pdf-btn")).toBeVisible({
      timeout: 5_000,
    });
  });

  test("[OHW-402] 'Stampa' triggers a PDF download", async ({
    authenticatedPage: page,
  }) => {
    await navigateToShootingPlan(page, SHOOTING_PLAN_PROJECT_ID);

    const pdfBtn = page.getByTestId("export-pdf-btn");
    await expect(pdfBtn).toBeVisible({ timeout: 15_000 });

    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 20_000 }),
      pdfBtn.click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/\.pdf$/);
  });

  test("[OHW-403] 'Esporta' downloads a CSV matching *-shot-list-*.csv", async ({
    authenticatedPage: page,
  }) => {
    await navigateToShootingPlan(page, SHOOTING_PLAN_PROJECT_ID);

    const csvBtn = page.getByTestId("export-csv-btn");
    await expect(csvBtn).toBeVisible({ timeout: 15_000 });

    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 20_000 }),
      csvBtn.click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/shot-list.*\.csv$/);
  });

  test("[OHW-404] 'Stampa' server response carries a valid base64-encoded PDF", async ({
    authenticatedPage: page,
  }) => {
    await navigateToShootingPlan(page, SHOOTING_PLAN_PROJECT_ID);

    const pdfBtn = page.getByTestId("export-pdf-btn");
    await expect(pdfBtn).toBeVisible({ timeout: 15_000 });

    const [response] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes("exportShotListPdf") &&
          r.request().method() === "POST",
        { timeout: 20_000 },
      ),
      pdfBtn.click(),
    ]);

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ result: { isOk: true } });
    expect(typeof body.result.value.pdfBase64).toBe("string");

    // Verify the base64 payload decodes to a PDF binary.
    const buffer = Buffer.from(body.result.value.pdfBase64, "base64");
    expect(buffer.subarray(0, 4).toString()).toBe("%PDF");
    expect(body.result.value.filename).toMatch(/\.pdf$/);
  });

  test("[OHW-405] Export with no planned shots completes gracefully (no crash)", async ({
    authenticatedPage: page,
  }) => {
    // Navigate to a fresh project that has no shot plans by creating a new one.
    await page.goto("http://localhost:3002/projects/new");
    await page.waitForLoadState("networkidle");

    const titleInput = page.getByRole("textbox", { name: /titolo|title/i });
    await expect(titleInput).toBeVisible({ timeout: 10_000 });
    await titleInput.fill(`Export Empty ${Date.now()}`);
    await page
      .getByRole("combobox", { name: /formato|format/i })
      .selectOption("short");
    await page
      .getByRole("button", { name: /crea progetto|create project/i })
      .click();
    await page.waitForURL(
      (url) => /\/projects\/[0-9a-f-]{36}$/.test(url.pathname),
      { timeout: 15_000 },
    );
    const match = page.url().match(/\/projects\/([0-9a-f-]{36})$/);
    const projectId = match?.[1];
    if (!projectId) throw new Error("could not extract new project id");

    await navigateToShootingPlan(page, projectId);

    const csvBtn = page.getByTestId("export-csv-btn");
    await expect(csvBtn).toBeVisible({ timeout: 15_000 });

    // CSV export on a project with zero scenes — server must return isOk: true
    // with an empty-body CSV (just the header row), not an error.
    const [response] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes("exportShotListCsv") &&
          r.request().method() === "POST",
        { timeout: 20_000 },
      ),
      csvBtn.click(),
    ]);

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ result: { isOk: true } });
    // CSV should at minimum contain the (localised IT) header row even with no
    // scenes: "Scena,Intestazione,Inquadratura #,…".
    expect(body.result.value.csv).toContain(
      "Scena,Intestazione,Inquadratura #",
    );
    expect(body.result.value.filename).toMatch(/shot-list.*\.csv$/);
  });

  test("[OHW-406] Viewer on team project can export the CSV shot list", async ({
    authenticatedViewerPage: page,
  }) => {
    await navigateToShootingPlan(page, TEST_TEAM_PROJECT_ID);

    const csvBtn = page.getByTestId("export-csv-btn");
    await expect(csvBtn).toBeVisible({ timeout: 15_000 });

    const [response] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes("exportShotListCsv") &&
          r.request().method() === "POST",
        { timeout: 20_000 },
      ),
      csvBtn.click(),
    ]);

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ result: { isOk: true } });
    expect(body.result.value.csv).toContain(
      "Scena,Intestazione,Inquadratura #",
    );
  });
});
