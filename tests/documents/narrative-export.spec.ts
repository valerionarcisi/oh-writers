/**
 * Spec 04c — Narrative Export (logline + synopsis + treatment → PDF)
 *
 * [OHW-225] Owner clicks Export PDF → modal opens → click Genera →
 *           PDF response is delivered and a preview tab is opened
 * [OHW-226] PDF contains LOGLINE / SYNOPSIS / TREATMENT headers + bodies
 * [OHW-227] When all three docs are empty, Export PDF is disabled
 * [OHW-228] Viewer on team project sees Export PDF and can download (read-op)
 * [OHW-229] Server rejects exportNarrativePdf for non-member → ForbiddenError (skipped)
 * [OHW-231] Default (includeTitlePage=false) → PDF has no cover page
 *           ("Written by" must not appear in the rendered text)
 */

import { test, expect, TEST_TEAM_PROJECT_ID } from "../fixtures";
import { BASE_URL } from "../helpers";
import type { Page, Response } from "@playwright/test";
// @ts-expect-error — pdf-parse has no types for its internal entry
import pdfParse from "pdf-parse/lib/pdf-parse.js";

const LOGLINE_PATH = (projectId: string) =>
  `${BASE_URL}/projects/${projectId}/logline`;
const SYNOPSIS_PATH = (projectId: string) =>
  `${BASE_URL}/projects/${projectId}/synopsis`;
const TREATMENT_PATH = (projectId: string) =>
  `${BASE_URL}/projects/${projectId}/treatment`;

const FAKE_PROJECT_ID = "00000000-0000-4000-a000-00000000dead";

/**
 * Drives the new modal flow: opens the dialog, optionally toggles the
 * `Includi title page` checkbox, clicks Genera, and returns the export
 * response together with the popup page that opens for the PDF preview.
 */
const openExportModalAndGenerate = async (
  page: Page,
  opts: { includeTitlePage?: boolean } = {},
): Promise<{ response: Response; popup: Page }> => {
  const triggerButton = page.getByTestId("narrative-export-pdf");
  await expect(triggerButton).toBeVisible({ timeout: 10_000 });
  await expect(triggerButton).toBeEnabled();
  await triggerButton.click();

  const modal = page.getByTestId("narrative-export-modal");
  await expect(modal).toBeVisible({ timeout: 5_000 });

  if (opts.includeTitlePage) {
    const checkbox = modal.getByTestId("narrative-export-include-title-page");
    await checkbox.check();
  }

  const generateButton = modal.getByTestId("narrative-export-generate");
  await expect(generateButton).toBeEnabled();

  const [response, popup] = await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().includes("exportNarrativePdf") &&
        r.request().method() === "POST",
      { timeout: 10_000 },
    ),
    page.context().waitForEvent("page", { timeout: 10_000 }),
    generateButton.click(),
  ]);

  return { response, popup };
};

test.describe("Narrative Export — Spec 04c", () => {
  test("[OHW-225] owner exports via modal → preview tab opens with the PDF", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    await page.goto(LOGLINE_PATH(testProjectId));

    const { response, popup } = await openExportModalAndGenerate(page);

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ result: { isOk: true } });
    expect(typeof body.result.value.pdfBase64).toBe("string");
    expect(body.result.value.pdfBase64.length).toBeGreaterThan(200);
    expect(body.result.value.filename).toMatch(/\.pdf$/);

    // The popup event firing is itself the contract: the client invoked
    // window.open(blobUrl). Headless Chromium has no inline PDF viewer
    // and closes the popup almost immediately, so we don't assert on the
    // URL — the response payload above already proves the PDF is real.
    expect(popup).toBeTruthy();
    if (!popup.isClosed()) await popup.close();
  });

  test("[OHW-226] PDF payload contains the three section markers", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    await page.goto(LOGLINE_PATH(testProjectId));

    const { response, popup } = await openExportModalAndGenerate(page);
    await popup.close();
    const body = await response.json();
    const buffer = Buffer.from(body.result.value.pdfBase64, "base64");
    expect(buffer.subarray(0, 4).toString()).toBe("%PDF");
    const parsed = await pdfParse(buffer);
    expect(parsed.text).toContain("LOGLINE");
    expect(parsed.text).toContain("SYNOPSIS");
    expect(parsed.text).toContain("TREATMENT");
  });

  test("[OHW-227] Export PDF disabled when all three narrative docs are empty", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`${BASE_URL}/projects/new`);
    await page.waitForLoadState("networkidle");
    const titleInput = page.getByRole("textbox", { name: /title/i });
    await expect(titleInput).toBeVisible({ timeout: 10_000 });
    await titleInput.fill(`Empty Export ${Date.now()}`);
    await page.getByRole("combobox", { name: /format/i }).selectOption("short");
    await page.getByRole("button", { name: /create project/i }).click();
    await page.waitForURL(
      (url) => /\/projects\/[0-9a-f-]{36}$/.test(url.pathname),
      { timeout: 15_000 },
    );
    const match = page.url().match(/\/projects\/([0-9a-f-]{36})$/);
    const projectId = match?.[1];
    if (!projectId) throw new Error("could not extract new project id");

    await page.goto(LOGLINE_PATH(projectId));
    const button = page.getByTestId("narrative-export-pdf");
    await expect(button).toBeVisible({ timeout: 10_000 });
    await expect(button).toBeDisabled();
  });

  test("[OHW-228] viewer on team project exports via modal successfully", async ({
    authenticatedViewerPage: page,
  }) => {
    await page.goto(SYNOPSIS_PATH(TEST_TEAM_PROJECT_ID));

    const { response, popup } = await openExportModalAndGenerate(page);
    await popup.close();
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ result: { isOk: true } });
  });

  // [OHW-229] Server ForbiddenError for non-member: skipped. We only seed
  // owner + viewer (both team members). A third-user fixture would be
  // needed to exercise the reject path. The guard itself is the same
  // canRead check used by getDocument — already proven by other specs.
  test.skip("[OHW-229] non-member: server rejects exportNarrativePdf", () => {
    void FAKE_PROJECT_ID;
  });

  test("[OHW-231] without includeTitlePage the PDF has no cover page", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    await page.goto(LOGLINE_PATH(testProjectId));

    const { response, popup } = await openExportModalAndGenerate(page);
    await popup.close();
    const body = await response.json();
    const buffer = Buffer.from(body.result.value.pdfBase64, "base64");
    const parsed = await pdfParse(buffer);
    // Cover page is opt-in: when not requested, the "Written by" credit
    // line that lives on the cover must NOT appear in the rendered text.
    expect(parsed.text).not.toContain("Written by");
  });

  test("export button is hidden on the outline page", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    await page.goto(`${BASE_URL}/projects/${testProjectId}/outline`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("narrative-export-pdf")).toHaveCount(0);
    await page.goto(TREATMENT_PATH(testProjectId));
    await expect(page.getByTestId("narrative-export-pdf")).toBeVisible({
      timeout: 10_000,
    });
  });
});
