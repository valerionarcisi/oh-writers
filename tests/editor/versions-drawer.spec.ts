/**
 * Spec 66 — Screenplay Versions (master→detail, routed) E2E.
 *
 * The screenplay shares the unified Versions surface with the narrative docs
 * (Spec 66 / ADR-0004): a routed master→detail SplitDrawer, NO diff, NO
 * segmented "Attuale/Confronta". The screenplay opens it from the TopBar ⋯
 * ("Altre azioni") menu → "Versioni" item, which routes to
 * `?versions=<screenplayId>&vkind=screenplay`. `Attiva` restores the version
 * onto the live screenplay. The detail pane renders the script read-only via
 * ReadOnlyScreenplayView.
 *
 * The retired inline VersionsDrawer (drawer-close / version-row-* / delete +
 * "(copia)" label / view-mode banner) is gone — its capabilities map onto the
 * shared surface here (no delete on the new surface). The shared surface's
 * generic behaviour is also covered for the soggetto doc in
 * tests/versions-master-detail.spec.ts (OHW-066); this file is the
 * screenplay-flavoured coverage.
 *
 * Note: unlike the narrative docs, the screenplay surface has no "active
 * version" pointer — it opens with `?versions&vkind=screenplay` (no `?vcur`),
 * so there is no "current" badge and `Attiva` is a *restore* (copies the
 * version's content back onto the live screenplay), not a pointer switch.
 *
 * [OHW-170] ⋯ → Versioni opens the routed surface; list + "+ Nuova versione";
 *           NO diff/segmented control.
 * [OHW-171] Click a version → read-only detail (script renders) + Indietro.
 * [OHW-172] Duplicate grows the list.
 * [OHW-173] Inline rename persists.
 * [OHW-175] "+ Nuova versione" grows the list.
 * [OHW-176] Attiva (restore) succeeds without error and the surface survives.
 */

import { test, expect } from "../fixtures";
import type { Page } from "@playwright/test";
import { BASE_URL, waitForEditor, openScreenplayActionsMenu } from "../helpers";

// Open the routed Versions surface from the ⋯ menu and wait for the shared
// master→detail drawer to mount.
async function openVersions(page: Page) {
  await openScreenplayActionsMenu(page);
  const item = page.getByTestId("menu-item-versions");
  await expect(item).toBeVisible({ timeout: 5_000 });
  await item.click();
  await expect(page.getByTestId("versions-split-drawer")).toBeVisible({
    timeout: 10_000,
  });
  // The screenplay opened the surface with vkind=screenplay.
  expect(
    await page.evaluate(() => new URL(location.href).searchParams.get("vkind")),
  ).toBe("screenplay");
}

const rows = (page: Page) =>
  page.locator('[data-testid^="versions-split-row-"]');

test.describe("Screenplay Versions — master→detail (Spec 66)", () => {
  test.beforeEach(async ({ authenticatedPage: page, testProjectId }) => {
    await page.goto(`${BASE_URL}/projects/${testProjectId}/screenplay`);
    await waitForEditor(page);
  });

  test("[OHW-170] ⋯ → Versioni opens the surface; list + new affordance; NO diff/segmented", async ({
    authenticatedPage: page,
  }) => {
    await openVersions(page);

    await expect(rows(page).first()).toBeVisible({ timeout: 10_000 });
    // "+ Nuova versione" affordance present.
    await expect(page.getByTestId("version-new")).toBeVisible();

    // Regression (ADR-0004): no segmented control, no diff table.
    await expect(page.getByRole("radiogroup")).toHaveCount(0);
    await expect(page.getByTestId("versions-split-diff")).toHaveCount(0);
    expect(
      await page.evaluate(() =>
        new URL(location.href).searchParams.has("compare"),
      ),
    ).toBe(false);
  });

  test("[OHW-171] click a version → read-only detail renders the script + Indietro returns", async ({
    authenticatedPage: page,
  }) => {
    await openVersions(page);
    await rows(page).first().click();

    await expect(page.getByTestId("versions-split-detail")).toBeVisible();
    await expect(page.getByTestId("versions-split-content")).toBeVisible();

    await page.getByTestId("versions-split-back").click();
    await expect(page.getByTestId("versions-split-list")).toBeVisible();
  });

  test("[OHW-172] duplicate creates a new version (row count grows)", async ({
    authenticatedPage: page,
  }) => {
    await openVersions(page);
    await expect(rows(page).first()).toBeVisible({ timeout: 10_000 });
    const before = await rows(page).count();

    const firstId = (await rows(page)
      .first()
      .getAttribute("data-testid"))!.replace("versions-split-row-", "");
    await page.getByTestId(`version-duplicate-${firstId}`).click();

    await expect
      .poll(async () => rows(page).count(), { timeout: 10_000 })
      .toBe(before + 1);
  });

  test("[OHW-173] inline rename persists", async ({
    authenticatedPage: page,
  }) => {
    await openVersions(page);
    await expect(rows(page).first()).toBeVisible({ timeout: 10_000 });

    const firstId = (await rows(page)
      .first()
      .getAttribute("data-testid"))!.replace("versions-split-row-", "");
    await page.getByTestId(`version-rename-${firstId}`).click();
    const label = `bozza-${Date.now()}`;
    const input = page.getByTestId(`version-rename-input-${firstId}`);
    await input.fill(label);
    await input.press("Enter");

    await expect(
      page.getByTestId(`versions-split-row-${firstId}`),
    ).toContainText(label, { timeout: 8_000 });
  });

  test("[OHW-175] '+ Nuova versione' creates a version (row count grows)", async ({
    authenticatedPage: page,
  }) => {
    await openVersions(page);
    await expect(rows(page).first()).toBeVisible({ timeout: 10_000 });
    const before = await rows(page).count();

    await page.getByTestId("version-new").click();

    await expect
      .poll(async () => rows(page).count(), { timeout: 10_000 })
      .toBe(before + 1);
  });

  test("[OHW-176] Attiva (restore) succeeds and the surface survives", async ({
    authenticatedPage: page,
  }) => {
    await openVersions(page);
    await expect(rows(page).first()).toBeVisible({ timeout: 10_000 });

    // Restore the first version onto the live screenplay. There is no current
    // pointer to move — the contract is that the restore mutation lands and the
    // surface stays usable (no error, list still rendered).
    const activate = page.locator('[data-testid^="version-activate-"]').first();
    await expect(activate).toBeVisible({ timeout: 10_000 });
    const targetId = (await activate.getAttribute("data-testid"))!.replace(
      "version-activate-",
      "",
    );

    const [resp] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes("restoreVersion") && r.request().method() === "POST",
        { timeout: 10_000 },
      ),
      page.getByTestId(`version-activate-${targetId}`).click(),
    ]);
    expect(resp.ok()).toBe(true);

    // The surface is still mounted and the list still shows the versions.
    await expect(page.getByTestId("versions-split-drawer")).toBeVisible();
    await expect(rows(page).first()).toBeVisible();
  });
});
