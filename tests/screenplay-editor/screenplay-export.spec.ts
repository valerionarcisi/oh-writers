/**
 * Spec 05j — Screenplay PDF Export (Fountain → industry-standard PDF via afterwriting)
 *
 * [OHW-232] Editor clicks Export PDF → modal opens → Genera → PDF + preview tab
 * [OHW-233] PDF rendering rispetta gli standard (INT./EXT. headings, character maiuscolo)
 * [OHW-234] includeCoverPage=true → cover page con "Written by"
 * [OHW-237] Viewer su team project può esportare (read op)
 * [OHW-239] Filename rispetta {project}-{screenplay}-{YYYY-MM-DD}.pdf
 */

import { test, expect, TEST_TEAM_PROJECT_ID } from "../fixtures";
import { BASE_URL, waitForEditor } from "../helpers";
import type { Page, Response } from "@playwright/test";
// @ts-expect-error — pdf-parse has no types for its internal entry
import pdfParse from "pdf-parse/lib/pdf-parse.js";

const SCREENPLAY_PATH = (projectId: string) =>
  `${BASE_URL}/projects/${projectId}/screenplay`;

const openScreenplayExportAndGenerate = async (
  page: Page,
  opts: { includeCoverPage?: boolean } = {},
): Promise<{ response: Response; popup: Page }> => {
  const triggerButton = page.getByTestId("screenplay-export-pdf");
  await expect(triggerButton).toBeVisible({ timeout: 10_000 });
  await expect(triggerButton).toBeEnabled();
  await triggerButton.click();

  const modal = page.getByTestId("screenplay-export-modal");
  await expect(modal).toBeVisible({ timeout: 5_000 });

  if (opts.includeCoverPage) {
    const checkbox = modal.getByTestId("screenplay-export-include-cover-page");
    await checkbox.check();
  }

  const generateButton = modal.getByTestId("screenplay-export-generate");
  await expect(generateButton).toBeEnabled();

  const [response, popup] = await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().includes("exportScreenplayPdf") &&
        r.request().method() === "POST",
      { timeout: 15_000 },
    ),
    page.context().waitForEvent("page", { timeout: 15_000 }),
    generateButton.click(),
  ]);

  return { response, popup };
};

test.describe("Screenplay Export — Spec 05j", () => {
  test("[OHW-232] owner exports via modal → preview tab opens with the PDF", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    await page.goto(SCREENPLAY_PATH(testProjectId));
    await waitForEditor(page);

    const { response, popup } = await openScreenplayExportAndGenerate(page);

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ result: { isOk: true } });
    expect(typeof body.result.value.pdfBase64).toBe("string");
    expect(body.result.value.pdfBase64.length).toBeGreaterThan(200);
    expect(body.result.value.filename).toMatch(/\.pdf$/);
    expect(popup).toBeTruthy();
    if (!popup.isClosed()) await popup.close();
  });

  test("[OHW-233] PDF contains industry-standard markers", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    await page.goto(SCREENPLAY_PATH(testProjectId));
    await waitForEditor(page);

    const { response, popup } = await openScreenplayExportAndGenerate(page);
    if (!popup.isClosed()) await popup.close();
    const body = await response.json();
    const buffer = Buffer.from(body.result.value.pdfBase64, "base64");
    expect(buffer.subarray(0, 4).toString()).toBe("%PDF");
    const parsed = await pdfParse(buffer);
    // Seeded "Non fa ridere" screenplay starts with INT./EXT. scene headings
    // — they must surface in the rendered PDF text.
    expect(parsed.text).toMatch(/INT\.|EXT\./);
  });

  test("[OHW-234] includeCoverPage=true → cover page with Written by", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    await page.goto(SCREENPLAY_PATH(testProjectId));
    await waitForEditor(page);

    const { response, popup } = await openScreenplayExportAndGenerate(page, {
      includeCoverPage: true,
    });
    if (!popup.isClosed()) await popup.close();
    const body = await response.json();
    const buffer = Buffer.from(body.result.value.pdfBase64, "base64");
    const parsed = await pdfParse(buffer);
    expect(parsed.text).toContain("Written by");
  });

  // [OHW-237] Viewer-on-team-project export: skipped because the seeded
  // team project has no screenplay row (only narrative docs). The same
  // canRead guard is exercised by exportNarrativePdf's OHW-228 test.
  test.skip("[OHW-237] viewer on team project exports successfully", () => {
    void TEST_TEAM_PROJECT_ID;
  });

  test("[OHW-239] filename matches {project}-{screenplay}-{YYYY-MM-DD}.pdf", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    await page.goto(SCREENPLAY_PATH(testProjectId));
    await waitForEditor(page);

    const { response, popup } = await openScreenplayExportAndGenerate(page);
    if (!popup.isClosed()) await popup.close();
    const body = await response.json();
    expect(body.result.value.filename).toMatch(
      /^[a-z0-9-]+-[a-z0-9-]+-\d{4}-\d{2}-\d{2}\.pdf$/,
    );
  });
});
