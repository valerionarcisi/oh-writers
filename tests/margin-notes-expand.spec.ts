// Margin suggestion notes must expand on click even while the Cesare floating
// drawer is open. The old "compact mode" CSS (MarginNotesColumn.module.css)
// display:none'd the disclosed area whenever `body[data-cesare]` ≠ closed, so
// clicking a note toggled its state with NO visible effect — reported live as
// "i suggerimenti non aprono niente" (2026-07-02). Red on the old CSS.
import { test, expect, TEST_TEAM_PROJECT_ID, BASE_URL } from "./fixtures";
import { openCesareSheet } from "./helpers/cesare";

const SOGGETTO_PATH = `${BASE_URL}/projects/${TEST_TEAM_PROJECT_ID}/soggetto`;

test.describe("[095] Margin notes expand while Cesare is open", () => {
  test("clicking a collapsed note reveals its body + Avvia sessione with the drawer open", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(SOGGETTO_PATH);
    const column = page.getByTestId("margin-notes-column");
    await expect(column).toBeVisible({ timeout: 15_000 });

    await openCesareSheet(page);
    await expect(page.locator("body")).not.toHaveAttribute(
      "data-cesare",
      "closed",
    );

    const collapsed = column.locator("article:not([data-open])").first();
    await expect(collapsed).toBeVisible();
    await collapsed.getByRole("button").first().click();

    const opened = column.locator("article[data-open]").last();
    // The body must be VISIBLE, not just toggled in state — the compact-mode
    // CSS kept it display:none and the click looked dead.
    await expect(opened.locator("[class*='disclosed']")).toBeVisible();
    await expect(
      opened.getByTestId(/margin-note-session-/).first(),
    ).toBeVisible();
  });
});
