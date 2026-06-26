/**
 * Spec 05k — Production export formats (Standard, Sides, AD copy,
 * Reading copy, One scene per page).
 *
 * [310] Export menu opens with all 5 voices
 * [311] Sides modal: scene checkboxes shown, Genera disabled until selection
 * [312] Sides with 2 scenes selected → PDF generated, filename slug "sides"
 * [313] AD copy → filename slug "ad-copy"
 * [314] Reading copy → filename slug "reading"
 * [315] One scene per page → filename slug "scene-per-page"
 */

import { test, expect } from "../fixtures";
import { BASE_URL, waitForEditor } from "../helpers";
import type { Page, Response } from "@playwright/test";

const SCREENPLAY_PATH = (projectId: string) =>
  `${BASE_URL}/projects/${projectId}/screenplay`;

// Spec 55a — "Esporta PDF" lives in the TopBar actions menu; the format choice
// (radio group) now lives inside the export modal.
const openExportModal = async (page: Page) => {
  const trigger = page.getByLabel("Altre azioni");
  await expect(trigger).toBeVisible({ timeout: 15_000 });
  await trigger.click();
  const exportItem = page.getByTestId("screenplay-export-pdf");
  await expect(exportItem).toBeVisible({ timeout: 5_000 });
  await expect(exportItem).toBeEnabled();
  await exportItem.click();
  const modal = page.getByTestId("screenplay-export-modal");
  await expect(modal).toBeVisible({ timeout: 5_000 });
  return modal;
};

type FormatId =
  | "standard"
  | "sides"
  | "ad_copy"
  | "reading_copy"
  | "one_scene_per_page";

const selectFormat = async (page: Page, id: FormatId) => {
  // The format picker is a <select> dropdown (was a radiogroup) — pick the option.
  await page.getByTestId("screenplay-export-format").selectOption(id);
};

const generateAndCapture = async (
  page: Page,
): Promise<{ response: Response; popup: Page }> => {
  // Generate lives in the Modal footer (sibling of the testid'd body), so
  // scope it to the page.
  const generate = page.getByTestId("screenplay-export-generate");
  await expect(generate).toBeEnabled();
  const [response, popup] = await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().includes("exportScreenplayPdf") &&
        r.request().method() === "POST",
      { timeout: 30_000 },
    ),
    page.context().waitForEvent("page", { timeout: 30_000 }),
    generate.click(),
  ]);
  return { response, popup };
};

test.describe("Screenplay Export Formats — Spec 05k", () => {
  test("[310] Export modal shows all 5 production formats", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    await page.goto(SCREENPLAY_PATH(testProjectId));
    await waitForEditor(page);
    const modal = await openExportModal(page);
    // The picker is a <select>; assert each format option is present in it.
    const select = modal.getByTestId("screenplay-export-format");
    await expect(select).toBeVisible();
    for (const id of [
      "standard",
      "sides",
      "ad_copy",
      "reading_copy",
      "one_scene_per_page",
    ] as const) {
      await expect(select.locator(`option[value="${id}"]`)).toHaveCount(1);
    }
  });

  test("[311] Sides modal: Genera disabled until at least one scene is picked", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    await page.goto(SCREENPLAY_PATH(testProjectId));
    await waitForEditor(page);
    const modal = await openExportModal(page);
    await selectFormat(page, "sides");
    const generate = page.getByTestId("screenplay-export-generate");
    await expect(generate).toBeDisabled();
    await expect(
      modal.getByTestId("screenplay-export-scene-list"),
    ).toBeVisible();
    // pick the first available scene checkbox
    const firstCheckbox = modal
      .locator('input[data-testid^="screenplay-export-scene-"]')
      .first();
    await firstCheckbox.check();
    await expect(generate).toBeEnabled();
  });

  test("[312] Sides with 2 scenes → filename slug 'sides'", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    await page.goto(SCREENPLAY_PATH(testProjectId));
    await waitForEditor(page);
    const modal = await openExportModal(page);
    await selectFormat(page, "sides");
    const checkboxes = modal.locator(
      'input[data-testid^="screenplay-export-scene-"]',
    );
    await expect(checkboxes.first()).toBeVisible({ timeout: 10_000 });
    await checkboxes.nth(0).check();
    await checkboxes.nth(1).check();
    const { response, popup } = await generateAndCapture(page);
    if (!popup.isClosed()) await popup.close();
    const body = await response.json();
    expect(body.result.isOk).toBe(true);
    expect(body.result.value.filename).toMatch(
      /-sides-\d{4}-\d{2}-\d{2}\.pdf$/,
    );
    expect(body.result.value.format).toBe("sides");
  });

  test("[313] AD copy → filename slug 'ad-copy'", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    await page.goto(SCREENPLAY_PATH(testProjectId));
    await waitForEditor(page);
    await openExportModal(page);
    await selectFormat(page, "ad_copy");
    const { response, popup } = await generateAndCapture(page);
    if (!popup.isClosed()) await popup.close();
    const body = await response.json();
    expect(body.result.value.filename).toMatch(
      /-ad-copy-\d{4}-\d{2}-\d{2}\.pdf$/,
    );
    expect(body.result.value.format).toBe("ad_copy");
  });

  test("[314] Reading copy → filename slug 'reading'", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    await page.goto(SCREENPLAY_PATH(testProjectId));
    await waitForEditor(page);
    await openExportModal(page);
    await selectFormat(page, "reading_copy");
    const { response, popup } = await generateAndCapture(page);
    if (!popup.isClosed()) await popup.close();
    const body = await response.json();
    expect(body.result.value.filename).toMatch(
      /-reading-\d{4}-\d{2}-\d{2}\.pdf$/,
    );
    expect(body.result.value.format).toBe("reading_copy");
  });

  test("[315] One scene per page → filename slug 'scene-per-page'", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    await page.goto(SCREENPLAY_PATH(testProjectId));
    await waitForEditor(page);
    await openExportModal(page);
    await selectFormat(page, "one_scene_per_page");
    const { response, popup } = await generateAndCapture(page);
    if (!popup.isClosed()) await popup.close();
    const body = await response.json();
    expect(body.result.value.filename).toMatch(
      /-scene-per-page-\d{4}-\d{2}-\d{2}\.pdf$/,
    );
    expect(body.result.value.format).toBe("one_scene_per_page");
  });
});
