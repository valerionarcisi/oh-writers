/**
 * Spec 89 — AI disclosure stamp, screenplay PDF export (phase 3).
 *
 * The screenplay PDF is rendered by an external CLI (afterwriting), so the
 * note is post-processed onto the ALREADY-RENDERED PDF as a bottom-right
 * footer on every page (stamp-pdf-footer.ts) — independent of includeCoverPage,
 * since the whole document is stamped, not just its cover.
 *
 * Same permanence invariant as breakdown/documents: driven by
 * screenplay_versions.everAiTouched, never reset once true.
 */
import { test, expect, BASE_URL } from "../fixtures";
import { waitForEditor } from "../helpers";
import type { Page, Response } from "@playwright/test";
import { pdfCompactText } from "../helpers/pdf";

const SCREENPLAY_PATH = (projectId: string) =>
  `${BASE_URL}/projects/${projectId}/screenplay`;

const setScreenplayAiTouched = async (
  page: Page,
  projectId: string,
  touched: boolean,
): Promise<void> => {
  const response = await page.request.post(
    `${BASE_URL}/api/test/set-screenplay-ai-touched`,
    {
      data: { projectId, touched },
      headers: { "Content-Type": "application/json" },
    },
  );
  if (!response.ok()) {
    throw new Error(
      `setScreenplayAiTouched failed: ${response.status()} ${response.statusText()}`,
    );
  }
};

const openActionsMenu = async (page: Page): Promise<void> => {
  const trigger = page.getByLabel("Altre azioni");
  await expect(trigger).toBeVisible({ timeout: 15_000 });
  await trigger.click();
  await expect(page.getByTestId("screenplay-actions-menu")).toBeVisible({
    timeout: 5_000,
  });
};

const exportAndGetPdfText = async (page: Page): Promise<string> => {
  await openActionsMenu(page);
  const exportItem = page.getByTestId("screenplay-export-pdf");
  await expect(exportItem).toBeVisible({ timeout: 5_000 });
  await exportItem.click();

  const modal = page.getByTestId("screenplay-export-modal");
  await expect(modal).toBeVisible({ timeout: 5_000 });

  const generateButton = page.getByTestId("screenplay-export-generate");
  await expect(generateButton).toBeEnabled();

  const [response] = await Promise.all([
    page.waitForResponse(
      (r: Response) =>
        r.url().includes("exportScreenplayPdf") &&
        r.request().method() === "POST",
      { timeout: 15_000 },
    ),
    page.waitForEvent("download", { timeout: 15_000 }),
    generateButton.click(),
  ]);
  const body = await response.json();
  const buffer = Buffer.from(body.result.value.pdfBase64, "base64");
  return pdfCompactText(buffer);
};

test.describe("[OHW-148] Screenplay — AI disclosure stamp on export", () => {
  test("no footer when never Cesare-touched, footer present on every page once it was", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    await setScreenplayAiTouched(page, testProjectId, false);
    await page.goto(SCREENPLAY_PATH(testProjectId));
    await waitForEditor(page);

    const beforeText = await exportAndGetPdfText(page);
    expect(beforeText).not.toContain("Cesare");

    await setScreenplayAiTouched(page, testProjectId, true);
    await page.reload();
    await waitForEditor(page);

    const afterText = await exportAndGetPdfText(page);
    expect(afterText).toContain("Cesare");
  });

  test("[Permanenza] the note survives switching the active version away from the touched one", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    await setScreenplayAiTouched(page, testProjectId, false);
    await page.goto(SCREENPLAY_PATH(testProjectId));
    await waitForEditor(page);

    // Mark the CURRENT version as Cesare-touched (mirrors a real
    // propose_screenplay_revision turn), then switch the active version to a
    // brand-new one that never carried the flag — reproducing the bug where
    // the export only checked the active version, not the full history.
    await setScreenplayAiTouched(page, testProjectId, true);
    const newVersionResponse = await page.request.post(
      `${BASE_URL}/api/test/screenplay-new-version`,
      {
        data: { projectId: testProjectId },
        headers: { "Content-Type": "application/json" },
      },
    );
    if (!newVersionResponse.ok()) {
      throw new Error(
        `screenplay-new-version failed: ${newVersionResponse.status()}`,
      );
    }
    await page.reload();
    await waitForEditor(page);

    const afterSwitchText = await exportAndGetPdfText(page);
    expect(afterSwitchText).toContain("Cesare");
  });
});
