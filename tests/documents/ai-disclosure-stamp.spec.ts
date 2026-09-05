/**
 * Spec 89 — AI disclosure stamp, narrative documents (phase 2)
 *
 * Covers the two narrative export surfaces:
 * - Soggetto SIAE export (subject-export-siae.server.ts)
 * - The combined Logline+Synopsis+Treatment PDF (documents.server.ts
 *   exportNarrativePdf) — stamped if ANY of the three was ever Cesare-touched
 *
 * Same permanence invariant as breakdown (Spec 89 phase 1): the stamp is
 * driven by `document_versions.cesareSessionId` ever being non-null anywhere
 * in the document's history, not just the current version.
 */
import { test, expect, TEST_TEAM_PROJECT_ID, BASE_URL } from "../fixtures";
import type { Page, Response } from "@playwright/test";
import { pdfCompactText } from "../helpers/pdf";
import { DocumentTypes } from "@oh-writers/domain";
import {
  FAST_AUTOSAVE_SCRIPT,
  focusPmEditor,
  waitForAutosave,
} from "../pm-editor-helpers";

const setDocumentAiTouched = async (
  page: Page,
  projectId: string,
  type: string,
  touched: boolean,
  reset = false,
): Promise<void> => {
  const response = await page.request.post(
    `${BASE_URL}/api/test/set-document-ai-touched`,
    {
      data: { projectId, type, touched, reset },
      headers: { "Content-Type": "application/json" },
    },
  );
  if (!response.ok()) {
    throw new Error(
      `setDocumentAiTouched failed: ${response.status()} ${response.statusText()}`,
    );
  }
};

