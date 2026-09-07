/**
 * Spec 89 — AI disclosure stamp, shooting schedule export (phase 4, final).
 *
 * Both CSV and PDF exports carry the note once the project's schedule was
 * ever touched by a Cesare mutation tool (move_scene_to_day, merge_days,
 * swap_scenes) — driven by schedules.everAiTouched, permanent once true.
 */
import { expect } from "@playwright/test";
import type { Page, Response } from "@playwright/test";
import { test } from "../fixtures";
import {
  SCHEDULE_PROJECT_ID,
  navigateToSchedule,
  generateSchedule,
} from "./helpers";
import { BASE_URL } from "../helpers";
import { pdfCompactText } from "../helpers/pdf";

const setScheduleAiTouched = async (
  page: Page,
  projectId: string,
  touched: boolean,
): Promise<void> => {
  const response = await page.request.post(
    `${BASE_URL}/api/test/set-schedule-ai-touched`,
    {
      data: { projectId, touched },
      headers: { "Content-Type": "application/json" },
    },
  );
  if (!response.ok()) {
    throw new Error(
      `setScheduleAiTouched failed: ${response.status()} ${response.statusText()}`,
    );
  }
};

const clickMenuItem = async (page: Page, name: RegExp) => {
  await page.getByLabel("Altre azioni").click();
  await page.getByRole("menuitem", { name }).click();
};

test.describe("[OHW-148] Schedule — AI disclosure stamp on export", () => {
  test.afterEach(async ({ authenticatedPage }) => {
    await setScheduleAiTouched(authenticatedPage, SCHEDULE_PROJECT_ID, false);
  });

  test("CSV export: no note when never Cesare-touched, note present once it was", async ({
    authenticatedPage: page,
  }) => {
    await navigateToSchedule(page, SCHEDULE_PROJECT_ID);
    await generateSchedule(page);
    await setScheduleAiTouched(page, SCHEDULE_PROJECT_ID, false);

    const [beforeDownload] = await Promise.all([
      page.waitForEvent("download", { timeout: 20_000 }),
      clickMenuItem(page, /Esporta/),
    ]);
    const beforePath = await beforeDownload.path();
    if (!beforePath) throw new Error("Download path is null");
    const { readFile } = await import("node:fs/promises");
    const beforeCsv = await readFile(beforePath, "utf-8");
    expect(beforeCsv).not.toContain("Cesare");

    await setScheduleAiTouched(page, SCHEDULE_PROJECT_ID, true);
    await page.reload();
    await navigateToSchedule(page, SCHEDULE_PROJECT_ID);

    const [afterDownload] = await Promise.all([
      page.waitForEvent("download", { timeout: 20_000 }),
      clickMenuItem(page, /Esporta/),
    ]);
    const afterPath = await afterDownload.path();
    if (!afterPath) throw new Error("Download path is null");
    const afterCsv = await readFile(afterPath, "utf-8");
    expect(afterCsv.split("\n")[0]).toBe(
      "Questo piano di lavorazione contiene giornate riorganizzate da Cesare (AI).",
    );
  });

  test("PDF export: no note when never Cesare-touched, note present once it was", async ({
    authenticatedPage: page,
  }) => {
    await navigateToSchedule(page, SCHEDULE_PROJECT_ID);
    await generateSchedule(page);
    await setScheduleAiTouched(page, SCHEDULE_PROJECT_ID, false);

    const [beforeResponse] = await Promise.all([
      page.waitForResponse(
        (r: Response) =>
          r.url().includes("exportSchedulePdf") &&
          r.request().method() === "POST",
        { timeout: 15_000 },
      ),
      clickMenuItem(page, /Stampa/),
    ]);
    const beforeBody = await beforeResponse.json();
    const beforeBuffer = Buffer.from(
      beforeBody.result.value.pdfBase64,
      "base64",
    );
    const beforeText = await pdfCompactText(beforeBuffer);
    expect(beforeText).not.toContain("Cesare");

    await setScheduleAiTouched(page, SCHEDULE_PROJECT_ID, true);
    await page.reload();
    await navigateToSchedule(page, SCHEDULE_PROJECT_ID);

    const [afterResponse] = await Promise.all([
      page.waitForResponse(
        (r: Response) =>
          r.url().includes("exportSchedulePdf") &&
          r.request().method() === "POST",
        { timeout: 15_000 },
      ),
      clickMenuItem(page, /Stampa/),
    ]);
    const afterBody = await afterResponse.json();
    const afterBuffer = Buffer.from(afterBody.result.value.pdfBase64, "base64");
    const afterText = await pdfCompactText(afterBuffer);
    expect(afterText).toContain(
      "QuestopianodilavorazionecontienegiornateriorganizzatedaCesare(AI).",
    );
  });

  test("[Permanenza] the note survives a manual drag-and-drop reorder after a Cesare tool touched the schedule", async ({
    authenticatedPage: page,
  }) => {
    await navigateToSchedule(page, SCHEDULE_PROJECT_ID);
    await generateSchedule(page);

    // Simulate "Cesare touched this schedule once" the same way the schedule
    // tools do in production (markScheduleAiTouched sets the flag; it never
    // resets it) — driving a real move_scene_to_day turn is covered
    // separately in ai-disclosure-stamp-plumbing.spec.ts, this test's target
    // is the flag's permanence through a LATER manual mutation, not the
    // Cesare write path itself.
    await setScheduleAiTouched(page, SCHEDULE_PROJECT_ID, true);

    // The writer now reorders the board by hand (drag-and-drop → moveStrip,
    // a plain strips/shootingDays mutation that never touches
    // schedules.everAiTouched).
    const dayColumns = page.locator('[data-testid^="day-column-"]');
    const count = await dayColumns.count();
    if (count >= 2) {
      const day1 = page.getByTestId("day-column-1");
      const firstStrip = day1.locator('[data-testid^="strip-"]').first();
      if (await firstStrip.isVisible().catch(() => false)) {
        const day2 = page.getByTestId("day-column-2");
        const dropZone = day2.locator('[data-testid^="day-drop-"]');
        await firstStrip.dragTo(dropZone);
        await expect(page.getByTestId("strip-board")).toBeVisible({
          timeout: 8_000,
        });
      }
    }

    const [response] = await Promise.all([
      page.waitForResponse(
        (r: Response) =>
          r.url().includes("exportSchedulePdf") &&
          r.request().method() === "POST",
        { timeout: 15_000 },
      ),
      clickMenuItem(page, /Stampa/),
    ]);
    const body = await response.json();
    const buffer = Buffer.from(body.result.value.pdfBase64, "base64");
    const text = await pdfCompactText(buffer);
    expect(text).toContain(
      "QuestopianodilavorazionecontienegiornateriorganizzatedaCesare(AI).",
    );
  });
});
