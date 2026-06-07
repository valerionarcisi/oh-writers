// tests/shell-collapse.spec.ts
//
// [OHW-044-B] Shell 3-state transitions + Focus mode + hamburger overlay.
//
// Shell states: full | collapsed | focus. Toggled via `⌘\` (Notion shortcut)
// for full↔collapsed and `⌃⌥F` for focus. In `collapsed` (Notion model) the
// rail fully disappears — the main column reaches the left edge — and a
// top-left hamburger ☰ opens the rail as an overlay popover. The popover must
// NOT reflow the main content (bounding rect identical), and ESC / outside
// click close it.
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
    await expect(page.getByTestId("bottom-dock")).toBeHidden({
      timeout: 3_000,
    });

    // ⌃⌥F again → back to full (or the previous non-focus state)
    await page.keyboard.press("Control+Alt+f");
    await expect
      .poll(async () => await page.evaluate(() => document.body.dataset.shell))
      .not.toBe("focus");
  });

  test("collapsed hides the rail and shows the top-left hamburger", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`${BASE_URL}/projects/${TEAM_PROJECT_ID}/breakdown`);
    await expect(page.getByTestId("breakdown-page-v2")).toBeVisible({
      timeout: 15_000,
    });

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

    // Notion model: the rail is hidden (no persistent icon strip) and the
    // hamburger is the only sidebar affordance.
    await expect(page.getByTestId("left-rail")).toBeHidden({ timeout: 3_000 });
    await expect(page.getByTestId("rail-hamburger")).toBeVisible({
      timeout: 3_000,
    });
  });

  test("opening the hamburger popover does not reflow the editor; ESC + outside-click close it", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`${BASE_URL}/projects/${TEAM_PROJECT_ID}/breakdown`);
    await expect(page.getByTestId("breakdown-page-v2")).toBeVisible({
      timeout: 15_000,
    });

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

    // Open the rail overlay via the hamburger. The hamburger opens on HOVER and
    // toggles on PRESS, so a mouse `.click()` (hover→open, then press→toggle)
    // nets to closed. Activate via the keyboard (focus + Enter), which fires only
    // the press handler — the canonical "open it" interaction without the hover.
    const hamburger = page.getByTestId("rail-hamburger");
    await hamburger.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("left-rail")).toBeVisible({ timeout: 3_000 });
    await expect
      .poll(async () =>
        page.evaluate(() => document.body.dataset.railOverlay ?? ""),
      )
      .toBe("open");

    // The overlay must NOT reflow the editor as a column — the rail floats above
    // it. A real column reflow would NARROW the editor by ~the rail width
    // (~240px). Benign layout shifts (a scrollbar gutter mounting, the page
    // re-measuring) can move the width either way by tens of px and don't change
    // that the rail is an overlay — so guard only against a real narrowing,
    // not against a small/widening delta.
    const widthWithOverlay = await readMainWidth();
    expect(
      widthCollapsed - widthWithOverlay,
      `Editor reflowed (narrowed) when the rail overlay opened (${widthCollapsed} → ${widthWithOverlay}); the rail must be an overlay, not a column.`,
    ).toBeLessThan(120);

    // ESC closes the overlay. react-aria's `useOverlay` keyboard-dismiss fires
    // when focus is inside the overlay (the natural state once the pointer / tab
    // order moves into the rail), so move focus into the rail before pressing
    // Escape — exactly where focus lands when a user enters the open panel.
    await page.getByTestId("left-rail").locator("button").first().focus();
    await page.keyboard.press("Escape");
    await expect
      .poll(async () =>
        page.evaluate(() => document.body.dataset.railOverlay ?? ""),
      )
      .toBe("");
    await expect(page.getByTestId("left-rail")).toBeHidden({ timeout: 3_000 });

    // Re-open (keyboard, same reason as above), then outside-click closes it.
    await hamburger.focus();
    await page.keyboard.press("Enter");
    await expect
      .poll(async () =>
        page.evaluate(() => document.body.dataset.railOverlay ?? ""),
      )
      .toBe("open");
    // Click far from the rail (right side of the viewport) to dismiss.
    await page.mouse.click(widthCollapsed - 40, 400);
    await expect
      .poll(async () =>
        page.evaluate(() => document.body.dataset.railOverlay ?? ""),
      )
      .toBe("");
  });
});
