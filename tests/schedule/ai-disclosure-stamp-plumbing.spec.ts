/**
 * Spec 89 — AI disclosure stamp, schedule: direct plumbing coverage.
 *
 * Complements ai-disclosure-stamp.spec.ts (export-level assertion, driven by
 * a test-hook) with a check that a REAL Cesare tool call (move_scene_to_day,
 * cesare-schedule-tools.ts) actually sets schedules.everAiTouched = true via
 * the shared markScheduleAiTouched helper — not just that the export reads
 * the field correctly once it's set by hand.
 */
import { test, expect } from "../fixtures";
import {
  navigateToSchedule,
  generateSchedule,
  SCHEDULE_PROJECT_ID,
} from "./helpers";
import {
  openCesareSheet,
  sendCesareWithRetry,
  setMockContext,
  resetCesareState,
} from "../helpers/cesare";
import { BASE_URL } from "../helpers";

test.describe("[OHW-148] Schedule — Cesare tool sets everAiTouched directly", () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await resetCesareState(authenticatedPage, SCHEDULE_PROJECT_ID);
  });

  test.afterEach(async ({ authenticatedPage }) => {
    await authenticatedPage.request.post(
      `${BASE_URL}/api/test/set-schedule-ai-touched`,
      {
        data: { projectId: SCHEDULE_PROJECT_ID, touched: false },
        headers: { "Content-Type": "application/json" },
      },
    );
  });

  test("move_scene_to_day sets everAiTouched=true on the schedule", async ({
    authenticatedPage: page,
  }) => {
    await navigateToSchedule(page, SCHEDULE_PROJECT_ID);
    await generateSchedule(page);

    // Ensure a clean starting state now that the schedule definitely exists.
    await page.request.post(`${BASE_URL}/api/test/set-schedule-ai-touched`, {
      data: { projectId: SCHEDULE_PROJECT_ID, touched: false },
      headers: { "Content-Type": "application/json" },
    });
    const before = await page.request.get(
      `${BASE_URL}/api/test/set-schedule-ai-touched?projectId=${SCHEDULE_PROJECT_ID}`,
    );
    expect((await before.json()).everAiTouched).toBe(false);

    await setMockContext(page, { SCENE_NUMBER: 3, TARGET_DAY: 2 });

    await openCesareSheet(page);
    await sendCesareWithRetry(page, "Sposta la scena 3 al giorno 2.");
    await expect(page.getByTestId("cesare-conversation")).toContainText(
      /spostat|giorno|schedule|aggiornato/i,
      { timeout: 30_000 },
    );

    const after = await page.request.get(
      `${BASE_URL}/api/test/set-schedule-ai-touched?projectId=${SCHEDULE_PROJECT_ID}`,
    );
    expect((await after.json()).everAiTouched).toBe(true);
  });
});
