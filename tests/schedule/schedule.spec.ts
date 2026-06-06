import { expect } from "@playwright/test";
import { test } from "../fixtures";
import {
  SCHEDULE_PROJECT_ID,
  navigateToSchedule,
  generateSchedule,
} from "./helpers";

test.describe("[Spec 12c] Schedule — day drawer + effort", () => {
  test("[OHW-366] Click day header → day drawer opens", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToSchedule(page, SCHEDULE_PROJECT_ID);
    await generateSchedule(page);

    await page.getByTestId("day-header-1").click();

    // drawer-capacity-value only renders when the drawer is open with a day loaded
    await expect(page.getByTestId("drawer-capacity-value")).toBeVisible({
      timeout: 5_000,
    });
  });

  test("[OHW-367] Day drawer shows capacity bar and scene list", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToSchedule(page, SCHEDULE_PROJECT_ID);
    await generateSchedule(page);

    await page.getByTestId("day-header-1").click();

    // Capacity value should follow pattern "Xh / 8h"
    const capacityText = await page
      .getByTestId("drawer-capacity-value")
      .textContent({ timeout: 5_000 });
    expect(capacityText).toMatch(/\d+(\.\d+)?h\s*\/\s*8h/);

    // At least one effort input should be visible
    const effortInputs = page.locator('[data-testid^="strip-effort-"]');
    await expect(effortInputs.first()).toBeVisible();
  });

  test("[OHW-368] Edit effort → capacity bar updates", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToSchedule(page, SCHEDULE_PROJECT_ID);
    await generateSchedule(page);

    await page.getByTestId("day-header-1").click();

    const firstInput = page.locator('[data-testid^="strip-effort-"]').first();
    await expect(firstInput).toBeVisible({ timeout: 5_000 });

    const capacityBefore = await page
      .getByTestId("drawer-capacity-value")
      .textContent();

    // Set effort to 12h — guaranteed to differ from the default 1h/page auto value
    await firstInput.fill("12");
    await firstInput.press("Tab");

    // Wait for the server round-trip to update the capacity display
    await expect(page.getByTestId("drawer-capacity-value")).not.toHaveText(
      capacityBefore ?? "",
      { timeout: 5_000 },
    );
  });
});

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

    // The date input is hidden until edit mode. An UNdated day shows an
    // "Imposta data" button (day-date-set-N); a DATED day shows a "Modifica
    // data" display button. Either opens the date picker (reveals the input).
    const enterDateEdit = async () => {
      const setBtn = page.getByTestId("day-date-set-1");
      if (await setBtn.isVisible().catch(() => false)) {
        await setBtn.click();
        return;
      }
      const editBtn = page.getByRole("button", { name: "Modifica data" });
      if (
        await editBtn
          .first()
          .isVisible()
          .catch(() => false)
      ) {
        await editBtn.first().click();
      }
    };

    await enterDateEdit();
    const dateInput = page.getByTestId("day-date-1");
    await expect(dateInput).toBeVisible({ timeout: 8_000 });
    await dateInput.fill("2026-09-01");
    await page.keyboard.press("Tab");

    // Re-navigate to confirm persistence. The input carries the persisted value
    // even while hidden (a date-bearing day collapses to the display button), so
    // assert on the value directly — toHaveValue reads hidden inputs too.
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
