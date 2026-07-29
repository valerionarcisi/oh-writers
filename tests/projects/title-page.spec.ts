/**
 * Spec 07b — Title Page (ProseMirror editor) E2E
 *
 * [FP20] Owner: editor mounts, placeholders visible in empty regions (IT)
 * [FP21] Owner: type into title syncs to project breadcrumb (autosave)
 * [FP22] Draft panel is read-only + links to the Versions surface (Spec 66 —
 *            draft date/colour are no longer edited inline; FP23 folded in)
 * [FP24] Owner: type into a footer region → reload persists the doc
 * [FP25] Viewer: editor is contenteditable=false, draft panel read-only
 */

import { test, expect, TEST_TEAM_PROJECT_ID } from "../fixtures";
import { BASE_URL } from "../helpers";
import { reseedTestDb } from "../breakdown/helpers";

// Mutator pays (#116): this file writes timestamped Title/Draft values into
// the shared seed title page and never restored them — screenplay-export's
// cover-page assertions downstream then saw "TITLE 1785…" instead of the
// seeded byline ([234]). Restore the seed so file order stays irrelevant.
test.afterAll(() => {
  reseedTestDb();
});

const TITLE_PAGE_PATH = (projectId: string) =>
  `${BASE_URL}/projects/${projectId}/title-page`;

const SAVE_DEBOUNCE_MS = 800;

test.describe("Title Page — Spec 07b (PM editor)", () => {
  test("[FP20] owner sees the editor with placeholders in empty regions", async ({
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

    // The seeded project ships an Author region ("Written by …"), so three of
    // the non-title regions start empty and render their (IT) placeholders.
    const placeholders = editor.locator(".tp-placeholder");
    await expect(placeholders).toHaveCount(3);
    await expect(placeholders).toContainText([
      /Data bozza/i,
      /Note/i,
      /Contatti/i,
    ]);
  });

  test("[FP21] owner: typing the title autosaves and updates the breadcrumb", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    await page.goto(TITLE_PAGE_PATH(testProjectId));

    const titleNode = page.locator(".ProseMirror .tp-title");
    await expect(titleNode).toBeVisible({ timeout: 10_000 });

    const newTitle = `Title ${Date.now()}`;
    // Arm the save-response wait BEFORE typing so the debounced updateTitlePage
    // POST (fires ~800ms after the last keystroke) can't be missed.
    const savePromise = page.waitForResponse(
      (r) =>
        r.url().includes("updateTitlePage") &&
        r.request().method() === "POST" &&
        r.ok(),
      { timeout: SAVE_DEBOUNCE_MS + 10_000 },
    );

    await titleNode.click();
    // Clear then type with a small per-key delay: the title is a single-line PM
    // node that re-renders on input, and an immediate fast type after select-all
    // drops all but the first character.
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.press("Delete");
    await page.keyboard.type(newTitle, { delay: 30 });

    // The breadcrumb updates from live (optimistic) state.
    await expect(page.getByText(newTitle).first()).toBeVisible({
      timeout: SAVE_DEBOUNCE_MS + 5_000,
    });

    // Then the actual persist round-trip lands; only after it is it safe to
    // reload without racing the debounced save.
    await savePromise;

    await page.reload();
    await expect(page.locator(".ProseMirror .tp-title")).toContainText(
      newTitle,
      { timeout: 10_000 },
    );
  });

  test("[FP22] the draft panel is read-only and links to the Versions surface", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    // Spec 66: the draft date/colour are no longer edited inline on the title
    // page — the panel shows them read-only and links to the Versions surface
    // (the single home for draft metadata).
    await page.goto(TITLE_PAGE_PATH(testProjectId));

    const panel = page.getByTestId("title-page-draft-panel");
    await expect(panel).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("tp-draft-date-readonly")).toBeVisible();
    await expect(page.getByTestId("tp-draft-color-readonly")).toBeVisible();

    // The inline editable controls are gone.
    await expect(page.getByTestId("tp-draft-color-blue")).toHaveCount(0);
    await expect(page.getByTestId("tp-draft-date")).toHaveCount(0);

    // The "edit in versions" link routes to the screenplay (versions live there).
    const link = page.getByTestId("tp-draft-edit-versions-link");
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", /\/screenplay$/);
  });

  test("[FP24] owner: typing into a footer region persists across reload", async ({
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

  test("[FP25] viewer: editor is read-only, draft controls disabled", async ({
    authenticatedViewerPage: page,
  }) => {
    await page.goto(TITLE_PAGE_PATH(TEST_TEAM_PROJECT_ID));

    const editor = page.getByTestId("title-page-editor");
    await expect(editor).toBeVisible({ timeout: 10_000 });
    await expect(editor.locator(".ProseMirror")).toHaveAttribute(
      "contenteditable",
      "false",
    );

    // The draft panel is read-only for everyone (date/colour are managed in the
    // Versions surface), so a viewer simply sees the read-only values.
    await expect(page.getByTestId("tp-draft-date-readonly")).toBeVisible();
    await expect(page.getByTestId("tp-draft-color-readonly")).toBeVisible();
  });
});
