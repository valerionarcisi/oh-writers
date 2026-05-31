// tests/l10n-leaks.spec.ts
//
// [OHW-l10n] Italian localisation guard.
//
// The product is for Italian screenwriters / directors: every user-facing
// string must be Italian. This suite walks the pages flagged in
// docs/audits/2026-05-31/audit-C-l10n-bugs.md (L1–L23) and asserts that none
// of the previously-leaked English labels are visible, while the correct
// Italian replacement is present. Identifiers, enum values and testids stay
// English and are deliberately NOT asserted on.
//
// Each leak is matched as a whole word against the rendered page text so we
// catch the visible label without tripping on English that legitimately lives
// in code (data-* attributes, test ids) or in accepted loanwords (Cast,
// Troupe, magic hour, above the line).
import { test, expect, BASE_URL, TEST_TEAM_PROJECT_ID } from "./fixtures";
import type { Page } from "@playwright/test";

const PROJECT = TEST_TEAM_PROJECT_ID;

/** Visible text of the page, used for whole-word leak assertions. */
const pageText = async (page: Page): Promise<string> =>
  (await page.locator("body").innerText()) ?? "";

/**
 * Fails if any forbidden English word appears as a standalone token.
 * Case-insensitive: CSS `text-transform` uppercases many labels, so a leak
 * could surface as e.g. "OWNER" — we must catch that too.
 */
const expectNoLeaks = (text: string, leaks: string[]): void => {
  for (const leak of leaks) {
    const pattern = new RegExp(
      `\\b${leak.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
      "i",
    );
    expect(text, `English leak "${leak}" must not be visible`).not.toMatch(
      pattern,
    );
  }
};

test.describe("[OHW-l10n] no leaked English on user-facing pages", () => {
  test("dashboard role filter + badges are Italian (L14–L16)", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`${BASE_URL}/dashboard`);
    await page.waitForLoadState("networkidle");
    const text = await pageText(page);

    expectNoLeaks(text, ["Owner", "Viewer"]);
    expect(text).toContain("Proprietario");
    expect(text).toContain("Visualizzatore");
  });

  test("project overview pipeline + cards are Italian (L4, L5)", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`${BASE_URL}/projects/${PROJECT}`);
    await page.waitForLoadState("networkidle");
    const text = await pageText(page);

    expectNoLeaks(text, ["Screenplay", "Synopsis", "Outline", "Treatment"]);
    expect(text).toContain("Sinossi");
    expect(text).toContain("Scaletta");
    expect(text).toContain("Trattamento");
  });

  test("screenplay element legend is Italian (L1–L3)", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`${BASE_URL}/projects/${PROJECT}/screenplay`);
    await page.waitForLoadState("networkidle");

    // The element legend chips live in the top strip; assert each Italian
    // label is the accessible name of its conversion button.
    for (const label of [
      "Scena",
      "Azione",
      "Personaggio",
      "Dialogo",
      "Parentetica",
      "Transizione",
    ]) {
      await expect(
        page.getByRole("button", { name: label, exact: true }).first(),
      ).toBeVisible({ timeout: 15_000 });
    }

    // Whole-word check on the legend: the old English chip labels must be gone.
    const text = await pageText(page);
    expectNoLeaks(text, [
      "Character",
      "Dialogue",
      "Transition",
      "Screenplay not found",
    ]);
  });

  test("budget summary terms are Italian (L7–L11)", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`${BASE_URL}/projects/${PROJECT}/budget`);
    await page.waitForLoadState("networkidle");
    const text = await pageText(page);

    // CSS text-transform renders these KPI labels uppercase, so innerText
    // returns them uppercased; compare case-insensitively.
    const lower = text.toLowerCase();
    expectNoLeaks(lower, ["production", "contingency", "contingenza"]);
    expect(lower).toContain("imprevisti");
    expect(lower).toContain("produzione");
    expect(lower).toContain("troupe");
  });

  test("schedule first tab is Spannografo (L6)", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`${BASE_URL}/projects/${PROJECT}/schedule`);
    await page.waitForLoadState("networkidle");
    const text = await pageText(page);

    expectNoLeaks(text, ["Strip Board"]);
    await expect(page.getByRole("tab", { name: "Spannografo" })).toBeVisible({
      timeout: 15_000,
    });
  });

  test("breakdown underline filter is Italian (L12, L13)", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`${BASE_URL}/projects/${PROJECT}/breakdown`);
    await page.waitForLoadState("networkidle");
    const text = await pageText(page);

    expectNoLeaks(text, ["Locations", "Props"]);
    // The "Location" filter chip uses the singular invariant IT form.
    await expect(
      page.getByRole("button", { name: "Location" }).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("title-page form labels are Italian (placeholders + fields)", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`${BASE_URL}/projects/${PROJECT}/title-page`);
    await page.waitForLoadState("networkidle");
    const text = await pageText(page);

    expectNoLeaks(text, [
      "Based on",
      "Draft date",
      "Draft color",
      "Contact info",
      "Author",
    ]);
    expect(text).toContain("Tratto da");
    expect(text).toContain("Data bozza");
  });
});
