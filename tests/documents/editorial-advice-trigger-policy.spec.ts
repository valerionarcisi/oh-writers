/**
 * [OHW-833] Spec 83 — Editorial advice trigger policy (on-save + manual)
 *
 * Editorial advice used to key its query on the live, debounced editor
 * content (a 1s content-debounce), so every typing pause fired a real model
 * call. Spec 83 moves the trigger to the LAST SAVED content: typing alone
 * must never call `polishNarrativeDoc`; only a landed autosave, or pressing
 * "Rileggi", does.
 *
 * These specs count hits to the `polishNarrativeDoc` server fn via its
 * TanStack Start URL (mirrors the `saveDocument` substring-match convention
 * used across tests/documents/narrative-editor.spec.ts).
 */

import { test, expect, TEST_TEAM_PROJECT_ID } from "../fixtures";
import { BASE_URL } from "../helpers";

const SOGGETTO_PATH = (projectId: string) =>
  `${BASE_URL}/projects/${projectId}/soggetto`;

// Used to make the auto-save debounce testable. Set via
// page.addInitScript before navigation — same lever as narrative-editor.spec.ts.
const FAST_AUTOSAVE_SCRIPT = `window.__ohWritersAutoSaveDelayMs = 300;`;

const pmEditorLocator = (page: import("@playwright/test").Page) =>
  page.locator('[data-testid="rich-text-editor"] [contenteditable="true"]');

const marginNotesColumn = (page: import("@playwright/test").Page) =>
  page.getByTestId("margin-notes-column");

const focusPmEditor = async (page: import("@playwright/test").Page) => {
  const editor = pmEditorLocator(page);
  await editor.click();
  const isEmpty = await editor.evaluate(
    (el) => (el.textContent ?? "").trim().length === 0,
  );
  if (!isEmpty) {
    await page.keyboard.press(
      process.platform === "darwin" ? "Meta+A" : "Control+A",
    );
    await page.keyboard.press("Delete");
  }
};

const waitForAutosave = async (page: import("@playwright/test").Page) => {
  await page.waitForResponse(
    (resp) =>
      resp.url().includes("saveDocument") &&
      resp.request().method() === "POST" &&
      resp.ok(),
    { timeout: 10_000 },
  );
};

// Counts requests to the polishNarrativeDoc server fn. Registered BEFORE
// navigation so the initial-mount fetch (if any) is captured too.
const countPolishRequests = async (page: import("@playwright/test").Page) => {
  let count = 0;
  await page.route(/--polishNarrativeDoc_createServerFn_handler/, (route) => {
    count += 1;
    void route.continue();
  });
  return () => count;
};

test.describe("[OHW-833] Editorial advice — on-save + manual trigger", () => {
  test("typing does not fire an advice request before the autosave lands", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    // Long autosave window so the whole typing burst below happens WITHOUT a
    // save landing — proves typing alone is silent. Uses the personal fixture
    // project (like narrative-editor.spec.ts's typing tests), not the shared
    // team project, so the content mutation doesn't leak into other specs.
    const getCount = await countPolishRequests(page);
    await page.goto(SOGGETTO_PATH(testProjectId));
    await expect(marginNotesColumn(page)).toBeVisible({ timeout: 15_000 });

    const initialCount = getCount();

    await focusPmEditor(page);
    await page.keyboard.type(
      "Testo abbastanza lungo da superare la soglia minima di caratteri richiesta dal pannello editoriale, scritto apposta per verificare che digitare da solo non generi mai una chiamata.",
    );
    // Give any errant debounce-based fetch time to fire before asserting.
    await page.waitForTimeout(1_500);

    expect(getCount()).toBe(initialCount);
  });

  test("a landed autosave fires exactly one advice request", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    await page.addInitScript(FAST_AUTOSAVE_SCRIPT);
    const getCount = await countPolishRequests(page);
    await page.goto(SOGGETTO_PATH(testProjectId));
    await expect(marginNotesColumn(page)).toBeVisible({ timeout: 15_000 });

    const beforeSave = getCount();

    await focusPmEditor(page);
    await page.keyboard.type(
      "Nuovo soggetto salvato per verificare che il salvataggio, e solo il salvataggio, faccia partire la richiesta di consiglio editoriale su Cesare.",
    );
    await waitForAutosave(page);

    // The advice query re-keys on the saved fingerprint right after the save
    // response lands — wait for the panel to leave the "waiting" status.
    await expect(page.getByText("In attesa di rilettura")).toHaveCount(0, {
      timeout: 10_000,
    });

    expect(getCount()).toBe(beforeSave + 1);
  });

  test("Rileggi forces a refetch even when the saved content is unchanged", async ({
    authenticatedPage: page,
  }) => {
    const getCount = await countPolishRequests(page);
    await page.goto(SOGGETTO_PATH(TEST_TEAM_PROJECT_ID));
    await expect(marginNotesColumn(page)).toBeVisible({ timeout: 15_000 });

    await expect.poll(() => getCount(), { timeout: 15_000 }).toBeGreaterThan(0);
    const afterMount = getCount();

    await marginNotesColumn(page)
      .getByRole("button", { name: "Rileggi" })
      .click();

    await expect
      .poll(() => getCount(), { timeout: 10_000 })
      .toBeGreaterThan(afterMount);
  });
});
