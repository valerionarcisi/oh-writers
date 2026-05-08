import { expect } from "@playwright/test";
import { test } from "../fixtures";
import { BASE_URL } from "../helpers";
import { navigateToBreakdown, TEAM_PROJECT_ID } from "./helpers";

test.describe("[Spec 10h] Breakdown read-only UX", () => {
  test("[OHW-10h-1] scene heading in breakdown has no menu trigger", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToBreakdown(page, TEAM_PROJECT_ID);
    await expect(page.getByTestId("readonly-screenplay-view")).toBeVisible();

    // ReadOnlyScreenplayView passes { readOnly: true } to createHeadingNodeView,
    // which skips appending the ⋮ button entirely. The element must be absent.
    await expect(page.getByTestId("scene-menu-trigger")).toHaveCount(0);
  });

  test("[OHW-10h-2] reader scroll updates active TOC item", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    // Shrink viewport so the reader overflows by more than one scene height.
    await page.setViewportSize({ width: 1280, height: 400 });
    await navigateToBreakdown(page, TEAM_PROJECT_ID);
    await expect(page.getByTestId("readonly-screenplay-view")).toBeVisible();

    const tocItems = page.getByTestId("breakdown-toc").locator("button");
    const itemCount = await tocItems.count();
    if (itemCount < 2) test.skip(true, "Needs at least 2 scenes seeded");

    // Wait for PM to render headings and for breakdown-script to become scrollable.
    await page
      .locator('[data-testid="readonly-screenplay-view"] .pm-heading')
      .first()
      .waitFor({ state: "visible" });
    await page.waitForFunction(
      () => {
        const el = document.querySelector(
          '[data-testid="breakdown-script"]',
        ) as HTMLElement | null;
        return !!el && el.scrollHeight > el.clientHeight + 200;
      },
      null,
      { timeout: 5000 },
    );

    await page.evaluate(() => {
      const script = document.querySelector(
        '[data-testid="breakdown-script"]',
      ) as HTMLElement;
      script.scrollTop = script.scrollHeight;
      script.dispatchEvent(new Event("scroll", { bubbles: true }));
    });

    // Wait past the 150 ms debounce in ScriptReader.
    await page.waitForTimeout(400);

    // After scrolling past scene 1 the first TOC item must no longer be active.
    const firstIsActive = await tocItems
      .first()
      .evaluate((el) =>
        el.classList.toString().toLowerCase().includes("active"),
      );
    expect(firstIsActive).toBe(false);
  });

  test("[OHW-10h-3] regression: heading in screenplay editor shows menu trigger", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await page.goto(`${BASE_URL}/projects/${TEAM_PROJECT_ID}/screenplay`);

    // Wait for the editable PM editor to mount.
    await expect(page.locator(".ProseMirror").first()).toBeVisible({
      timeout: 15_000,
    });

    // In the editable editor readOnly is false, so the ⋮ button is always
    // appended. Click it (force because it is positioned outside the content flow)
    // and confirm the scene menu appears.
    const trigger = page.getByTestId("scene-menu-trigger").first();
    await expect(trigger).toBeVisible({ timeout: 5_000 });
    await trigger.click({ force: true });

    await expect(page.getByTestId("scene-menu")).toBeVisible();
  });
});
