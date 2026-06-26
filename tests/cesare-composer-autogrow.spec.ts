// tests/cesare-composer-autogrow.spec.ts
//
// [N65] The "Chiedi a Cesare…" composer is an auto-growing textarea.
//
// One shared primitive (`ComposerTextarea`, packages/ui) drives BOTH composer
// surfaces — the floating CesareDrawer and the full-page session route — so
// the contract is pinned once for each surface:
//
//   - starts ONE line tall;
//   - Shift+Enter inserts a newline and the box GROWS with the content;
//   - growth caps (~8 lines, derived from the surface font), then the draft
//     scrolls INSIDE the box instead of growing further;
//   - Enter sends the message.
//
// Regression for BUG-N65: the floating drawer's composer was a rigid
// single-line box (5 lines of draft → still 1 visible line), and the session
// page only sent on Cmd/Ctrl+Enter.
import { test, expect } from "./fixtures";
import type { Locator, Page } from "@playwright/test";
import { BASE_URL } from "./fixtures";
import { TEAM_PROJECT_ID } from "./breakdown/helpers";

const boxHeight = async (input: Locator): Promise<number> => {
  const box = await input.boundingBox();
  expect(box).not.toBeNull();
  return box!.height;
};

const computedMaxHeight = (input: Locator): Promise<number> =>
  input.evaluate((el) => parseFloat(getComputedStyle(el).maxBlockSize));

// Type `lines` into the focused composer, separating them with Shift+Enter.
const typeLines = async (
  page: Page,
  input: Locator,
  lines: readonly string[],
): Promise<void> => {
  await input.focus();
  for (const [i, line] of lines.entries()) {
    if (i > 0) await page.keyboard.press("Shift+Enter");
    await page.keyboard.type(line);
  }
};

test.describe("[N65] auto-growing Cesare composer", () => {
  test("floating drawer: grows with Shift+Enter lines, caps with internal scroll, Enter sends", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`${BASE_URL}/projects/${TEAM_PROJECT_ID}/soggetto`);
    await expect(page.getByTestId("soggetto-page")).toBeVisible({
      timeout: 15_000,
    });

    const trigger = page
      .getByTestId("bottom-dock")
      .getByTestId("cesare-open-btn");
    await trigger.waitFor({ state: "visible", timeout: 15_000 });
    await expect(async () => {
      await trigger.click();
      expect(await page.evaluate(() => document.body.dataset.cesare)).toBe(
        "expanded",
      );
    }).toPass({ timeout: 15_000 });

    const input = page.getByPlaceholder("Chiedi a Cesare…");
    await expect(input).toBeVisible({ timeout: 5_000 });

    const oneLineHeight = await boxHeight(input);
    const maxHeight = await computedMaxHeight(input);
    expect(maxHeight).toBeGreaterThan(oneLineHeight);

    // 5 lines via Shift+Enter — the box must GROW (the N65 regression: it
    // stayed one line tall) while no message is sent.
    await typeLines(page, input, [
      "riga 1",
      "riga 2",
      "riga 3",
      "riga 4",
      "riga 5",
    ]);
    await expect(input).toHaveValue("riga 1\nriga 2\nriga 3\nriga 4\nriga 5");
    const fiveLineHeight = await boxHeight(input);
    expect(fiveLineHeight).toBeGreaterThan(oneLineHeight * 3);
    expect(fiveLineHeight).toBeLessThanOrEqual(maxHeight + 1);

    // Pile on more lines: height pins at the cap and the draft scrolls inside.
    for (let i = 6; i <= 14; i += 1) {
      await page.keyboard.press("Shift+Enter");
      await page.keyboard.type(`riga ${i}`);
    }
    const cappedHeight = await boxHeight(input);
    expect(cappedHeight).toBeLessThanOrEqual(maxHeight + 1);
    const scrollsInside = await input.evaluate(
      (el) => el.scrollHeight > el.clientHeight,
    );
    expect(scrollsInside, "beyond the cap the draft scrolls inside").toBe(true);

    // Enter sends: the composer clears (the turn is dispatched).
    await page.keyboard.press("Enter");
    await expect(input).toHaveValue("", { timeout: 10_000 });
  });

  test("session page: grows with Shift+Enter and Enter sends the message", async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(90_000);

    // Create a fresh session through the full-screen landing (the seeded
    // session ids change on every reset, so the test mints its own).
    await page.goto(`${BASE_URL}/projects/${TEAM_PROJECT_ID}/sessions`);
    await page.waitForLoadState("networkidle");
    await page.getByTestId("cesare-session-new").click();
    await page.waitForURL(`**/projects/${TEAM_PROJECT_ID}/sessions/new`, {
      timeout: 10_000,
    });
    await page.getByTestId("new-session-input").fill("Ciao Cesare");
    await page.getByTestId("new-session-send").click();
    await page.waitForURL(
      new RegExp(`/projects/${TEAM_PROJECT_ID}/sessions/[0-9a-f-]+$`),
      { timeout: 10_000 },
    );

    const composer = page.getByTestId("session-composer");
    await expect(composer).toBeVisible({ timeout: 10_000 });
    const input = composer.getByTestId("cesare-composer-input");
    await expect(input).toBeEnabled({ timeout: 15_000 });

    const oneLineHeight = await boxHeight(input);
    const maxHeight = await computedMaxHeight(input);

    await typeLines(page, input, [
      "prima riga",
      "seconda riga",
      "terza riga",
      "quarta riga",
      "quinta riga",
    ]);
    const fiveLineHeight = await boxHeight(input);
    expect(fiveLineHeight).toBeGreaterThan(oneLineHeight * 2);
    expect(fiveLineHeight).toBeLessThanOrEqual(maxHeight + 1);

    // Enter sends (N65: this surface used to require Cmd/Ctrl+Enter): the
    // composer clears and the draft lands as the newest user bubble.
    const bubblesBefore = await page.getByTestId("cesare-user-bubble").count();
    await page.keyboard.press("Enter");
    await expect(input).toHaveValue("", { timeout: 10_000 });
    await expect
      .poll(() => page.getByTestId("cesare-user-bubble").count(), {
        timeout: 15_000,
      })
      .toBeGreaterThan(bubblesBefore);
  });
});
