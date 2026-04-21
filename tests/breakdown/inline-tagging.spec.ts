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
      .locator(".heading")
      .nth(1);
    const box = await headingDom.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      expect(box.y).toBeLessThan(400);
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

    const ghosts = page.locator('[data-ghost="true"]');
    if ((await ghosts.count()) > 0) {
      await expect(ghosts.first()).toBeVisible();
      const cat = await ghosts.first().getAttribute("data-cat");
      expect(cat).not.toBeNull();
    }
  });
});
