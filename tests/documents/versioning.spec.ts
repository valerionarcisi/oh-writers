/**
 * Spec 06b (partial) — Universal Document Versioning E2E via VersionsDrawer
 *
 * The narrative versioning today ships as the unified VersionsDrawer
 * (`versions-drawer`) shared with the screenplay. Server exposes only
 * list / create / rename / delete — no createFromScratch, duplicate,
 * restore/switch, or compare. Tests that exercise those missing pieces
 * are kept as `.skip` below and reference the gap.
 *
 * [OHW-248/249] Owner sees a single "Versione 1" row with the Attiva badge
 * [OHW-252]     Inline rename via pencil persists across reload
 * [OHW-254]     Delete button disabled on the only / active version
 * [OHW-255]     Drawer closes on ESC and on ✕
 * Skipped: [OHW-250/251/253/256/257/259/260] — UI/server affordances not built yet.
 */

import { test, expect } from "../fixtures";
import { BASE_URL } from "../helpers";
import type { Page } from "@playwright/test";

const LOGLINE_PATH = (projectId: string) =>
  `${BASE_URL}/projects/${projectId}/logline`;

const openVersionsDrawer = async (page: Page) => {
  const trigger = page.getByTestId("narrative-versions-toggle");
  await expect(trigger).toBeVisible({ timeout: 10_000 });
  await trigger.click();
  await expect(page.getByTestId("versions-drawer")).toBeVisible();
};

test.describe("Universal versioning — narrative", () => {
  test("[OHW-248/249] owner sees exactly one Versione 1 row with the Attiva badge", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    await page.goto(LOGLINE_PATH(testProjectId));
    await expect(page.locator("textarea").first()).toBeVisible({
      timeout: 10_000,
    });

    await openVersionsDrawer(page);

    const rows = page.locator('[data-testid^="version-row-"]');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText(/Versione\s*1|Senza nome/);
    await expect(
      rows.first().locator('[data-testid^="version-badge-active-"]'),
    ).toBeVisible();
  });

  test("[OHW-252] inline rename via pencil persists across reload", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    await page.goto(LOGLINE_PATH(testProjectId));
    await expect(page.locator("textarea").first()).toBeVisible({
      timeout: 10_000,
    });

    await openVersionsDrawer(page);
    const firstRow = page.locator('[data-testid^="version-row-"]').first();
    const testid = await firstRow.getAttribute("data-testid");
    const id = testid?.replace("version-row-", "") ?? "";
    expect(id).not.toBe("");

    await page.getByTestId(`version-rename-${id}`).click();
    const label = `draft-${Date.now()}`;
    const input = page.getByTestId(`version-rename-input-${id}`);
    await input.fill(label);
    await input.press("Enter");

    // Wait for the rename to land before reloading
    await expect(
      page.locator(`[data-testid="version-row-${id}"]`),
    ).toContainText(label, { timeout: 10_000 });

    await page.reload();
    await openVersionsDrawer(page);
    await expect(
      page.locator(`[data-testid="version-row-${id}"]`),
    ).toContainText(label);
  });

  test("[OHW-254] delete disabled on the only / active version", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    await page.goto(LOGLINE_PATH(testProjectId));
    await expect(page.locator("textarea").first()).toBeVisible({
      timeout: 10_000,
    });

    await openVersionsDrawer(page);
    const row = page.locator('[data-testid^="version-row-"]').first();
    const testid = await row.getAttribute("data-testid");
    const id = testid?.replace("version-row-", "") ?? "";
    const deleteBtn = page.getByTestId(`version-delete-${id}`);
    await expect(deleteBtn).toBeDisabled();
    await expect(deleteBtn).toHaveAttribute("title", /Unica versione|attiva/i);
  });

  test("[OHW-255] drawer closes on ESC and on ✕", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    await page.goto(LOGLINE_PATH(testProjectId));
    await expect(page.locator("textarea").first()).toBeVisible({
      timeout: 10_000,
    });

    // ESC
    await openVersionsDrawer(page);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("versions-drawer")).toBeHidden();

    // ✕ close button
    await openVersionsDrawer(page);
    await page
      .getByTestId("versions-drawer")
      .getByRole("button", { name: /chiudi|close/i })
      .click();
    await expect(page.getByTestId("versions-drawer")).toBeHidden();
  });

  test.skip("[OHW-250] 'New version from scratch' empties editor and activates VERSION-2", () => {
    // TODO Spec 06b: server fn `createVersionFromScratch` + UI button in drawer not implemented.
  });

  test.skip("[OHW-251] 'Duplicate current' creates a new version with identical content", () => {
    // TODO Spec 06b: document duplicate server fn + UI button not implemented.
  });

  test.skip("[OHW-253] switching to a previous version loads that content", () => {
    // TODO Spec 06b: document version switch (set active) server fn + UI not implemented.
  });

  test.skip("[OHW-256/260] compare modal renders dual dropdowns and intra-line highlight", () => {
    // TODO Spec 06b: document version compare modal + diff UI not implemented.
  });

  test.skip("[OHW-257] viewer popover shows versions but no mutation controls", () => {
    // TODO Spec 06b: viewer role gating in VersionsList UI not implemented (server enforces).
  });

  test.skip("[OHW-259] server rejects createVersionFromScratch for a viewer", () => {
    // TODO Spec 06b: createVersionFromScratch server fn not implemented.
  });
});
