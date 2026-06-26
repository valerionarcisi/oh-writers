import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { test } from "../fixtures";
import { navigateToSoggetto, TEAM_PROJECT_ID } from "./helpers";

/**
 * Spec 04f / 67 — Soggetto export flows (E2E)
 *
 * Spec 67 moved the soggetto exports off dedicated buttons into the TopBar `⋯`
 * ("Altre azioni") menu: "Esporta DOCX" (shared ExportPdfModal, DOCX format)
 * and "Esporta SIAE" (ExportSiaeModal). The modal/form field testids are
 * unchanged; only the launch path moved.
 *
 *   [SOG-004] ⋯ → Esporta DOCX → modal → Genera → .docx download.
 *   [SOG-005] ⋯ → Esporta SIAE → form validates (empty author → submit
 *                 disabled) → fill + submit → .pdf download.
 *
 * Requires the dev server to run with MOCK_AI=true.
 */

// Open the soggetto ⋯ menu and click a menu item by accessible name / testid.
const openSoggettoMenu = async (page: Page) => {
  await page.getByLabel("Altre azioni").click();
};

test.describe("[Spec 04f] Soggetto — export flows", () => {
  test("[SOG-004] ⋯ → Esporta DOCX opens the modal and downloads DOCX", async ({
    authenticatedPage: page,
  }) => {
    await navigateToSoggetto(page, TEAM_PROJECT_ID);

    await openSoggettoMenu(page);
    await page.getByRole("menuitem", { name: /Esporta DOCX/ }).click();

    const modal = page.getByTestId("narrative-export-modal");
    await expect(modal).toBeVisible({ timeout: 5_000 });

    // The soggetto route passes availableFormats={["docx"]} so the format radio
    // group is hidden; the single DOCX format is used implicitly. The download
    // filename below is the real proof of the format.

    // Genera lives in the Modal footer (sibling of the body testid) — page-level.
    const generate = page.getByTestId("narrative-export-generate");
    await expect(generate).toBeEnabled();

    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 15_000 }),
      generate.click(),
    ]);

    const name = download.suggestedFilename();
    expect(name.toLowerCase()).toMatch(/\.docx$/);
  });

  test("[SOG-005] ⋯ → Esporta SIAE validates required fields and downloads a PDF", async ({
    authenticatedPage: page,
  }) => {
    await navigateToSoggetto(page, TEAM_PROJECT_ID);

    await openSoggettoMenu(page);
    await page.getByTestId("action-export-siae").click();

    const form = page.getByTestId("siae-export-form");
    await expect(form).toBeVisible({ timeout: 5_000 });

    const submit = page.getByTestId("siae-export-submit");

    // The first author may be prefilled from the project/user. Clear it to
    // exercise the minimal-validity gate: with no author full name, submit is
    // disabled.
    const authorsField = page.getByTestId("siae-authors");
    await expect(authorsField).toBeVisible();
    const firstFullName = page.getByTestId("siae-authors-fullName-0");
    await firstFullName.fill("");
    await expect(submit).toBeDisabled();

    // Fill the first author's full name → the gate opens.
    await firstFullName.fill("Mario Rossi");

    // Ensure all required fields satisfy SiaeExportInputSchema: a non-empty
    // title, a duration in [1,600], and a valid YYYY-MM-DD compilation date
    // (z.string().date()). Set them unconditionally so a stale/locale-formatted
    // default can't fail Zod silently.
    const title = page.getByTestId("siae-title-input");
    if (!(await title.inputValue())) await title.fill("Soggetto E2E");
    await page.getByTestId("siae-duration-input").fill("90");
    await page.getByTestId("siae-date-input").fill("2026-04-24");

    await expect(submit).toBeEnabled();

    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 20_000 }),
      submit.click(),
    ]);

    const name = download.suggestedFilename();
    expect(name.toLowerCase()).toMatch(/\.pdf$/);
  });
});
