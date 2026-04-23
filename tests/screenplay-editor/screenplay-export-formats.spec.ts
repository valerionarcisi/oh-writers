/**
 * Spec 05k — Production export formats (Standard, Sides, AD copy,
 * Reading copy, One scene per page).
 *
 * [OHW-310] Export menu opens with all 5 voices
 * [OHW-311] Sides modal: scene checkboxes shown, Genera disabled until selection
 * [OHW-312] Sides with 2 scenes selected → PDF generated, filename slug "sides"
 * [OHW-313] AD copy → filename slug "ad-copy"
 * [OHW-314] Reading copy → filename slug "reading"
 * [OHW-315] One scene per page → filename slug "scene-per-page"
 */

import { test, expect } from "../fixtures";
import { BASE_URL, waitForEditor } from "../helpers";
import type { Page, Response } from "@playwright/test";

const SCREENPLAY_PATH = (projectId: string) =>
  `${BASE_URL}/projects/${projectId}/screenplay`;

const openExportMenu = async (page: Page) => {
  const trigger = page.getByTestId("screenplay-export-pdf");
  await expect(trigger).toBeVisible({ timeout: 10_000 });
  await expect(trigger).toBeEnabled();
  await trigger.click();
  const menu = page.getByTestId("screenplay-export-menu");
  await expect(menu).toBeVisible({ timeout: 5_000 });
  return menu;
};

const generateAndCapture = async (
  page: Page,
): Promise<{ response: Response; popup: Page }> => {
  const generate = page
    .getByTestId("screenplay-export-modal")
    .getByTestId("screenplay-export-generate");
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
  test("[OHW-310] Export menu shows all 5 production formats", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    await page.goto(SCREENPLAY_PATH(testProjectId));
    await waitForEditor(page);
    const menu = await openExportMenu(page);
    await expect(
      menu.getByRole("menuitem", { name: /^Standard/ }),
    ).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: /^Sides/ })).toBeVisible();
    await expect(
      menu.getByRole("menuitem", { name: /^AD copy/ }),
    ).toBeVisible();
    await expect(
      menu.getByRole("menuitem", { name: /^Reading copy/ }),
    ).toBeVisible();
    await expect(
      menu.getByRole("menuitem", { name: /Una scena per pagina/ }),
    ).toBeVisible();
  });

  test("[OHW-311] Sides modal: Genera disabled until at least one scene is picked", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    await page.goto(SCREENPLAY_PATH(testProjectId));
    await waitForEditor(page);
    const menu = await openExportMenu(page);
    await menu.getByRole("menuitem", { name: /^Sides/ }).click();
    const modal = page.getByTestId("screenplay-export-modal");
    await expect(modal).toBeVisible();
    const generate = modal.getByTestId("screenplay-export-generate");
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

  test("[OHW-312] Sides with 2 scenes → filename slug 'sides'", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    await page.goto(SCREENPLAY_PATH(testProjectId));
    await waitForEditor(page);
    const menu = await openExportMenu(page);
    await menu.getByRole("menuitem", { name: /^Sides/ }).click();
    const modal = page.getByTestId("screenplay-export-modal");
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

  test("[OHW-313] AD copy → filename slug 'ad-copy'", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    await page.goto(SCREENPLAY_PATH(testProjectId));
    await waitForEditor(page);
    const menu = await openExportMenu(page);
    await menu.getByRole("menuitem", { name: /^AD copy/ }).click();
    const { response, popup } = await generateAndCapture(page);
    if (!popup.isClosed()) await popup.close();
    const body = await response.json();
    expect(body.result.value.filename).toMatch(
      /-ad-copy-\d{4}-\d{2}-\d{2}\.pdf$/,
    );
    expect(body.result.value.format).toBe("ad_copy");
  });

  test("[OHW-314] Reading copy → filename slug 'reading'", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    await page.goto(SCREENPLAY_PATH(testProjectId));
    await waitForEditor(page);
    const menu = await openExportMenu(page);
    await menu.getByRole("menuitem", { name: /^Reading copy/ }).click();
    const { response, popup } = await generateAndCapture(page);
    if (!popup.isClosed()) await popup.close();
    const body = await response.json();
    expect(body.result.value.filename).toMatch(
      /-reading-\d{4}-\d{2}-\d{2}\.pdf$/,
    );
    expect(body.result.value.format).toBe("reading_copy");
  });

  test("[OHW-315] One scene per page → filename slug 'scene-per-page'", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    await page.goto(SCREENPLAY_PATH(testProjectId));
    await waitForEditor(page);
    const menu = await openExportMenu(page);
    await menu.getByRole("menuitem", { name: /Una scena per pagina/ }).click();
    const { response, popup } = await generateAndCapture(page);
    if (!popup.isClosed()) await popup.close();
    const body = await response.json();
    expect(body.result.value.filename).toMatch(
      /-scene-per-page-\d{4}-\d{2}-\d{2}\.pdf$/,
    );
    expect(body.result.value.format).toBe("one_scene_per_page");
  });
});
