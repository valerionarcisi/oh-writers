import { test, expect } from "@playwright/test";

// Static apps/landing pages: public-home.html (EN, default/canonical) and
// public-home.it.html (IT translation). No auth, no DB — served as plain
// files by the `landing` project's webServer (see playwright.config.ts).

test.describe("public-home.html (EN)", () => {
  test("loads with English content and no leftover Italian", async ({
    page,
  }) => {
    await page.goto("/public-home.html");

    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("h1")).toContainText("free plan includes AI");
    await expect(
      page.getByRole("link", { name: "Start for free" }).first(),
    ).toBeVisible();

    const bodyText = await page.locator("body").innerText();
    expect(bodyText).not.toMatch(/Sceneggiatura|Inizia gratis|Accedi/);
  });

  test("has canonical + hreflang tags pointing at both locales", async ({
    page,
  }) => {
    await page.goto("/public-home.html");

    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      "https://ohwriters.com/",
    );
    await expect(
      page.locator('link[rel="alternate"][hreflang="en"]'),
    ).toHaveAttribute("href", "https://ohwriters.com/");
    await expect(
      page.locator('link[rel="alternate"][hreflang="it"]'),
    ).toHaveAttribute("href", "https://ohwriters.com/public-home.it.html");
  });

  test("IT switcher link navigates to the Italian page", async ({ page }) => {
    await page.goto("/public-home.html");

    await page.getByRole("link", { name: "IT", exact: true }).click();
    await expect(page).toHaveURL(/public-home\.it(\.html)?$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "it");
  });
});

test.describe("mobile viewport (390px)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const path of ["/public-home.html", "/public-home.it.html"]) {
    test(`${path} nav fits without horizontal overflow`, async ({ page }) => {
      await page.goto(path);
      // The splash overlay sits above the nav for ~4s; wait it out rather
      // than asserting through it.
      await page.waitForTimeout(4500);

      const nav = page.locator(".nav__inner");
      await expect(nav).toBeVisible();

      const [navBox, viewportWidth] = await Promise.all([
        nav.boundingBox(),
        page.evaluate(() => window.innerWidth),
      ]);
      expect(navBox).not.toBeNull();
      expect(navBox!.x + navBox!.width).toBeLessThanOrEqual(viewportWidth);

      // No horizontal scrollbar anywhere on the page.
      const hasHorizontalOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      expect(hasHorizontalOverflow).toBe(false);
    });
  }
});

test.describe("public-home.it.html (IT)", () => {
  test("loads with Italian content and no leftover English", async ({
    page,
  }) => {
    await page.goto("/public-home.it.html");

    await expect(page.locator("html")).toHaveAttribute("lang", "it");
    await expect(page.locator("h1")).toContainText("piano");
    await expect(
      page.getByRole("link", { name: "Inizia gratis" }).first(),
    ).toBeVisible();

    const bodyText = await page.locator("body").innerText();
    expect(bodyText).not.toMatch(/Screenplay|Start for free|Log in/);
  });

  test("EN switcher link navigates to the English page", async ({ page }) => {
    await page.goto("/public-home.it.html");

    await page.getByRole("link", { name: "EN", exact: true }).click();
    await expect(page).toHaveURL(/public-home(\.html)?$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });
});
