/**
 * Subject import — PDF/DOCX/TXT/MD into the Soggetto (Cesare kickoff #106
 * follow-up). Import mints a new document version and activates it; the
 * previous content stays available and re-activatable from Versioni.
 *
 * [SIMP-001] TXT import into an empty soggetto — no confirm dialog, editor
 *            shows the text, Versioni lists "Importato da <file>"
 * [SIMP-002] Overwrite flow — non-empty soggetto → confirm dialog; cancel
 *            keeps the current content; confirm replaces it AND the prior
 *            version stays activatable from Versioni
 * [SIMP-003] DOCX import, same shape as SIMP-001
 */

import path from "node:path";
import { test, expect } from "../fixtures";
import { navigateToSoggetto, TEAM_PROJECT_ID } from "../soggetto/helpers";

const FIXTURES = path.resolve(__dirname, "../fixtures/documents");

const subjectEditorText = (page: import("@playwright/test").Page) =>
  page.getByTestId("subject-editor").locator(".ProseMirror");

const clearSubjectEditor = async (page: import("@playwright/test").Page) => {
  const editor = subjectEditorText(page);
  await editor.click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("Delete");
};

const openImportPicker = async (page: import("@playwright/test").Page) => {
  await page.getByLabel("Altre azioni").click();
  const item = page.getByRole("menuitem", { name: /Importa PDF\/DOCX/ });
  await expect(item).toBeVisible({ timeout: 8_000 });
  await item.click();
};

const waitForImportCommit = (page: import("@playwright/test").Page) =>
  page.waitForResponse(
    (r) =>
      r.url().includes("importNarrativeVersion") &&
      r.request().method() === "POST" &&
      r.ok(),
    { timeout: 15_000 },
  );

const openVersions = async (page: import("@playwright/test").Page) => {
  await page.getByRole("button", { name: "VERSIONI" }).click();
  // The lane is a labelled REGION, not a dialog: it is a persistent in-flow
  // column that coexists with the editor. As a dialog it autofocused itself and
  // pulled focus back from the document behind it (#94).
  await expect(page.getByRole("region", { name: "Versioni" })).toBeVisible({
    timeout: 5_000,
  });
};

test.describe("Subject import — Soggetto", () => {
  test("[SIMP-001] TXT import into an empty soggetto creates and activates a version", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    await navigateToSoggetto(page, testProjectId);
    await clearSubjectEditor(page);
    // Flush the clear so the doc is genuinely empty before import checks
    // hasExistingContent — the app's own debounce, sped up via the test hook.
    await page.evaluate(() => {
      (
        window as unknown as { __ohWritersAutoSaveDelayMs?: number }
      ).__ohWritersAutoSaveDelayMs = 200;
    });
    await page.waitForTimeout(300);

    await openImportPicker(page);
    const fileInput = page.getByTestId("subject-import-input");
    await fileInput.setInputFiles(path.join(FIXTURES, "soggetto-sample.txt"));

    await waitForImportCommit(page);
    await expect(page.getByTestId("subject-import-confirm")).not.toBeVisible();
    await expect(subjectEditorText(page)).toContainText("detective");

    await openVersions(page);
    await expect(
      page.getByRole("button", {
        name: /Importato da soggetto-sample\.txt/,
      }),
    ).toBeVisible({ timeout: 5_000 });
  });

  test("[SIMP-002] overwrite flow — confirm replaces, cancel keeps, prior version stays activatable", async ({
    authenticatedPage: page,
  }) => {
    // The team project's soggetto carries the seeded editorial template —
    // guaranteed non-empty, so import goes straight to the confirm dialog.
    await navigateToSoggetto(page, TEAM_PROJECT_ID);
    const editor = subjectEditorText(page);
    await expect(editor).toBeVisible({ timeout: 10_000 });
    const originalText = await editor.textContent();

    // Cancel path: dialog dismisses, content unchanged.
    await openImportPicker(page);
    await page
      .getByTestId("subject-import-input")
      .setInputFiles(path.join(FIXTURES, "soggetto-sample.txt"));
    const confirmDialog = page.getByTestId("subject-import-confirm");
    await expect(confirmDialog).toBeVisible({ timeout: 5_000 });
    await confirmDialog.getByTestId("confirm-dialog-cancel-btn").click();
    await expect(confirmDialog).not.toBeVisible();
    await expect(editor).toHaveText(originalText ?? "");

    // Confirm path: content replaced, new version created and activated.
    await openImportPicker(page);
    await page
      .getByTestId("subject-import-input")
      .setInputFiles(path.join(FIXTURES, "soggetto-sample.txt"));
    await expect(confirmDialog).toBeVisible({ timeout: 5_000 });
    await Promise.all([
      waitForImportCommit(page),
      confirmDialog.getByTestId("confirm-dialog-confirm-btn").click(),
    ]);
    await expect(confirmDialog).not.toBeVisible();
    await expect(editor).toContainText("detective");

    // The pre-import content is preserved as an earlier version and can be
    // reactivated — import never destroys history.
    await openVersions(page);
    const importedVersion = page.getByRole("button", {
      name: /Importato da soggetto-sample\.txt/,
    });
    await expect(importedVersion).toBeVisible({ timeout: 5_000 });
    const priorVersion = page
      .getByRole("button")
      .filter({ hasText: /^Versione \d+/ })
      .first();
    await expect(priorVersion).toBeVisible();
    await priorVersion.hover();
    const activateButton = page.getByRole("button", {
      name: "Attiva",
      exact: true,
    });
    await expect(activateButton).toBeVisible({ timeout: 5_000 });
    await activateButton.click();
    await expect(editor).toHaveText(originalText ?? "", { timeout: 10_000 });
  });

  test("[SIMP-003] DOCX import into an empty soggetto creates and activates a version", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    await navigateToSoggetto(page, testProjectId);
    await clearSubjectEditor(page);
    await page.evaluate(() => {
      (
        window as unknown as { __ohWritersAutoSaveDelayMs?: number }
      ).__ohWritersAutoSaveDelayMs = 200;
    });
    await page.waitForTimeout(300);

    await openImportPicker(page);
    await page
      .getByTestId("subject-import-input")
      .setInputFiles(path.join(FIXTURES, "soggetto-sample.docx"));

    await waitForImportCommit(page);
    await expect(subjectEditorText(page)).toContainText("restauratrice");

    await openVersions(page);
    await expect(
      page.getByRole("button", {
        name: /Importato da soggetto-sample\.docx/,
      }),
    ).toBeVisible({ timeout: 5_000 });
  });
});
