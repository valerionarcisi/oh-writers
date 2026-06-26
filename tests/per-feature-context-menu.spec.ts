// tests/per-feature-context-menu.spec.ts
//
// [067] The per-feature TopBar `⋯` menu — uniform across pages, export from
// the existing backends, NO versions on production pages (Spec 67). The menu
// lives in the TopBar actions slot; each page publishes its own items from the
// shared registry.
import { test, expect, TEST_TEAM_PROJECT_ID } from "./fixtures";
import { BASE_URL } from "./fixtures";
import type { Page } from "@playwright/test";

const proj = (seg: string) =>
  `${BASE_URL}/projects/${TEST_TEAM_PROJECT_ID}/${seg}`;

// Open the `⋯` ("Altre azioni") menu and return its item labels.
const openMenuItems = async (page: Page): Promise<string[]> => {
  const trigger = page.getByLabel("Altre azioni");
  await expect(trigger).toBeVisible({ timeout: 15_000 });
  await trigger.click();
  const items = page.getByRole("menuitem");
  await expect(items.first()).toBeVisible({ timeout: 5_000 });
  return items.allTextContents();
};

test.describe("[067] per-feature ⋯ menus", () => {
  test("budget: ⋯ has Esporta, NO Versioni; opens the export modal", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(proj("budget"));
    await expect(page.getByTestId("budget-page-v2")).toBeVisible({
      timeout: 15_000,
    });
    const items = await openMenuItems(page);
    expect(items.some((l) => /esporta/i.test(l))).toBe(true);
    expect(items.some((l) => /versioni/i.test(l))).toBe(false);

    await page
      .getByRole("menuitem", { name: /esporta/i })
      .first()
      .click();
    // The budget export modal opens (named dialog — there can be >1 dialog node).
    await expect(
      page.getByRole("dialog", { name: /esporta budget/i }),
    ).toBeVisible({ timeout: 5_000 });
  });

  test("schedule: ⋯ lists both exports (Esporta + Stampa), NO Versioni", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(proj("schedule"));
    await expect(page.getByTestId("schedule-page-v2")).toBeVisible({
      timeout: 15_000,
    });
    const items = await openMenuItems(page);
    expect(items.some((l) => /esporta/i.test(l))).toBe(true);
    expect(items.some((l) => /stampa/i.test(l))).toBe(true);
    expect(items.some((l) => /versioni/i.test(l))).toBe(false);
  });

  test("locations: ⋯ has Esporta, NO Versioni", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(proj("locations"));
    const items = await openMenuItems(page);
    expect(items.some((l) => /esporta/i.test(l))).toBe(true);
    expect(items.some((l) => /versioni/i.test(l))).toBe(false);
  });

  test("breakdown: ⋯ has an export, NO Versioni", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(proj("breakdown"));
    const items = await openMenuItems(page);
    expect(items.some((l) => /esporta|csv/i.test(l))).toBe(true);
    expect(items.some((l) => /versioni/i.test(l))).toBe(false);
  });

  test("regression: the legacy floating versions drawer is gone", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(proj("budget"));
    await expect(page.getByTestId("budget-page-v2")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("versions-drawer")).toHaveCount(0);
  });
});
