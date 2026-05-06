import { expect } from "@playwright/test";
import { test } from "../fixtures";
import {
  navigateToSoggetto,
  navigateToProjectDashboard,
  TEAM_PROJECT_ID,
} from "./helpers";

/**
 * Spec 21 — Soggetto Free Editor (E2E flow)
 *
 * Covers:
 *   [OHW-SOG-001] Page renders: logline block + free editor (no Spec 04f
 *                 section headings) + cartelle counter + export buttons.
 *                 Soggetto card is reachable from the project dashboard.
 *   [OHW-SOG-002] Editorial template is pre-loaded when the soggetto is empty;
 *                 the counter shows > 0 cartelle.
 *   [OHW-SOG-003] Typing in the editor increments the cartelle counter.
 *   [OHW-SOG-006] SIAE modal pre-populates fields on second open after a
 *                 successful export.
 *
 * soggetto-export.spec.ts covers the actual DOCX + SIAE PDF downloads.
 */

test.describe("[Spec 21] Soggetto free editor — page flow", () => {
  test("[OHW-SOG-001] renders logline + free editor + counter + export buttons and is reachable from dashboard", async ({
    authenticatedPage: page,
  }) => {
    await navigateToSoggetto(page, TEAM_PROJECT_ID);

    await expect(page.getByTestId("logline-block")).toBeVisible();
    await expect(page.getByTestId("subject-editor")).toBeVisible();

    const editor = page.getByTestId("subject-editor").locator(".ProseMirror");
    await expect(editor).toBeVisible({ timeout: 10_000 });

    // Free editor — the old Spec 04f SubjectFooter must not be present
    await expect(page.getByTestId("subject-footer")).not.toBeAttached();

    // Cartelle counter
    const counter = page
      .getByTestId("subject-editor")
      .locator("[aria-live='polite']");
    await expect(counter).toBeVisible();
    await expect(counter).toContainText(/cartel/);

    await expect(page.getByTestId("soggetto-export")).toBeVisible();
    await expect(page.getByTestId("soggetto-export-siae")).toBeVisible();

    // Reachable from project dashboard
    await navigateToProjectDashboard(page, TEAM_PROJECT_ID);
    const soggettoCard = page.getByText("Soggetto", { exact: true }).first();
    await expect(soggettoCard).toBeVisible({ timeout: 10_000 });
    await soggettoCard.click();
    await page.waitForURL(/\/projects\/.+\/soggetto$/, { timeout: 10_000 });
    await expect(page.getByTestId("soggetto-page")).toBeVisible();
  });

  test("[OHW-SOG-002] editorial template is visible and counter shows > 0 cartelle", async ({
    authenticatedPage: page,
  }) => {
    await navigateToSoggetto(page, TEAM_PROJECT_ID);

    const editor = page.getByTestId("subject-editor").locator(".ProseMirror");
    await expect(editor).toBeVisible({ timeout: 10_000 });

    const counter = page
      .getByTestId("subject-editor")
      .locator("[aria-live='polite']");
    await expect(counter).toBeVisible();

    const counterText = await counter.textContent();
    const match = counterText?.match(/^(\d+)\s+cartel/);
    expect(match, "cartelle counter must show a number").not.toBeNull();
    const cartelleCount = parseInt(match![1]!, 10);
    expect(cartelleCount).toBeGreaterThan(0);
  });

  test("[OHW-SOG-003] typing in the editor increments the cartelle counter", async ({
    authenticatedPage: page,
  }) => {
    await navigateToSoggetto(page, TEAM_PROJECT_ID);

    const editor = page.getByTestId("subject-editor").locator(".ProseMirror");
    await expect(editor).toBeVisible({ timeout: 10_000 });

    const counter = page
      .getByTestId("subject-editor")
      .locator("[aria-live='polite']");
    await expect(counter).toBeVisible();

    const readCartelle = async (): Promise<number> => {
      const text = await counter.textContent();
      const m = text?.match(/^(\d+)\s+cartel/);
      return m ? parseInt(m[1]!, 10) : 0;
    };

    const before = await readCartelle();

    // Insert 2,000 characters via clipboard to guarantee a visible increment
    await editor.click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.evaluate(() => {
      const el = document.querySelector(
        '[data-testid="subject-editor"] .ProseMirror',
      ) as HTMLElement | null;
      if (!el) return;
      el.focus();
      const dt = new DataTransfer();
      dt.setData("text/plain", "a".repeat(2000));
      el.dispatchEvent(
        new ClipboardEvent("paste", {
          clipboardData: dt,
          bubbles: true,
          cancelable: true,
        }),
      );
    });

    await expect
      .poll(() => readCartelle(), { timeout: 5_000 })
      .toBeGreaterThan(before);
  });

  test("[OHW-SOG-006] SIAE modal pre-populates fields on second open after a successful export", async ({
    authenticatedPage: page,
  }) => {
    await navigateToSoggetto(page, TEAM_PROJECT_ID);
    await page.waitForLoadState("networkidle");

    const uniqueGenre = `test-genre-${Date.now()}`;

    // First open: ensure first author name is filled, set a unique genre, submit
    await page.getByTestId("soggetto-export-siae").click();
    const form = page.getByTestId("siae-export-form");
    await expect(form).toBeVisible({ timeout: 5_000 });

    const firstFullName = page.getByTestId("siae-authors-fullName-0");
    const currentName = await firstFullName.inputValue();
    if (!currentName || currentName.trim().length === 0) {
      await firstFullName.fill("Mario Rossi");
    }

    await page.getByTestId("siae-genre-input").fill(uniqueGenre);
    const submit = page.getByTestId("siae-export-submit");
    await expect(submit).toBeEnabled({ timeout: 10_000 });

    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 20_000 }),
      submit.click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.pdf$/i);

    // Modal closes after export — wait for it to become hidden
    await expect(form).not.toBeVisible({ timeout: 5_000 });
    await page.getByTestId("soggetto-export-siae").click();
    await expect(form).toBeVisible({ timeout: 5_000 });

    // The genre field should be pre-populated from the saved metadata
    await expect(page.getByTestId("siae-genre-input")).toHaveValue(uniqueGenre);
  });
});
