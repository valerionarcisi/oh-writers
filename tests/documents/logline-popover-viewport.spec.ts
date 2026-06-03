import { test, expect, TEST_TEAM_PROJECT_ID, BASE_URL } from "../fixtures";

/**
 * Regression for BUG N-16 — the logline popover "opens nothing in some state".
 *
 * Root cause: the shared Popover primitive positioned itself with absolute CSS
 * and a fixed width, with no viewport-collision handling. At 1440 the centred
 * TopBar pill's 480px popover just fit; on any narrower width (a smaller window
 * or a split/peek lane compressing the main lane) it overflowed the right edge
 * and landed off-screen, so clicking the pill appeared to do nothing.
 *
 * The primitive now portals to the body and clamps to the viewport. This test
 * opens the popover at three widths and asserts its bounding box is fully on
 * screen each time.
 */

const SOGGETTO_URL = `${BASE_URL}/projects/${TEST_TEAM_PROJECT_ID}/soggetto`;

const WIDTHS = [
  { label: "desktop", width: 1440, height: 900 },
  { label: "narrow", width: 768, height: 900 },
  { label: "mobile", width: 390, height: 844 },
];

for (const vp of WIDTHS) {
  test(`[documents] logline popover stays inside the viewport at ${vp.label} (${vp.width}px) — N-16`, async ({
    authenticatedPage: page,
  }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto(SOGGETTO_URL);
    await page.waitForLoadState("networkidle");

    const pill = page.getByTestId("narrative-logline-pill");
    await expect(pill).toBeVisible({ timeout: 15_000 });
    await pill.click();

    const editor = page.getByTestId("narrative-logline-editor");
    await expect(editor).toBeVisible({ timeout: 5_000 });

    // Scope to the popover that actually hosts the logline editor — the page
    // can mount other (closed) role=dialog nodes that would match otherwise.
    const dialog = page
      .locator('[role="dialog"]')
      .filter({ has: page.getByTestId("narrative-logline-editor") });
    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    // Fully within the viewport (allow 1px sub-pixel slack on the edges).
    expect(box.x).toBeGreaterThanOrEqual(-1);
    expect(box.y).toBeGreaterThanOrEqual(-1);
    expect(box.x + box.width).toBeLessThanOrEqual(vp.width + 1);
    expect(box.y + box.height).toBeLessThanOrEqual(vp.height + 1);
  });
}
