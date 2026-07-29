// Margin suggestions must stay usable while the Cesare floating drawer is
// open. The old "compact mode" CSS (MarginNotesColumn.module.css)
// display:none'd note content whenever `body[data-cesare]` ≠ closed, so the
// column looked dead — reported live as "i suggerimenti non aprono niente"
// (2026-07-02).
//
// The column has since been rebuilt on the EditorialAdviceStack cards (the #99
// taxonomy: risk / authorial_choice / optional): there is no collapsed/data-open
// toggle any more — card bodies are always rendered — and "Avvia sessione"
// became the card's "Approfondisci", which seeds a Cesare session from the
// note. The protected contract is unchanged: with the drawer OPEN (any
// `data-cesare` ≠ closed), the margin content is VISIBLE and its action works.
import { test, expect, TEST_TEAM_PROJECT_ID, BASE_URL } from "./fixtures";
import { openCesareSheet } from "./helpers/cesare";

const SOGGETTO_PATH = `${BASE_URL}/projects/${TEST_TEAM_PROJECT_ID}/soggetto`;

test.describe("[095] Margin notes stay usable while Cesare is open", () => {
  test("card bodies are visible and Approfondisci seeds a Cesare session with the drawer open", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(SOGGETTO_PATH);
    const column = page.getByTestId("margin-notes-column");
    await expect(column).toBeVisible({ timeout: 15_000 });

    await openCesareSheet(page);
    // Minimise to the peek row: the drawer stays OPEN — `body[data-cesare]` is
    // "peek", not "closed", the state the guarded CSS regression keyed on —
    // while its expanded panel no longer sits over the notes column.
    await page
      .getByTestId("cesare-drawer")
      .getByTestId("cesare-minimize-btn")
      .click();
    await expect(page.locator("body")).toHaveAttribute("data-cesare", "peek");

    // The cards and their TEXT are visible — the compact-mode CSS regression
    // hid exactly this while the drawer was open.
    const firstCard = column.locator("article").first();
    await expect(firstCard).toBeVisible();
    const bodyText = (await firstCard.textContent()) ?? "";
    expect(bodyText.trim().length).toBeGreaterThan(20);

    // "Approfondisci" (the successor of "Avvia sessione") seeds a Cesare
    // session from the note: the drawer expands with the seeded prompt.
    await firstCard.getByRole("button", { name: "Approfondisci" }).click();
    await expect
      .poll(async () => page.evaluate(() => document.body.dataset.cesare), {
        timeout: 10_000,
      })
      .toBe("expanded");
  });
});
