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
 * [225] Owner ⋯ → Esporta PDF → Genera → PDF downloads directly
 * [226] PDF contains LOGLINE / SYNOPSIS / TREATMENT headers + bodies
 * [227] Export PDF item is disabled on the outline (non-narrative) surface
 * [228] Viewer on team project can export (read-op)
 * [229] Server rejects exportNarrativePdf for non-member → ForbiddenError (skipped)
 * [231] Default (includeTitlePage=false) → PDF has no cover page
 */

import { test, expect, TEST_TEAM_PROJECT_ID } from "../fixtures";
import { BASE_URL } from "../helpers";
import type { Download, Page, Response } from "@playwright/test";
import { pdfCompactText } from "../helpers/pdf";

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
 * response together with the browser download it triggers directly (no
 * preview tab — the client downloads the PDF via an anchor `download` click).
 */
const openExportModalAndGenerate = async (
  page: Page,
  opts: { includeTitlePage?: boolean } = {},
): Promise<{ response: Response; download: Download }> => {
  await openExportModal(page);

  if (opts.includeTitlePage) {
    // The checkbox lives in the modal body; Genera/Annulla render in the
    // Modal footer (a sibling of the body), so they aren't scoped under the
    // `narrative-export-modal` body testid — address them at page level.
    await page.getByTestId("narrative-export-include-title-page").check();
  }

  const generateButton = page.getByTestId("narrative-export-generate");
  await expect(generateButton).toBeEnabled();

  const [response, download] = await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().includes("exportNarrativePdf") &&
        r.request().method() === "POST",
      { timeout: 10_000 },
    ),
    page.waitForEvent("download", { timeout: 10_000 }),
    generateButton.click(),
  ]);

  return { response, download };
};

test.describe("Narrative Export — Spec 04c", () => {
  test("[225] owner exports via modal → PDF downloads directly", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    await page.goto(SYNOPSIS_PATH(testProjectId));

    const { response, download } = await openExportModalAndGenerate(page);

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ result: { isOk: true } });
    expect(typeof body.result.value.pdfBase64).toBe("string");
    expect(body.result.value.pdfBase64.length).toBeGreaterThan(200);
    expect(body.result.value.filename).toMatch(/\.pdf$/);

    // The download event firing is itself the contract: the client invoked
    // an anchor `download` click on the blob URL — the response payload
    // above already proves the PDF is real.
    expect(download.suggestedFilename()).toBe(body.result.value.filename);
  });

  test("[226] PDF payload contains the three section markers", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    await page.goto(SYNOPSIS_PATH(testProjectId));

    const { response } = await openExportModalAndGenerate(page);
    const body = await response.json();
    const buffer = Buffer.from(body.result.value.pdfBase64, "base64");
    expect(buffer.subarray(0, 4).toString()).toBe("%PDF");
    // Compact text: the section headings render with letter-spacing, so the
    // extracted glyphs come back as "L O G L I N E".
    const text = await pdfCompactText(buffer);
    expect(text).toContain("LOGLINE");
    expect(text).toContain("SYNOPSIS");
    expect(text).toContain("TREATMENT");
  });

  test("[227] Esporta PDF is disabled on the outline (non-narrative) surface", async ({
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

  test("[228] viewer on team project exports via modal successfully", async ({
    authenticatedViewerPage: page,
  }) => {
    await page.goto(SYNOPSIS_PATH(TEST_TEAM_PROJECT_ID));

    const { response } = await openExportModalAndGenerate(page);
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ result: { isOk: true } });
  });

  // [229] Server ForbiddenError for non-member: skipped. We only seed
  // owner + viewer (both team members). A third-user fixture would be
  // needed to exercise the reject path. The guard itself is the same
  // canRead check used by getDocument — already proven by other specs.
  test.skip("[229] non-member: server rejects exportNarrativePdf", () => {
    void FAKE_PROJECT_ID;
  });

  test("[231] without includeTitlePage the PDF has no cover page", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    await page.goto(SYNOPSIS_PATH(testProjectId));

    const { response } = await openExportModalAndGenerate(page);
    const body = await response.json();
    expect(body, `export body: ${JSON.stringify(body)}`).toMatchObject({
      result: { isOk: true },
    });
    expect(typeof body.result.value.pdfBase64).toBe("string");
    const buffer = Buffer.from(body.result.value.pdfBase64, "base64");
    // Cover page is opt-in: when not requested, the "Written by" credit
    // line that lives on the cover must NOT appear in the rendered text
    // (whitespace-stripped so heading letter-spacing can't mask it).
    const text = await pdfCompactText(buffer);
    expect(text).not.toContain("Writtenby");
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
