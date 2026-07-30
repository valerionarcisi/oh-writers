import { expect } from "@playwright/test";
import { test } from "./fixtures";
import { BASE_URL } from "./fixtures";

/**
 * #112 — the PWA is runtime #2 in docs/conventions/platform-reach.md (iPad with
 * a keyboard), but neither a manifest nor the iOS meta tags existed. This is the
 * installability contract: a broken manifest fails silently — the browser just
 * declines to offer "Add to Home Screen", with nothing in the console.
 *
 * Offline behaviour is deliberately NOT covered here: no service worker ships
 * yet (see the issue — caching server-fn responses would resurrect the staleness
 * bugs #111 just fixed).
 */
test.describe("#112 PWA installability", () => {
  test("the manifest is served and describes an installable app", async ({
    page,
  }) => {
    const res = await page.request.get(`${BASE_URL}/manifest.webmanifest`);
    expect(res.ok()).toBe(true);

    const manifest = (await res.json()) as {
      name?: string;
      start_url?: string;
      display?: string;
      icons?: Array<{ src: string; purpose?: string }>;
    };

    expect(manifest.name).toBeTruthy();
    // standalone is what removes the browser chrome; without it an install is
    // just a bookmark.
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBeTruthy();

    // At least one maskable icon, or Android crops the mark badly.
    const maskable = (manifest.icons ?? []).filter((i) =>
      (i.purpose ?? "").includes("maskable"),
    );
    expect(maskable.length).toBeGreaterThan(0);
  });

  test("every icon the manifest declares actually resolves", async ({
    page,
  }) => {
    // A 404 icon is the most common way an install prompt silently never
    // appears.
    const manifest = (await (
      await page.request.get(`${BASE_URL}/manifest.webmanifest`)
    ).json()) as { icons?: Array<{ src: string }> };

    for (const icon of manifest.icons ?? []) {
      const iconRes = await page.request.get(`${BASE_URL}${icon.src}`);
      expect(iconRes.ok(), `${icon.src} should resolve`).toBe(true);
    }
  });

  test("the document links the manifest and carries the iOS tags", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`${BASE_URL}/dashboard`);

    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
      "href",
      "/manifest.webmanifest",
    );
    // iOS ignores most of the manifest; these are what make it behave.
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
    await expect(
      page.locator('meta[name="apple-mobile-web-app-capable"]'),
    ).toHaveAttribute("content", "yes");
    // viewport-fit=cover pairs with the safe-area padding in global.css.
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
      "content",
      /viewport-fit=cover/,
    );
  });
});
