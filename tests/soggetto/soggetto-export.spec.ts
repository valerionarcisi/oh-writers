import { expect } from "@playwright/test";
import { test } from "../fixtures";
import { navigateToSoggetto, TEAM_PROJECT_ID } from "./helpers";

/**
 * Spec 04f — Soggetto (Phase 10 E2E)
 *
 * Covers:
 *   [OHW-SOG-004] Normal export: clicking "Export" opens the shared
 *                 ExportPdfModal wired for DOCX output. Clicking Generate
 *                 triggers a file download (the soggetto route currently
 *                 exposes only the DOCX format).
 *   [OHW-SOG-005] SIAE export: clicking "Export SIAE" opens ExportSiaeModal.
 *                 Required fields validate (empty fullName → error shown).
 *                 Filling the form and submitting triggers a PDF download.
 *
 * Requires the dev server to run with MOCK_AI=true.
 */

test.describe("[Spec 04f] Soggetto — export flows", () => {
  test("[OHW-SOG-004] Export button opens modal and downloads DOCX on Generate", async ({
    authenticatedPage: page,
  }) => {
    await navigateToSoggetto(page, TEAM_PROJECT_ID);

    await page.getByTestId("soggetto-export").click();

    const modal = page.getByTestId("narrative-export-modal");
    await expect(modal).toBeVisible({ timeout: 5_000 });

    // The soggetto route passes availableFormats={["docx"]} so the radio
    // group is hidden; the single DOCX format is used implicitly.
    await expect(modal).toContainText(/Word|\.docx/i);

    const generate = modal.getByTestId("narrative-export-generate");
    await expect(generate).toBeEnabled();

    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 15_000 }),
      generate.click(),
    ]);

    const name = download.suggestedFilename();
    expect(name.toLowerCase()).toMatch(/\.docx$/);
  });

  test("[OHW-SOG-005] Export SIAE validates required fields and downloads a PDF", async ({
    authenticatedPage: page,
  }) => {
    await navigateToSoggetto(page, TEAM_PROJECT_ID);

    await page.getByTestId("soggetto-export-siae").click();

    const form = page.getByTestId("siae-export-form");
    await expect(form).toBeVisible({ timeout: 5_000 });

    const submit = page.getByTestId("siae-export-submit");

    // Empty state: no authors entered → submit button disabled by the form's
    // minimal-validity gate (at least one author with a non-empty full name).
    await expect(submit).toBeDisabled();

    // Fill the first author's full name. AuthorListField renders inputs
    // under the shared test id "siae-authors".
    const authorsField = page.getByTestId("siae-authors");
    await expect(authorsField).toBeVisible();
    const firstFullName = page.getByTestId("siae-authors-fullName-0");
    await firstFullName.fill("Mario Rossi");

    // Ensure other required fields are populated (title and date are
    // prefilled from defaults; duration defaults to a valid number).
    const title = page.getByTestId("siae-title-input");
    await expect(title).toHaveValue(/.+/);
    const duration = page.getByTestId("siae-duration-input");
    const durationValue = await duration.inputValue();
    if (!durationValue || Number(durationValue) < 1) {
      await duration.fill("90");
    }
    const date = page.getByTestId("siae-date-input");
    const dateValue = await date.inputValue();
    if (!dateValue) {
      await date.fill("2026-04-24");
    }

    await expect(submit).toBeEnabled();

    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 20_000 }),
      submit.click(),
    ]);

    const name = download.suggestedFilename();
    expect(name.toLowerCase()).toMatch(/\.pdf$/);
  });
});
