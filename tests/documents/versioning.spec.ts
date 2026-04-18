/**
 * Spec 06b (partial) — Universal Document Versioning E2E via VersionsDrawer
 *
 * The narrative versioning today ships as the unified VersionsDrawer
 * (`versions-drawer`) shared with the screenplay. Server exposes
 * list / create / rename / delete / createFromScratch / duplicate /
 * switchTo / compare.
 *
 * [OHW-248/249] Owner sees a single "Versione 1" row with the Attiva badge
 * [OHW-250]     New version from scratch → editor empties, VERSION-2 active
 * [OHW-251]     Duplicate current → new version with identical content, active
 * [OHW-252]     Inline rename via pencil persists across reload
 * [OHW-253]     Switch to previous version → editor reloads that content
 * [OHW-254]     Delete button disabled on the only / active version
 * [OHW-255]     Drawer closes on ESC and on ✕
 * [OHW-256/260] Compare modal: two dropdowns, diff rows, intra-line highlight
 * [OHW-257]     Viewer sees no mutation controls in the drawer
 * [OHW-259]     Server rejects createVersionFromScratch for a viewer
 */

import { test, expect, TEST_TEAM_PROJECT_ID } from "../fixtures";
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

  test("[OHW-250] 'New version from scratch' empties editor and activates VERSION-2", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    await page.goto(LOGLINE_PATH(testProjectId));
    await expect(page.locator("textarea").first()).toBeVisible({
      timeout: 10_000,
    });

    await openVersionsDrawer(page);

    const scratchBtn = page.getByTestId("versions-new-scratch");
    await expect(scratchBtn).toBeVisible();
    await scratchBtn.click();

    // Wait for VERSION-2 to appear in the list
    const rows = page.locator('[data-testid^="version-row-"]');
    await expect(rows).toHaveCount(2, { timeout: 10_000 });

    // The newest version (first row, highest number) should be active
    const firstRow = rows.first();
    const testid = await firstRow.getAttribute("data-testid");
    const newId = testid?.replace("version-row-", "") ?? "";
    expect(newId).not.toBe("");
    await expect(
      page.getByTestId(`version-badge-active-${newId}`),
    ).toBeVisible();

    // Close the drawer and verify the editor is empty
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("versions-drawer")).toBeHidden();
    await expect(page.locator("textarea").first()).toHaveValue("", {
      timeout: 10_000,
    });
  });

  test("[OHW-251] 'Duplicate current' creates a new version with identical content", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    await page.goto(LOGLINE_PATH(testProjectId));
    const textarea = page.locator("textarea").first();
    await expect(textarea).toBeVisible({ timeout: 10_000 });

    // Capture initial content from VERSION-1
    const initialContent = await textarea.inputValue();

    await openVersionsDrawer(page);

    const firstRow = page.locator('[data-testid^="version-row-"]').first();
    const testid = await firstRow.getAttribute("data-testid");
    const sourceId = testid?.replace("version-row-", "") ?? "";
    expect(sourceId).not.toBe("");

    const dupBtn = page.getByTestId(`version-duplicate-${sourceId}`);
    await expect(dupBtn).toBeVisible();
    await dupBtn.click();

    // Wait for the duplicate (VERSION-2) to appear
    const rows = page.locator('[data-testid^="version-row-"]');
    await expect(rows).toHaveCount(2, { timeout: 10_000 });

    // New version is now active (first row, highest number)
    const newRow = rows.first();
    const newTestid = await newRow.getAttribute("data-testid");
    const newId = newTestid?.replace("version-row-", "") ?? "";
    await expect(
      page.getByTestId(`version-badge-active-${newId}`),
    ).toBeVisible();

    // Close drawer — content should be identical to VERSION-1 content
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("versions-drawer")).toBeHidden();
    await expect(textarea).toHaveValue(initialContent, { timeout: 10_000 });
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

  test("[OHW-253] switching to a previous version loads that content", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    await page.goto(LOGLINE_PATH(testProjectId));
    const textarea = page.locator("textarea").first();
    await expect(textarea).toBeVisible({ timeout: 10_000 });

    // Record VERSION-1 content
    const v1Content = await textarea.inputValue();

    // Create VERSION-2 from scratch (empty)
    await openVersionsDrawer(page);
    await page.getByTestId("versions-new-scratch").click();
    const rows = page.locator('[data-testid^="version-row-"]');
    await expect(rows).toHaveCount(2, { timeout: 10_000 });

    // Close drawer, editor should be empty (VERSION-2 has no content)
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("versions-drawer")).toBeHidden();
    await expect(textarea).toHaveValue("", { timeout: 10_000 });

    // Re-open drawer, click VERSION-1 (last row — ordered desc by number)
    await openVersionsDrawer(page);
    const v1Row = page.locator('[data-testid^="version-row-"]').last();
    const v1Testid = await v1Row.getAttribute("data-testid");
    const v1Id = v1Testid?.replace("version-row-", "") ?? "";
    await v1Row.click();

    // Wait for VERSION-1 to become active (badge updates after switchToVersion
    // mutation succeeds and query invalidation + document refetch complete).
    await page.waitForResponse(
      (r) =>
        r.url().includes("switchToVersion") && r.request().method() === "POST",
      { timeout: 10_000 },
    );
    await expect(page.getByTestId(`version-badge-active-${v1Id}`)).toBeVisible({
      timeout: 10_000,
    });

    // Close drawer — content must match VERSION-1
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("versions-drawer")).toBeHidden();
    await expect(textarea).toHaveValue(v1Content, { timeout: 10_000 });
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

  test("[OHW-256/260] compare modal renders dual dropdowns and intra-line highlight", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    await page.goto(LOGLINE_PATH(testProjectId));
    const textarea = page.locator("textarea").first();
    await expect(textarea).toBeVisible({ timeout: 10_000 });

    // Write known content to VERSION-1 via the E2E hook
    await page.waitForFunction(
      () =>
        typeof (window as unknown as { __ohWritersSaveDocumentRaw?: unknown })
          .__ohWritersSaveDocumentRaw === "function",
      undefined,
      { timeout: 10_000 },
    );
    await page.evaluate(() => {
      (
        window as unknown as {
          __ohWritersSaveDocumentRaw: (content: string) => void;
        }
      ).__ohWritersSaveDocumentRaw("The cat sat on the mat");
    });
    // Wait for save to land
    await page.waitForResponse(
      (resp) =>
        resp.url().includes("saveDocument") &&
        resp.request().method() === "POST",
      { timeout: 10_000 },
    );

    // Create VERSION-2 from scratch (empty)
    await openVersionsDrawer(page);
    await page.getByTestId("versions-new-scratch").click();
    await expect(page.locator('[data-testid^="version-row-"]')).toHaveCount(2, {
      timeout: 10_000,
    });

    // Write different content to VERSION-2 via the E2E hook
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("versions-drawer")).toBeHidden();
    await page.evaluate(() => {
      (
        window as unknown as {
          __ohWritersSaveDocumentRaw: (content: string) => void;
        }
      ).__ohWritersSaveDocumentRaw("The dog sat on the mat");
    });
    await page.waitForResponse(
      (resp) =>
        resp.url().includes("saveDocument") &&
        resp.request().method() === "POST",
      { timeout: 10_000 },
    );

    // Open the compare modal
    await openVersionsDrawer(page);
    const compareTrigger = page.getByTestId("versions-compare-trigger");
    await expect(compareTrigger).toBeVisible();
    await compareTrigger.click();

    // Modal should be visible with both selectors
    const modal = page.getByTestId("version-compare-modal");
    await expect(modal).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId("version-compare-left")).toBeVisible();
    await expect(page.getByTestId("version-compare-right")).toBeVisible();

    // Diff area should contain rows
    const diffArea = page.getByTestId("version-compare-diff");
    await expect(diffArea).toBeVisible();
    await expect(diffArea.locator("tr")).not.toHaveCount(0);

    // Intra-line highlight: "cat" and "dog" should be in changed segments
    const changedSegments = diffArea.locator("[data-diff-changed]");
    await expect(changedSegments).not.toHaveCount(0);
    const texts = await changedSegments.allTextContents();
    const joined = texts.join("");
    expect(joined).toMatch(/cat|dog/i);

    // Close modal via ESC
    await page.keyboard.press("Escape");
    await expect(modal).toBeHidden();
  });

  test("[OHW-257] viewer sees no mutation controls in the versions drawer", async ({
    authenticatedViewerPage: page,
  }) => {
    await page.goto(LOGLINE_PATH(TEST_TEAM_PROJECT_ID));
    await expect(page.locator("textarea").first()).toBeVisible({
      timeout: 10_000,
    });

    await openVersionsDrawer(page);

    // Viewer CAN see the list (reads are allowed)
    const rows = page.locator('[data-testid^="version-row-"]');
    await expect(rows).not.toHaveCount(0, { timeout: 10_000 });

    const firstId =
      (await rows.first().getAttribute("data-testid"))?.replace(
        "version-row-",
        "",
      ) ?? "";

    // No "new from scratch" button
    await expect(page.getByTestId("versions-new-scratch")).toHaveCount(0);
    // No "new version" trigger
    await expect(page.getByTestId("versions-new-trigger")).toHaveCount(0);
    // No rename pencil
    await expect(page.getByTestId(`version-rename-${firstId}`)).toHaveCount(0);
    // No delete button
    await expect(page.getByTestId(`version-delete-${firstId}`)).toHaveCount(0);
    // No duplicate button
    await expect(page.getByTestId(`version-duplicate-${firstId}`)).toHaveCount(
      0,
    );
  });

  test("[OHW-259] server rejects createVersionFromScratch for a viewer", async ({
    authenticatedViewerPage: page,
  }) => {
    await page.goto(LOGLINE_PATH(TEST_TEAM_PROJECT_ID));
    await expect(page.locator("textarea").first()).toBeVisible({
      timeout: 10_000,
    });

    // Wait for the E2E hook installed by NarrativeEditor
    await page.waitForFunction(
      () =>
        typeof (
          window as unknown as {
            __ohWritersCreateVersionFromScratch?: unknown;
          }
        ).__ohWritersCreateVersionFromScratch === "function",
      undefined,
      { timeout: 10_000 },
    );

    // Call the server function directly from the viewer context
    await page.evaluate(() => {
      void (
        window as unknown as {
          __ohWritersCreateVersionFromScratch: () => Promise<unknown>;
        }
      ).__ohWritersCreateVersionFromScratch();
    });

    // Intercept the server response and assert ForbiddenError
    const resp = await page.waitForResponse(
      (r) =>
        r.url().includes("createVersionFromScratch") &&
        r.request().method() === "POST",
      { timeout: 10_000 },
    );

    const raw = await resp.text();
    const body = JSON.parse(raw) as unknown;

    const findShape = (
      input: unknown,
    ): { isOk: boolean; error?: { _tag?: string } } | null => {
      if (!input || typeof input !== "object") return null;
      const o = input as Record<string, unknown>;
      if ("isOk" in o && typeof o["isOk"] === "boolean") {
        return o as { isOk: boolean; error?: { _tag?: string } };
      }
      for (const v of Object.values(o)) {
        const found = findShape(v);
        if (found) return found;
      }
      return null;
    };

    const shape = findShape(body);
    expect(shape, `no ResultShape in: ${raw}`).not.toBeNull();
    expect(shape!.isOk).toBe(false);
    expect(shape!.error?._tag).toBe("ForbiddenError");
  });
});