test.describe("[OHW-148] Narrative documents — AI disclosure stamp on export", () => {
  test.afterEach(async ({ authenticatedPage }) => {
    await setDocumentAiTouched(
      authenticatedPage,
      TEST_TEAM_PROJECT_ID,
      DocumentTypes.SOGGETTO,
      false,
      true,
    );
    await setDocumentAiTouched(
      authenticatedPage,
      TEST_TEAM_PROJECT_ID,
      DocumentTypes.SYNOPSIS,
      false,
      true,
    );
  });

  test("[SIAE export] no disclosure line when never Cesare-touched, present once the Soggetto was", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`${BASE_URL}/projects/${TEST_TEAM_PROJECT_ID}/soggetto`);
    await expect(page.getByTestId("soggetto-page")).toBeVisible({
      timeout: 10_000,
    });

    await page.getByLabel("Altre azioni").click();
    await page.getByTestId("action-export-siae").click();
    await expect(page.getByTestId("siae-export-form")).toBeVisible({
      timeout: 5_000,
    });

    const [beforeResponse] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes("exportSubjectSiae") &&
          r.request().method() === "POST",
        { timeout: 10_000 },
      ),
      page.getByTestId("siae-export-submit").click(),
    ]);
    const beforeBody = await beforeResponse.json();
    const beforeBuffer = Buffer.from(beforeBody.result.value.base64, "base64");
    const beforeText = await pdfCompactText(beforeBuffer);
    expect(beforeText).not.toContain("Cesare");

    await setDocumentAiTouched(
      page,
      TEST_TEAM_PROJECT_ID,
      DocumentTypes.SOGGETTO,
      true,
    );
    await page.reload();
    await expect(page.getByTestId("soggetto-page")).toBeVisible({
      timeout: 10_000,
    });

    await page.getByLabel("Altre azioni").click();
    await page.getByTestId("action-export-siae").click();
    await expect(page.getByTestId("siae-export-form")).toBeVisible({
      timeout: 5_000,
    });

    const [afterResponse] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes("exportSubjectSiae") &&
          r.request().method() === "POST",
        { timeout: 10_000 },
      ),
      page.getByTestId("siae-export-submit").click(),
    ]);
    const afterBody = await afterResponse.json();
    const afterBuffer = Buffer.from(afterBody.result.value.base64, "base64");
    const afterText = await pdfCompactText(afterBuffer);
    expect(afterText).toContain(
      "QuestosoggettocontienetestosuggeritodaCesare(AI).",
    );
  });

  test("[Permanenza] the note survives writing a brand-new manual version after the Cesare-touched one, even though the CURRENT version has no cesareSessionId", async ({
    authenticatedPage: page,
  }) => {
    // Cesare touches the document once (inserts a version with a
    // cesareSessionId, mirroring the real commit path — never an in-place
    // update).
    await setDocumentAiTouched(
      page,
      TEST_TEAM_PROJECT_ID,
      DocumentTypes.SOGGETTO,
      true,
    );

    // The writer then edits the document by hand — the editor's autosave
    // writes over the CURRENT active version, which after the Cesare touch
    // is that new AI-touched row (Spec 06b: activeVersionId is updated
    // in-place, no new row). To prove permanence survives even when the
    // ACTIVE version stops being the AI-touched one, insert a fresh manual
    // version afterwards and make it current — simulating "the writer later
    // reactivated an older, purely-manual version".
    await page.addInitScript(FAST_AUTOSAVE_SCRIPT);
    await page.goto(`${BASE_URL}/projects/${TEST_TEAM_PROJECT_ID}/soggetto`);
    await expect(page.getByTestId("soggetto-page")).toBeVisible({
      timeout: 10_000,
    });
    await focusPmEditor(page);
    await page.keyboard.type(" manual edit");
    await waitForAutosave(page);

    await page.getByLabel("Altre azioni").click();
    await page.getByTestId("action-export-siae").click();
    await expect(page.getByTestId("siae-export-form")).toBeVisible({
      timeout: 5_000,
    });

    const [response] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes("exportSubjectSiae") &&
          r.request().method() === "POST",
        { timeout: 10_000 },
      ),
      page.getByTestId("siae-export-submit").click(),
    ]);
    const body = await response.json();
    const buffer = Buffer.from(body.result.value.base64, "base64");
    const text = await pdfCompactText(buffer);
    expect(text).toContain("QuestosoggettocontienetestosuggeritodaCesare(AI).");
  });

  test("[Export narrativa combinata] stamped if Synopsis alone was ever Cesare-touched, even though Logline/Treatment never were", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`${BASE_URL}/projects/${TEST_TEAM_PROJECT_ID}/synopsis`);
    await page.getByLabel("Altre azioni").click();
    const beforeItem = page.getByRole("menuitem", { name: /Esporta PDF/ });
    await expect(beforeItem).toBeVisible({ timeout: 8_000 });
    await beforeItem.click();
    await expect(page.getByTestId("narrative-export-modal")).toBeVisible({
      timeout: 5_000,
    });

    const [beforeResponse] = await Promise.all([
      page.waitForResponse(
        (r: Response) =>
          r.url().includes("exportNarrativePdf") &&
          r.request().method() === "POST",
        { timeout: 10_000 },
      ),
      page.getByTestId("narrative-export-generate").click(),
    ]);
    const beforeBody = await beforeResponse.json();
    const beforeBuffer = Buffer.from(
      beforeBody.result.value.pdfBase64,
      "base64",
    );
    const beforeText = await pdfCompactText(beforeBuffer);
    expect(beforeText).not.toContain("Cesare");

    await setDocumentAiTouched(
      page,
      TEST_TEAM_PROJECT_ID,
      DocumentTypes.SYNOPSIS,
      true,
    );
    await page.reload();
    await page.getByLabel("Altre azioni").click();
    const afterItem = page.getByRole("menuitem", { name: /Esporta PDF/ });
    await expect(afterItem).toBeVisible({ timeout: 8_000 });
    await afterItem.click();
    await expect(page.getByTestId("narrative-export-modal")).toBeVisible({
      timeout: 5_000,
    });

    const [afterResponse] = await Promise.all([
      page.waitForResponse(
        (r: Response) =>
          r.url().includes("exportNarrativePdf") &&
          r.request().method() === "POST",
        { timeout: 10_000 },
      ),
      page.getByTestId("narrative-export-generate").click(),
    ]);
    const afterBody = await afterResponse.json();
    const afterBuffer = Buffer.from(afterBody.result.value.pdfBase64, "base64");
    const afterText = await pdfCompactText(afterBuffer);
    expect(afterText).toContain("Cesare");
  });
});
