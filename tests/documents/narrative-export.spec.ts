/**
 * Spec 04c / 67 — Narrative Export (logline + synopsis + treatment → PDF)
 *
 * Spec 67 moved the export trigger off the FloatingDock into the TopBar `⋯`
 * ("Altre azioni") menu. The PDF export lives on the narrative PM surfaces
 * (synopsis/treatment/outline) — the logline route redirects to Soggetto and
 * has no PDF export, so these tests open Synopsis and launch export from the
 * ⋯ menu's "Esporta PDF" item. The export modal itself is unchanged
 * (narrative-export-modal / -generate / -include-title-page).
 *
 * [OHW-225] Owner ⋯ → Esporta PDF → Genera → PDF delivered + preview tab opens
 * [OHW-226] PDF contains LOGLINE / SYNOPSIS / TREATMENT headers + bodies
 * [OHW-227] Export PDF item is disabled on the outline (non-narrative) surface
 * [OHW-228] Viewer on team project can export (read-op)
 * [OHW-229] Server rejects exportNarrativePdf for non-member → ForbiddenError (skipped)
 * [OHW-231] Default (includeTitlePage=false) → PDF has no cover page
 */

import { test, expect, TEST_TEAM_PROJECT_ID } from "../fixtures";
import { BASE_URL } from "../helpers";
import type { Page, Response } from "@playwright/test";
// @ts-expect-error — pdf-parse has no types for its internal entry
import pdfParse from "pdf-parse/lib/pdf-parse.js";

const SYNOPSIS_PATH = (projectId: string) =>
  `${BASE_URL}/projects/${projectId}/synopsis`;
const TREATMENT_PATH = (projectId: string) =>
  `${BASE_URL}/projects/${projectId}/treatment`;
const OUTLINE_PATH = (projectId: string) =>
  `${BASE_URL}/projects/${projectId}/outline`;

const FAKE_PROJECT_ID = "00000000-0000-4000-a000-00000000dead";

// Open the ⋯ menu and click "Esporta PDF" to launch the export modal.
const openExportModal = async (page: Page): Promise<void> => {
  await page.getByLabel("Altre azioni").click();
  const item = page.getByRole("menuitem", { name: /Esporta PDF/ });
  await expect(item).toBeVisible({ timeout: 8_000 });
  await item.click();
  await expect(page.getByTestId("narrative-export-modal")).toBeVisible({
    timeout: 5_000,
  });
};

/**
 * Drives the modal: opens it via the ⋯ menu, optionally toggles the
 * `Includi title page` checkbox, clicks Genera, and returns the export
 * response together with the popup page that opens for the PDF preview.
 */
const openExportModalAndGenerate = async (
  page: Page,
  opts: { includeTitlePage?: boolean } = {},
): Promise<{ response: Response; popup: Page }> => {
  await openExportModal(page);

  if (opts.includeTitlePage) {
    // The checkbox lives in the modal body; Genera/Annulla render in the
    // Modal footer (a sibling of the body), so they aren't scoped under the
    // `narrative-export-modal` body testid — address them at page level.
    await page.getByTestId("narrative-export-include-title-page").check();
  }

  const generateButton = page.getByTestId("narrative-export-generate");
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
    await page.goto(SYNOPSIS_PATH(testProjectId));

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
    await page.goto(SYNOPSIS_PATH(testProjectId));

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

  test("[OHW-227] Esporta PDF is disabled on the outline (non-narrative) surface", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    // The outline exposes the ⋯ menu for chrome parity, but PDF export is a
    // narrative-only route — the item is present and disabled (Spec 67), not
    // hidden. (Emptiness no longer gates the action.)
    await page.goto(OUTLINE_PATH(testProjectId));
    await page.getByLabel("Altre azioni").click();
    const item = page.getByRole("menuitem", { name: /Esporta PDF/ });
    await expect(item).toBeVisible({ timeout: 8_000 });
    await expect(item).toBeDisabled();
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
    await page.goto(SYNOPSIS_PATH(testProjectId));

    const { response, popup } = await openExportModalAndGenerate(page);
    if (!popup.isClosed()) await popup.close();
    const body = await response.json();
    expect(body, `export body: ${JSON.stringify(body)}`).toMatchObject({
      result: { isOk: true },
    });
    expect(typeof body.result.value.pdfBase64).toBe("string");
    const buffer = Buffer.from(body.result.value.pdfBase64, "base64");
    const parsed = await pdfParse(buffer);
    // Cover page is opt-in: when not requested, the "Written by" credit
    // line that lives on the cover must NOT appear in the rendered text.
    expect(parsed.text).not.toContain("Written by");
  });

  test("Esporta PDF is exposed on the treatment surface too", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    await page.goto(TREATMENT_PATH(testProjectId));
    await page.getByLabel("Altre azioni").click();
    const item = page.getByRole("menuitem", { name: /Esporta PDF/ });
    await expect(item).toBeVisible({ timeout: 8_000 });
    await expect(item).toBeEnabled();
  });
});
