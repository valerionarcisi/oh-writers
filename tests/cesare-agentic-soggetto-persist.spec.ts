// tests/cesare-soggetto-apply-persists.spec.ts
//
// [061] Cesare soggetto apply persists — no flash-then-revert.
//
// Regression for Spec 61: a Cesare agentic edit stores PLAIN text in the DB while
// the rich narrative editor serialises to HTML. The autosave dirty-check used a
// raw string compare, so after the apply the editor looked "dirty" forever and
// the autosave clobbered the applied draft back to the editor's prior state — the
// new text flashed in and then reverted. The fix canonicalises the dirty-check
// (Spec 61) so a pure re-serialisation is never dirty.
//
// We assert the applied soggetto-v2 text is present AND still present after the
// autosave window AND after a reload (the DB kept it — no clobber).
import { test, expect } from "./fixtures";
import { BASE_URL } from "./fixtures";
import { TEAM_PROJECT_ID } from "./breakdown/helpers";
import {
  openCesareSheet,
  sendCesareWithRetry,
  resetCesareState,
} from "./helpers/cesare";

// The deterministic mock soggetto-v2 output (cesare-document-tools MOCK_OUTPUTS)
// opens with this sentence; a small unique suffix is appended per generation.
const MOCK_V2_MARKER = "Marco torna a Falerone";

test.describe("[061] Cesare soggetto apply persists (no flash-then-revert)", () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await resetCesareState(authenticatedPage, TEAM_PROJECT_ID);
  });

  test("applied soggetto v2 survives the autosave window and a reload", async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(120_000);
    // Shrink the 30s autosave debounce so any clobber would land within the test.
    await page.addInitScript("window.__ohWritersAutoSaveDelayMs = 300;");
    await page.goto(`${BASE_URL}/projects/${TEAM_PROJECT_ID}/soggetto`);
    await page.waitForLoadState("networkidle");

    const editor = page.getByTestId("rich-text-editor");
    await expect(editor).toBeVisible({ timeout: 15_000 });

    await openCesareSheet(page);
    const reply = await sendCesareWithRetry(
      page,
      "Fammi un v2 del soggetto più asciutto.",
    );
    expect(reply.toLowerCase()).toMatch(/soggetto|aggiornat|applicat/);

    // The v2 lands live in the open editor (the live-doc contract).
    await expect(editor).toContainText(MOCK_V2_MARKER, { timeout: 15_000 });

    // ── The crux: it must NOT revert. Wait well past the autosave debounce, then
    // re-assert the text is still there (no clobber back to the prior content).
    await page.waitForTimeout(2_500);
    await expect(editor).toContainText(MOCK_V2_MARKER);

    // ── And it persisted to the DB: a reload re-reads the current version and
    // still shows the applied text (the autosave did not overwrite it).
    await page.reload();
    await page.waitForLoadState("networkidle");
    const reloadedEditor = page.getByTestId("rich-text-editor");
    await expect(reloadedEditor).toContainText(MOCK_V2_MARKER, {
      timeout: 15_000,
    });
  });
});
