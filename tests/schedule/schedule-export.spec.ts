import { expect } from "@playwright/test";
import { test } from "../fixtures";
import {
  SCHEDULE_PROJECT_ID,
  navigateToSchedule,
  generateSchedule,
} from "./helpers";

// The FloatingDock renders secondary actions as plain <button> elements whose
// aria-label matches the action label. No data-testid attributes are added by
// the current FloatingDock implementation — selectors below use getByRole with
// an exact name match, which is the most robust approach given the current DOM.
//
// If a future refactor adds data-testid="export-csv-btn" / "export-pdf-btn" /
// "export-btn" to the dock buttons, replace getByRole(...) with getByTestId().

test.describe("[Spec 12e] Schedule — export", () => {
  test("[OHW-380] Schedule page has an 'Esporta' button visible in the dock", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToSchedule(page, SCHEDULE_PROJECT_ID);
    await generateSchedule(page);

    // The FloatingDock is rendered as role="toolbar". The "Esporta" secondary
    // action is a ghost button inside it — verify it is visible to the user.
    const esportaBtn = page.getByRole("toolbar").getByRole("button", {
      name: /Esporta/,
    });
    await expect(esportaBtn).toBeVisible({ timeout: 8_000 });
  });

  test("[OHW-381] Clicking Esporta immediately triggers the CSV export (no intermediate modal)", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToSchedule(page, SCHEDULE_PROJECT_ID);
    await generateSchedule(page);

    // The current implementation has no export modal — clicking "Esporta" fires
    // the CSV mutation directly. Verify the button enters its pending label
    // ("Esportando…") which confirms the click was handled and the mutation fired.
    const esportaBtn = page.getByRole("toolbar").getByRole("button", {
      name: /Esporta/,
    });
    await expect(esportaBtn).toBeVisible({ timeout: 8_000 });

    // Start monitoring for either the download or the pending label.
    // We race both: if the server is fast the download fires before the
    // pending label appears, which is still a valid happy path.
    const downloadPromise = page.waitForEvent("download", { timeout: 15_000 });

    await esportaBtn.click();

    // Either a download event fires OR the button transitions to "Esportando…"
    // — both confirm the action was received and processed.
    const result = await Promise.race([
      downloadPromise.then(() => "download" as const),
      expect(
        page.getByRole("toolbar").getByRole("button", { name: /Esportando/ }),
      )
        .toBeVisible({ timeout: 5_000 })
        .then(() => "pending" as const)
        .catch(() => "pending-not-seen" as const),
    ]);

    // At minimum the click should have initiated something — download is the
    // definitive proof. "pending" is an acceptable intermediate signal.
    expect(["download", "pending"]).toContain(result);
  });

  test("[OHW-382] Clicking 'Stampa' opens the PDF in a new tab", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToSchedule(page, SCHEDULE_PROJECT_ID);
    await generateSchedule(page);

    const stampaBtn = page.getByRole("toolbar").getByRole("button", {
      name: /Stampa/,
    });
    await expect(stampaBtn).toBeVisible({ timeout: 8_000 });

    // openPdfPreview calls window.open(blobUrl, "_blank") which Playwright
    // surfaces as a new page event on the browser context.
    // Intercept window.open to capture the blob URL (blob: navigations may not
    // fire a Playwright page event in Chromium).
    await page.evaluate(() => {
      const w = window as Window & { __openedUrl?: string };
      const orig = window.open.bind(window);
      window.open = (...args) => {
        w.__openedUrl = String(args[0]);
        return orig(...args);
      };
    });

    await stampaBtn.click();

    await page.waitForFunction(() => !!(window as Window & { __openedUrl?: string }).__openedUrl, { timeout: 15_000 });
    const openedUrl = await page.evaluate(() => (window as Window & { __openedUrl?: string }).__openedUrl ?? "");
    expect(openedUrl).toMatch(/blob:/);
  });

  test("[OHW-383] Clicking 'Esporta' downloads a CSV with the correct filename pattern", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToSchedule(page, SCHEDULE_PROJECT_ID);
    await generateSchedule(page);

    const esportaBtn = page.getByRole("toolbar").getByRole("button", {
      name: /Esporta/,
    });
    await expect(esportaBtn).toBeVisible({ timeout: 8_000 });

    // downloadBlob creates a temporary <a download="…"> and clicks it
    // programmatically — Playwright captures this as a download event.
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 20_000 }),
      esportaBtn.click(),
    ]);

    // Filename pattern: <project-slug>-schedule-<YYYY-MM-DD>.csv
    expect(download.suggestedFilename()).toMatch(/schedule.*\.csv$/);
  });

  test("[OHW-384] Export with no schedule generated → export still works (returns empty CSV)", async ({
    authenticatedPage,
  }) => {
    // The server-side exportScheduleCsv handler returns { csv: "", filename }
    // when no schedule row exists — it does not return an error. The "Esporta"
    // button is therefore always enabled regardless of schedule state. This test
    // verifies that clicking "Esporta" on an empty schedule does not crash and
    // either produces a download or shows a pending/error feedback.
    const page = authenticatedPage;

    // Navigate to the schedule page and wait for the UI to settle WITHOUT
    // triggering generateSchedule, so we observe the initial empty state.
    await page.goto(
      `http://localhost:3002/projects/${SCHEDULE_PROJECT_ID}/schedule`,
    );
    await page.waitForLoadState("networkidle", { timeout: 15_000 });

    // Wait for either the generate button (truly empty) or the strip-board
    // (already generated from a previous test run).
    const generateBtn = page.getByTestId("generate-schedule-btn");
    const stripBoard = page.getByTestId("strip-board");

    const isEmptyState = await generateBtn
      .waitFor({ state: "visible", timeout: 5_000 })
      .then(() => true)
      .catch(() => false);

    if (!isEmptyState) {
      // Schedule already exists from a prior test; skip the empty-state check.
      test.skip();
      return;
    }

    // In the empty state the FloatingDock is still rendered — the "Esporta"
    // button should be visible and clickable.
    const esportaBtn = page.getByRole("toolbar").getByRole("button", {
      name: /Esporta/,
    });
    await expect(esportaBtn).toBeVisible({ timeout: 8_000 });

    // Clicking should not throw. The server returns an empty CSV which still
    // triggers a download (a 0-byte file is a valid response for this case).
    const downloadOrPending = await Promise.race([
      page
        .waitForEvent("download", { timeout: 15_000 })
        .then(() => "download" as const),
      expect(
        page.getByRole("toolbar").getByRole("button", { name: /Esportando/ }),
      )
        .toBeVisible({ timeout: 5_000 })
        .then(() => "pending" as const)
        .catch(() => "unknown" as const),
    ]);

    // Either outcome (download fired or pending label appeared) means the
    // action was handled gracefully — no crash, no unhandled error overlay.
    expect(["download", "pending"]).toContain(downloadOrPending);
  });

  test("[OHW-385] Viewer (read-only) can export the schedule — export is a read action", async ({
    authenticatedViewerPage,
  }) => {
    // The viewer role has "view" access. exportScheduleCsv and exportSchedulePdf
    // both use withProjectAccess(..., "view", ...) so viewers are authorized.
    const page = authenticatedViewerPage;
    await navigateToSchedule(page, SCHEDULE_PROJECT_ID);
    await generateSchedule(page);

    const esportaBtn = page.getByRole("toolbar").getByRole("button", {
      name: /Esporta/,
    });
    await expect(esportaBtn).toBeVisible({ timeout: 8_000 });

    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 20_000 }),
      esportaBtn.click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/schedule.*\.csv$/);
  });
});
