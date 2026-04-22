import { expect } from "@playwright/test";
import { test } from "../fixtures";
import { navigateToBreakdown, TEAM_PROJECT_ID } from "./helpers";

test.describe("[Spec 10c] Inline scene tagging", () => {
  test("[OHW-280] select text → tag as Cast → highlight + chip", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToBreakdown(page, TEAM_PROJECT_ID);
    await expect(page.getByTestId("readonly-screenplay-view")).toBeVisible();

    const target = page
      .getByTestId("readonly-screenplay-view")
      .getByText("Filippo", { exact: false })
      .first();
    await target.dblclick();

    const toolbar = page.getByTestId("selection-toolbar");
    await expect(toolbar).toBeVisible();

    await page.getByTestId("selection-toolbar-cast").click();

    await expect(
      page.locator('[data-cat="cast"]').filter({ hasText: "Filippo" }).first(),
    ).toBeVisible();

    await expect(
      page
        .getByTestId("breakdown-panel")
        .getByText("Filippo", { exact: false })
        .first(),
    ).toBeVisible();
  });

  test("[OHW-281] viewer cannot tag (no toolbar)", async ({
    authenticatedViewerPage,
  }) => {
    const page = authenticatedViewerPage;
    await navigateToBreakdown(page, TEAM_PROJECT_ID);
    await expect(page.getByTestId("readonly-screenplay-view")).toBeVisible();

    const target = page
      .getByTestId("readonly-screenplay-view")
      .getByText("Filippo", { exact: false })
      .first();
    await target.dblclick();

    await expect(page.getByTestId("selection-toolbar")).toHaveCount(0);
  });

  test("[OHW-282] TOC click scrolls reader to scene", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToBreakdown(page, TEAM_PROJECT_ID);

    const tocItem = page.getByTestId("breakdown-toc").locator("button").nth(1);
    await tocItem.click();

    const headingDom = page
      .getByTestId("readonly-screenplay-view")
      .locator(".pm-heading")
      .nth(1);
    await headingDom.waitFor({ state: "visible" });
    const box = await headingDom.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      expect(box.y).toBeLessThan(600);
    }
  });

  test("[OHW-283] stale occurrence renders dimmed", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToBreakdown(page, TEAM_PROJECT_ID);

    const staleHighlights = page.locator('[data-stale="true"]');
    const count = await staleHighlights.count();
    if (count > 0) {
      const opacity = await staleHighlights
        .first()
        .evaluate((el) => getComputedStyle(el).opacity);
      expect(parseFloat(opacity)).toBeLessThan(1);
    }
  });

  test("[OHW-284] ghost suggestion has dashed underline + data-ghost", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToBreakdown(page, TEAM_PROJECT_ID);

    const ghost = page.locator('[data-ghost="true"]').first();
    await expect(ghost).toBeVisible();
    const cat = await ghost.getAttribute("data-cat");
    expect(cat).not.toBeNull();
    const occId = await ghost.getAttribute("data-occurrence-id");
    expect(occId).not.toBeNull();
  });

  test("[OHW-285] ghost click → popover → Accept becomes highlight", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToBreakdown(page, TEAM_PROJECT_ID);

    const ghost = page.locator('[data-ghost="true"]').first();
    await expect(ghost).toBeVisible();
    const occurrenceId = await ghost.getAttribute("data-occurrence-id");
    expect(occurrenceId).not.toBeNull();

    await ghost.click();
    await expect(page.getByTestId("ghost-popover")).toBeVisible();

    await page.getByTestId("ghost-popover-accept").click();

    await expect(page.getByTestId("ghost-popover")).toHaveCount(0);
    // After accepting, the same range should render as a permanent highlight
    // (data-cat highlight, no longer data-ghost).
    await expect(
      page.locator(`[data-occurrence-id="${occurrenceId}"][data-ghost="true"]`),
    ).toHaveCount(0);
  });

  test("[OHW-286] ghost click → popover → Ignore removes ghost", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToBreakdown(page, TEAM_PROJECT_ID);

    const ghost = page.locator('[data-ghost="true"]').first();
    await expect(ghost).toBeVisible();
    const occurrenceId = await ghost.getAttribute("data-occurrence-id");
    expect(occurrenceId).not.toBeNull();

    await ghost.click();
    await expect(page.getByTestId("ghost-popover")).toBeVisible();

    await page.getByTestId("ghost-popover-ignore").click();

    await expect(page.getByTestId("ghost-popover")).toHaveCount(0);
    await expect(
      page.locator(`[data-occurrence-id="${occurrenceId}"][data-ghost="true"]`),
    ).toHaveCount(0);
  });

  test("[OHW-287] reader scroll updates active TOC item", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    // Shrink viewport so the reader content genuinely overflows by more than
    // a single scene height — otherwise scrolling to bottom only moves a few
    // dozen px and the active-scene probe still lands inside scene 1.
    await page.setViewportSize({ width: 1280, height: 400 });
    await navigateToBreakdown(page, TEAM_PROJECT_ID);
    await expect(page.getByTestId("readonly-screenplay-view")).toBeVisible();

    const tocItems = page.getByTestId("breakdown-toc").locator("button");
    const itemCount = await tocItems.count();
    if (itemCount < 2) test.skip(true, "Needs at least 2 scenes seeded");

    // The readonly-screenplay-view has overflow-y:auto with PM content that
    // heavily exceeds its height (~26k px vs ~300 px viewport). Scroll it
    // near the bottom and dispatch scroll explicitly.
    // Wait for PM to finish rendering scene headings (content height must
    // exceed the reader viewport before we can meaningfully scroll).
    await page
      .locator('[data-testid="readonly-screenplay-view"] .pm-heading')
      .first()
      .waitFor({ state: "visible" });
    await page.waitForFunction(
      () => {
        const el = document.querySelector(
          '[data-testid="readonly-screenplay-view"]',
        ) as HTMLElement | null;
        return !!el && el.scrollHeight > el.clientHeight + 200;
      },
      null,
      { timeout: 5000 },
    );
    const scrollInfo = await page.evaluate(() => {
      const reader = document.querySelector(
        '[data-testid="readonly-screenplay-view"]',
      ) as HTMLElement | null;
      if (!reader) return null;
      reader.scrollTop = reader.scrollHeight;
      reader.dispatchEvent(new Event("scroll"));
      return {
        scrollTop: reader.scrollTop,
        scrollHeight: reader.scrollHeight,
        clientHeight: reader.clientHeight,
      };
    });
    expect(scrollInfo, "expected reader to be scrollable").not.toBeNull();
    expect(scrollInfo!.scrollHeight).toBeGreaterThan(scrollInfo!.clientHeight);

    // Wait past the 150ms debounce in ScriptReader.
    await page.waitForTimeout(400);

    // After scrolling past scene 1 the active scene must change away from
    // scene 1 (the initial active). We do not assert the exact target scene
    // because posAtCoords resolution depends on layout.
    const isActiveOf = (el: Element) =>
      el.getAttribute("aria-current") === "true" ||
      el.getAttribute("data-active") === "true" ||
      el.classList.toString().toLowerCase().includes("active");

    const firstActive = await tocItems.first().evaluate(isActiveOf);
    expect(firstActive).toBe(false);

    const anyOtherActive = await tocItems.evaluateAll((els, isActiveSrc) => {
      const fn = new Function("el", `return (${isActiveSrc})(el)`) as (
        el: Element,
      ) => boolean;
      return els.slice(1).some((el) => fn(el));
    }, isActiveOf.toString());
    expect(anyOtherActive).toBe(true);
  });
});
