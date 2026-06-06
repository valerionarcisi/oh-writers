import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { test } from "../fixtures";
import {
  SCHEDULE_PROJECT_ID,
  navigateToSchedule,
  generateSchedule,
} from "./helpers";

// Spec 67: the schedule's two exports (CSV "Esporta" + PDF "Stampa") moved off
// the FloatingDock toolbar into the TopBar `⋯` ("Altre azioni") menu. Each helper
// opens the menu and clicks the relevant item.
const clickMenuItem = async (page: Page, name: RegExp) => {
  await page.getByLabel("Altre azioni").click();
  await page.getByRole("menuitem", { name }).click();
};

test.describe("[Spec 12e] Schedule — export", () => {
  test("[OHW-380] Schedule exposes Esporta + Stampa in the TopBar ⋯ menu", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToSchedule(page, SCHEDULE_PROJECT_ID);
    await generateSchedule(page);

    await page.getByLabel("Altre azioni").click();
    await expect(page.getByRole("menuitem", { name: /Esporta/ })).toBeVisible({
      timeout: 8_000,
    });
    await expect(page.getByRole("menuitem", { name: /Stampa/ })).toBeVisible();
  });

  test("[OHW-381] Esporta triggers the CSV export (download fires)", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToSchedule(page, SCHEDULE_PROJECT_ID);
    await generateSchedule(page);

    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 20_000 }),
      clickMenuItem(page, /Esporta/),
    ]);
    expect(download.suggestedFilename()).toMatch(/schedule.*\.csv$/);
  });

  test("[OHW-382] Stampa opens the PDF in a new tab", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToSchedule(page, SCHEDULE_PROJECT_ID);
    await generateSchedule(page);

    // openPdfPreview calls window.open(blobUrl, "_blank"). Intercept it (blob:
    // navigations may not fire a Playwright page event in Chromium).
    await page.evaluate(() => {
      const w = window as Window & { __openedUrl?: string };
      const orig = window.open.bind(window);
      window.open = (...args) => {
        w.__openedUrl = String(args[0]);
        return orig(...args);
      };
    });

    await clickMenuItem(page, /Stampa/);

    await page.waitForFunction(
      () => !!(window as Window & { __openedUrl?: string }).__openedUrl,
      { timeout: 15_000 },
    );
    const openedUrl = await page.evaluate(
      () => (window as Window & { __openedUrl?: string }).__openedUrl ?? "",
    );
    expect(openedUrl).toMatch(/blob:/);
  });

  test("[OHW-383] Esporta downloads a CSV with the correct filename pattern", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToSchedule(page, SCHEDULE_PROJECT_ID);
    await generateSchedule(page);

    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 20_000 }),
      clickMenuItem(page, /Esporta/),
    ]);
    expect(download.suggestedFilename()).toMatch(/schedule.*\.csv$/);
  });

  test("[OHW-384] Export with no schedule generated → export still works (empty CSV)", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await page.goto(
      `http://localhost:3002/projects/${SCHEDULE_PROJECT_ID}/schedule`,
    );
    await page.waitForLoadState("networkidle", { timeout: 15_000 });

    const generateBtn = page.getByTestId("generate-schedule-btn");
    const isEmptyState = await generateBtn
      .waitFor({ state: "visible", timeout: 5_000 })
      .then(() => true)
      .catch(() => false);

    if (!isEmptyState) {
      // Schedule already exists from a prior test; skip the empty-state check.
      test.skip();
      return;
    }

    // Even with no schedule the export returns an empty CSV — clicking must not
    // crash; a download (possibly 0-byte) fires.
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 15_000 }),
      clickMenuItem(page, /Esporta/),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.csv$/);
  });

  test("[OHW-385] Viewer (read-only) can export the schedule — export is a read action", async ({
    authenticatedViewerPage,
  }) => {
    const page = authenticatedViewerPage;
    await navigateToSchedule(page, SCHEDULE_PROJECT_ID);
    await generateSchedule(page);

    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 20_000 }),
      clickMenuItem(page, /Esporta/),
    ]);
    expect(download.suggestedFilename()).toMatch(/schedule.*\.csv$/);
  });
});
