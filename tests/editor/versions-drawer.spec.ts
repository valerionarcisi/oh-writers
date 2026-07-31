/**
 * Spec 66 — Screenplay Versions (master→detail, routed) E2E.
 *
 * The screenplay shares the unified Versions surface with the narrative docs
 * (Spec 66 / ADR-0004): a routed master→detail SplitDrawer, NO diff, NO
 * segmented "Attuale/Confronta". The screenplay opens it from the unified TopBar
 * version chip (`topbar-version-chip`) — the single entry point everywhere; the
 * old ⋯ ("Altre azioni") menu "Versioni" item is retired. The chip routes to
 * `?versions=<screenplayId>&vkind=screenplay`. `Attiva` restores the version
 * onto the live screenplay. The detail pane renders the script read-only via
 * ReadOnlyScreenplayView.
 *
 * The retired inline VersionsDrawer (drawer-close / version-row-* / delete +
 * "(copia)" label / view-mode banner) is gone — its capabilities map onto the
 * shared surface here (no delete on the new surface). The shared surface's
 * generic behaviour is also covered for the soggetto doc in
 * tests/versions-master-detail.spec.ts (066); this file is the
 * screenplay-flavoured coverage.
 *
 * Note: unlike the narrative docs, the screenplay surface has no "active
 * version" pointer — it opens with `?versions&vkind=screenplay` (no `?vcur`),
 * so there is no "current" badge and `Attiva` is a *restore* (copies the
 * version's content back onto the live screenplay), not a pointer switch.
 *
 * [170] ⋯ → Versioni opens the routed surface; list + "+ Nuova versione";
 *           NO diff/segmented control.
 * [171] Click a version → read-only detail (script renders) + Indietro.
 * [172] Duplicate grows the list.
 * [173] Inline rename persists.
 * [175] "+ Nuova versione" grows the list (snapshot-then-blank: a new
 *           version on non-empty content may add the snapshot + the blank one).
 * [176] Attiva sets the current pointer — the "Attuale" badge moves.
 * [177] The current version has NO delete button; a non-current one deletes
 *           (with a confirm) and the surface stays coherent (regression: a
 *           deleted version must not leave an orphaned detail pane).
 */

import { test, expect } from "../fixtures";
import type { Page } from "@playwright/test";
import { BASE_URL, waitForEditor } from "../helpers";

