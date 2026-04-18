/**
 * Spec 07b — Title Page (ProseMirror editor) E2E
 *
 * [OHW-FP20] Owner: editor mounts, placeholders visible in empty regions
 * [OHW-FP21] Owner: type into title syncs to project breadcrumb (autosave)
 * [OHW-FP22] Owner: pick a draft color → reload persists
 * [OHW-FP23] Owner: pick a draft date → reload persists
 * [OHW-FP24] Owner: type into a footer region → reload persists the doc
 * [OHW-FP25] Viewer: editor is contenteditable=false, no draft swatches enabled
 */

import { test, expect, TEST_TEAM_PROJECT_ID } from "../fixtures";
import { BASE_URL } from "../helpers";

const TITLE_PAGE_PATH = (projectId: string) =>
  `${BASE_URL}/projects/${projectId}/title-page`;

const SAVE_DEBOUNCE_MS = 800;

test.describe("Title Page — Spec 07b (PM editor)", () => {
  test("[OHW-FP20] owner sees the editor with placeholders in empty regions", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    await page.goto(TITLE_PAGE_PATH(testProjectId));

    const editor = page.getByTestId("title-page-editor");
    await expect(editor).toBeVisible({ timeout: 10_000 });
    await expect(editor.locator(".ProseMirror")).toHaveAttribute(
      "contenteditable",
      "true",
    );

    // At minimum the four non-title regions start empty in the seeded project,
    // so their placeholders are rendered.
    const placeholders = editor.locator(".tp-placeholder");
    await expect(placeholders).toHaveCount(4);
    await expect(placeholders).toContainText([
      /Author/i,
      /Draft date/i,
      /Notes/i,
      /Contact info/i,
    ]);
  });

  test("[OHW-FP21] owner: typing the title autosaves and updates the breadcrumb", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    await page.goto(TITLE_PAGE_PATH(testProjectId));

    const titleNode = page.locator(".ProseMirror .tp-title");
    await expect(titleNode).toBeVisible({ timeout: 10_000 });

    const newTitle = `Title ${Date.now()}`;
    await titleNode.click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type(newTitle);

    // Wait for the debounced autosave + invalidation to land in the breadcrumb.
    await expect(page.getByText(newTitle).first()).toBeVisible({
      timeout: SAVE_DEBOUNCE_MS + 5_000,
    });

    await page.reload();
    await expect(page.locator(".ProseMirror .tp-title")).toContainText(
      newTitle,
    );
  });

  test("[OHW-FP22] owner: picking a draft color persists across reload", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    await page.goto(TITLE_PAGE_PATH(testProjectId));

    const blueSwatch = page.getByTestId("tp-draft-color-blue");
    await expect(blueSwatch).toBeVisible({ timeout: 10_000 });
    await blueSwatch.click();
    await expect(blueSwatch).toHaveAttribute("aria-pressed", "true");

    await page.waitForTimeout(SAVE_DEBOUNCE_MS + 400);
    await page.reload();

    await expect(page.getByTestId("tp-draft-color-blue")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("[OHW-FP23] owner: picking a draft date persists across reload", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    await page.goto(TITLE_PAGE_PATH(testProjectId));

    const dateInput = page.getByTestId("tp-draft-date");
    await expect(dateInput).toBeVisible({ timeout: 10_000 });
    await dateInput.fill("2026-04-18");

    await page.waitForTimeout(SAVE_DEBOUNCE_MS + 400);
    await page.reload();

    await expect(page.getByTestId("tp-draft-date")).toHaveValue("2026-04-18");
  });

  test("[OHW-FP24] owner: typing into a footer region persists across reload", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    await page.goto(TITLE_PAGE_PATH(testProjectId));

    const footerLeft = page.locator(".ProseMirror .tp-footer-left p").first();
    await expect(footerLeft).toBeVisible({ timeout: 10_000 });

    const stamp = `Draft ${Date.now()}`;
    await footerLeft.click();
    await page.keyboard.type(stamp);

    await page.waitForTimeout(SAVE_DEBOUNCE_MS + 400);
    await page.reload();

    await expect(page.locator(".ProseMirror .tp-footer-left")).toContainText(
      stamp,
    );
  });

  test("[OHW-FP25] viewer: editor is read-only, draft controls disabled", async ({
    authenticatedViewerPage: page,
  }) => {
    await page.goto(TITLE_PAGE_PATH(TEST_TEAM_PROJECT_ID));

    const editor = page.getByTestId("title-page-editor");
    await expect(editor).toBeVisible({ timeout: 10_000 });
    await expect(editor.locator(".ProseMirror")).toHaveAttribute(
      "contenteditable",
      "false",
    );

    await expect(page.getByTestId("tp-draft-date")).toBeDisabled();
    await expect(page.getByTestId("tp-draft-color-blue")).toBeDisabled();
  });
});
