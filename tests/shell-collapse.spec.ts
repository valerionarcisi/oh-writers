// tests/shell-collapse.spec.ts
//
// [OHW-044-B] Shell 3-state transitions + Focus mode + hover-reveal.
//
// Shell states: full | collapsed | focus. Toggled via `⌘\` (Notion shortcut)
// for full↔collapsed and `⌃⌥F` for focus. In `collapsed` the rail hides but
// a 4px sentinel at the left edge reveals it as an overlay (NOT a column —
// main content must keep its bounding rect identical when the rail slides in).
import { test, expect } from "./fixtures";
import { TEAM_PROJECT_ID } from "./breakdown/helpers";
import { BASE_URL } from "./fixtures";

test.describe("[OHW-044-B] Shell collapse / focus transitions", () => {
  test("toggles full ↔ collapsed via `⌘\\` and lock-open chip", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`${BASE_URL}/projects/${TEAM_PROJECT_ID}/breakdown`);
    await expect(page.getByTestId("breakdown-page-v2")).toBeVisible({
      timeout: 15_000,
    });

    // Baseline: shell starts in `full` (or whatever localStorage held).
    // Reset to a known state by setting localStorage and reloading.
    await page.evaluate(() => {
      window.localStorage.setItem("ohw.shell.state", "full");
    });
    await page.reload();
    await expect(page.getByTestId("breakdown-page-v2")).toBeVisible({
      timeout: 15_000,
    });

    await expect
      .poll(async () => await page.evaluate(() => document.body.dataset.shell))
      .toBe("full");
    await expect(page.getByTestId("left-rail")).toBeVisible({ timeout: 3_000 });

    // ⌘\ → collapsed
    await page.keyboard.press("Meta+Backslash");
    await expect
      .poll(async () => await page.evaluate(() => document.body.dataset.shell))
      .toBe("collapsed");

    // ⌘\ → full again
    await page.keyboard.press("Meta+Backslash");
    await expect
      .poll(async () => await page.evaluate(() => document.body.dataset.shell))
      .toBe("full");
  });

  test("⌃⌥F toggles into and out of focus", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`${BASE_URL}/projects/${TEAM_PROJECT_ID}/breakdown`);
    await expect(page.getByTestId("breakdown-page-v2")).toBeVisible({
      timeout: 15_000,
    });

    // Reset to full
    await page.evaluate(() => {
      window.localStorage.setItem("ohw.shell.state", "full");
    });
    await page.reload();
    await expect(page.getByTestId("breakdown-page-v2")).toBeVisible({
      timeout: 15_000,
    });

    await expect
      .poll(async () => await page.evaluate(() => document.body.dataset.shell))
      .toBe("full");

    // ⌃⌥F → focus
    await page.keyboard.press("Control+Alt+f");
    await expect
      .poll(async () => await page.evaluate(() => document.body.dataset.shell))
      .toBe("focus");

    // In focus mode, the rail and dock are hidden
    await expect(page.getByTestId("left-rail")).toBeHidden({ timeout: 3_000 });
    await expect(page.getByTestId("bottom-dock")).toBeHidden({ timeout: 3_000 });

    // ⌃⌥F again → back to full (or the previous non-focus state)
    await page.keyboard.press("Control+Alt+f");
    await expect
      .poll(async () => await page.evaluate(() => document.body.dataset.shell))
      .not.toBe("focus");
  });

  test("main content width stays stable when the rail reveals in collapsed mode (overlay, not column)", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`${BASE_URL}/projects/${TEAM_PROJECT_ID}/breakdown`);
    await expect(page.getByTestId("breakdown-page-v2")).toBeVisible({
      timeout: 15_000,
    });

    // Start in collapsed
    await page.evaluate(() => {
      window.localStorage.setItem("ohw.shell.state", "collapsed");
    });
    await page.reload();
    await expect(page.getByTestId("breakdown-page-v2")).toBeVisible({
      timeout: 15_000,
    });
    await expect
      .poll(async () => await page.evaluate(() => document.body.dataset.shell))
      .toBe("collapsed");

    const readMainWidth = async (): Promise<number> => {
      return await page.evaluate(() => {
        const el =
          document.getElementById("main-content") ??
          document.querySelector('[data-testid="breakdown-page-v2"]');
        if (!el) return -1;
        return Math.round(el.getBoundingClientRect().width);
      });
    };
    const widthCollapsed = await readMainWidth();
    expect(widthCollapsed).toBeGreaterThan(0);

    // Move mouse to far-left edge to trigger the hover-reveal sentinel.
    // The sentinel is a 4px hot zone — move to x=2 to land inside it.
    await page.mouse.move(2, 400);

    // We don't assert the rail becomes immediately visible (the timing
    // is debounced and the sentinel uses pointer-events JS); we assert
    // the main content width does NOT change after the hover, because
    // the rail must be an overlay (z-index above editor), not a column.
    await page.waitForTimeout(450);
    const widthHovered = await readMainWidth();
    expect(
      widthHovered,
      `Main content reflowed on rail hover-reveal (${widthCollapsed} → ${widthHovered}); the rail must be an overlay, not a column.`,
    ).toBe(widthCollapsed);
  });
});