// Open the routed Versions surface from the unified TopBar version chip (the
// single entry point) and wait for the shared master→detail drawer to mount.
async function openVersions(page: Page) {
  const chip = page.getByTestId("topbar-version-chip");
  await expect(chip).toBeVisible({ timeout: 15_000 });
  await chip.click();
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

  test("[170] ⋯ → Versioni opens the surface; list + new affordance; NO diff/segmented", async ({
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

  test("[171] click a version → read-only detail renders the script + Indietro returns", async ({
    authenticatedPage: page,
  }) => {
    await openVersions(page);
    await expect(rows(page).first()).toBeVisible({ timeout: 10_000 });

    // The detail needs a NON-current row: the current version's detail would only
    // show the script already open in the editor with no action available, so
    // that row is deliberately not a navigation target (#94). The fixture opens
    // with a single (current) version, so duplicate it to get a second one.
    const target = page.locator(
      '[data-testid^="versions-split-row-"]:not([data-current="true"])',
    );
    if ((await target.count()) === 0) {
      const firstId = (await rows(page)
        .first()
        .getAttribute("data-testid"))!.replace("versions-split-row-", "");
      await page.getByTestId(`version-duplicate-${firstId}`).click();
      await expect.poll(async () => target.count(), { timeout: 8_000 }).toBe(1);
    }
    await target.first().click();

    await expect(page.getByTestId("versions-split-detail")).toBeVisible();
    await expect(page.getByTestId("versions-split-content")).toBeVisible();

    await page.getByTestId("versions-split-back").click();
    await expect(page.getByTestId("versions-split-list")).toBeVisible();
  });

  test("[172] duplicate creates a new version (row count grows)", async ({
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

  test("[173] inline rename persists", async ({ authenticatedPage: page }) => {
    await openVersions(page);
    await expect(rows(page).first()).toBeVisible({ timeout: 10_000 });

    const firstId = (await rows(page)
      .first()
      .getAttribute("data-testid"))!.replace("versions-split-row-", "");
    await page.getByTestId(`version-rename-${firstId}`).click();
    const label = `bozza-${Date.now()}`;
    const input = page.getByTestId(`version-rename-input-${firstId}`);
    // #58 Bug A: clicking into the field must not activate the row (the input
    // used to be a child of the row button, whose activation opened the detail).
    await input.click();
    await expect(page.getByTestId("versions-split-detail")).toHaveCount(0);
    await input.fill(label);
    await input.press("Enter");

    // #58 Bug B: the label element holds EXACTLY the typed text — the "(vN)"
    // decoration is a separate element, never stored into the user's name.
    await expect(page.getByTestId(`version-label-${firstId}`)).toHaveText(
      label,
      { timeout: 8_000 },
    );
    await expect(page.getByTestId(`version-number-${firstId}`)).toHaveText(
      /^v\d+$/,
    );
    await expect(page.getByTestId("versions-split-detail")).toHaveCount(0);
  });

  test("Escape cancels the rename WITHOUT closing the Versions panel", async ({
    authenticatedPage: page,
  }) => {
    // The rename input handled Escape but let the event bubble, so the lane's
    // dismiss handler fired too: cancelling a rename dropped the writer back on
    // the bare editor and they had to reopen the panel and find their place
    // again. Escape belongs to the field it was typed in.
    await openVersions(page);
    await expect(rows(page).first()).toBeVisible({ timeout: 10_000 });

    const firstId = (await rows(page)
      .first()
      .getAttribute("data-testid"))!.replace("versions-split-row-", "");
    const before = await page
      .getByTestId(`versions-split-row-${firstId}`)
      .textContent();

    await page.getByTestId(`version-rename-${firstId}`).click();
    const input = page.getByTestId(`version-rename-input-${firstId}`);
    await input.fill("scartami");
    await input.press("Escape");

    // The panel is still open…
    await expect(page.getByTestId("versions-split-drawer")).toBeVisible();
    expect(
      await page.evaluate(() =>
        new URL(location.href).searchParams.get("versions"),
      ),
    ).not.toBeNull();
    // …the edit was discarded, and the field is gone.
    await expect(input).toBeHidden();
    await expect(
      page.getByTestId(`versions-split-row-${firstId}`),
    ).not.toContainText("scartami");
    expect(
      await page.getByTestId(`versions-split-row-${firstId}`).textContent(),
    ).toBe(before);
  });

  test("[175] '+ Nuova versione' creates a version (row count grows)", async ({
    authenticatedPage: page,
  }) => {
    await openVersions(page);
    await expect(rows(page).first()).toBeVisible({ timeout: 10_000 });
    const before = await rows(page).count();

    await page.getByTestId("version-new").click();

    // snapshot-then-blank: on non-empty content "+ Nuova versione" snapshots the
    // current draft AND adds the new blank version, so the list can grow by 2.
    // Assert it grew (≥ +1) rather than an exact count.
    await expect
      .poll(async () => rows(page).count(), { timeout: 10_000 })
      .toBeGreaterThan(before);
  });

  test("[176] Attiva (restore) succeeds and the surface survives", async ({
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

    // Activating sets the current pointer: the activated version now carries the
    // "Attuale" badge and exactly one version is current.
    await expect(
      page.getByTestId(`versions-split-current-${targetId}`),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.locator('[data-testid^="versions-split-current-"]'),
    ).toHaveCount(1);
  });

  test("[177] the current version has no delete button; a non-current one deletes", async ({
    authenticatedPage: page,
  }) => {
    await openVersions(page);
    // Ensure ≥2 versions so there's a non-current one to delete.
    if ((await rows(page).count()) < 2) {
      await page.getByTestId("version-new").click();
      await expect
        .poll(async () => rows(page).count(), { timeout: 10_000 })
        .toBeGreaterThanOrEqual(2);
    }

    // The current version (carries the badge) must NOT expose a delete button.
    const currentBadge = page
      .locator('[data-testid^="versions-split-current-"]')
      .first();
    await expect(currentBadge).toBeVisible({ timeout: 10_000 });
    const currentId = (await currentBadge.getAttribute("data-testid"))!.replace(
      "versions-split-current-",
      "",
    );
    await expect(page.getByTestId(`version-delete-${currentId}`)).toHaveCount(
      0,
    );

    // A non-current version DOES expose delete. Confirm the dialog and verify the
    // row disappears AND the surface stays coherent (no dead detail pane).
    const deleteBtn = page.locator('[data-testid^="version-delete-"]').first();
    await expect(deleteBtn).toBeVisible({ timeout: 10_000 });
    const targetId = (await deleteBtn.getAttribute("data-testid"))!.replace(
      "version-delete-",
      "",
    );
    const before = await rows(page).count();
    await deleteBtn.click();
    // Our own confirm modal (not the native window.confirm) — accept the
    // visible one (the dialog primitive keeps a hidden instance mounted).
    await page
      .getByTestId("confirm-dialog-confirm-btn")
      .filter({ visible: true })
      .click();

    await expect
      .poll(async () => rows(page).count(), { timeout: 10_000 })
      .toBe(before - 1);
    await expect(
      page.getByTestId(`versions-split-row-${targetId}`),
    ).toHaveCount(0);
    // Regression: the surface stays on the list (no orphaned detail of the
    // deleted version) and is still usable.
    await expect(page.getByTestId("versions-split-list")).toBeVisible();
  });
});
