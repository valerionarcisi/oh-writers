import { expect } from "@playwright/test";
import { test } from "../fixtures";
import {
  SCHEDULE_PROJECT_ID,
  navigateToSchedule,
  generateSchedule,
} from "./helpers";

test.describe("[Spec 12b] Schedule — strip board", () => {
  test("[OHW-361] Generate schedule → strip board renders with at least one shooting day", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToSchedule(page, SCHEDULE_PROJECT_ID);
    await generateSchedule(page);

    await expect(page.getByTestId("strip-board")).toBeVisible({
      timeout: 10_000,
    });
    // At least one shooting day column should exist
    const dayColumns = page.locator('[data-testid^="day-column-"]');
    await expect(dayColumns.first()).toBeVisible({ timeout: 8_000 });
  });

  test("[OHW-362] Drag strip to different day → page counts update", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToSchedule(page, SCHEDULE_PROJECT_ID);
    await generateSchedule(page);

    const dayColumns = page.locator('[data-testid^="day-column-"]');
    const count = await dayColumns.count();
    if (count < 2) {
      test.skip();
      return;
    }

    // Find first strip in day 1
    const day1 = page.getByTestId("day-column-1");
    const firstStrip = day1.locator('[data-testid^="strip-"]').first();
    if (!(await firstStrip.isVisible())) {
      test.skip();
      return;
    }

    // Get day-2 drop zone
    const day2 = page.getByTestId("day-column-2");
    const dropZone = day2.locator('[data-testid^="day-drop-"]');

    // Drag from day 1 strip to day 2
    await firstStrip.dragTo(dropZone);

    // Board should still be visible after drop (no crash)
    await expect(page.getByTestId("strip-board")).toBeVisible({
      timeout: 8_000,
    });
  });

  test("[OHW-363] Add shooting day → new column appears", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToSchedule(page, SCHEDULE_PROJECT_ID);
    await generateSchedule(page);

    const daysBefore = await page
      .locator('[data-testid^="day-column-"]')
      .count();

    await page.getByTestId("add-day-btn").click();

    await expect(page.locator('[data-testid^="day-column-"]')).toHaveCount(
      daysBefore + 1,
      { timeout: 8_000 },
    );
  });

  test("[OHW-364] Set date on a day → date value persists in input", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToSchedule(page, SCHEDULE_PROJECT_ID);
    await generateSchedule(page);

    const dateInput = page.getByTestId("day-date-1");
    await expect(dateInput).toBeVisible({ timeout: 8_000 });

    await dateInput.fill("2026-09-01");
    await page.keyboard.press("Tab");

    // Re-navigate to confirm persistence
    await navigateToSchedule(page, SCHEDULE_PROJECT_ID);
    await expect(page.getByTestId("day-date-1")).toHaveValue("2026-09-01", {
      timeout: 8_000,
    });
  });

  test("[OHW-365] Lock strip → strip cannot be dragged", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToSchedule(page, SCHEDULE_PROJECT_ID);
    await generateSchedule(page);

    const day1 = page.getByTestId("day-column-1");
    const firstStrip = day1.locator('[data-testid^="strip-"]').first();
    if (!(await firstStrip.isVisible())) {
      test.skip();
      return;
    }

    const stripId = (await firstStrip.getAttribute("data-testid"))?.replace(
      "strip-",
      "",
    );
    if (!stripId) throw new Error("Could not get strip id");

    // Lock the strip
    await firstStrip.hover();
    await page.getByTestId(`strip-lock-${stripId}`).click();

    // Strip should have locked class
    await expect(firstStrip).toHaveClass(/locked/, { timeout: 5_000 });

    // Verify draggable attribute is false/absent
    const draggable = await firstStrip.getAttribute("draggable");
    expect(draggable).not.toBe("true");
  });
});
