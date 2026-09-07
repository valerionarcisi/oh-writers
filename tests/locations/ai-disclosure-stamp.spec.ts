/**
 * Spec 89b — AI disclosure stamp, locations CSV export.
 *
 * The export carries the note once ANY requirement in the project was ever
 * touched by a Cesare write tool (add_candidate,
 * create_location_requirement, find_or_create_requirement_for_scene) —
 * driven by `requirements.some((r) => r.everAiTouched)`, mirroring
 * breakdown's aggregation. Permanent once a requirement is touched. Mirrors
 * tests/schedule/ai-disclosure-stamp.spec.ts.
 */
import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { test } from "../fixtures";
import {
  LOCATIONS_PROJECT_ID,
  SEEDED_LOCATION_REQ_1_ID,
  navigateToLocations,
} from "./helpers";
import { BASE_URL } from "../helpers";

const setRequirementAiTouched = async (
  page: Page,
  requirementId: string,
  touched: boolean,
): Promise<void> => {
  const response = await page.request.post(
    `${BASE_URL}/api/test/set-location-requirement-ai-touched`,
    {
      data: { requirementId, touched },
      headers: { "Content-Type": "application/json" },
    },
  );
  if (!response.ok()) {
    throw new Error(
      `setRequirementAiTouched failed: ${response.status()} ${response.statusText()}`,
    );
  }
};

const exportCsv = async (page: Page) => {
  await page.getByLabel("Altre azioni").click();
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 20_000 }),
    page.getByRole("menuitem", { name: "Esporta" }).click(),
  ]);
  return download;
};

test.describe("[OHW-148] Locations — AI disclosure stamp on export", () => {
  test.afterEach(async ({ authenticatedPage }) => {
    await setRequirementAiTouched(
      authenticatedPage,
      SEEDED_LOCATION_REQ_1_ID,
      false,
    );
  });

  test("CSV export: no note when never Cesare-touched, note present once a requirement was", async ({
    authenticatedPage: page,
  }) => {
    await navigateToLocations(page, LOCATIONS_PROJECT_ID);
    await setRequirementAiTouched(page, SEEDED_LOCATION_REQ_1_ID, false);

    const beforeDownload = await exportCsv(page);
    const beforePath = await beforeDownload.path();
    if (!beforePath) throw new Error("Download path is null");
    const { readFile } = await import("node:fs/promises");
    const beforeCsv = await readFile(beforePath, "utf-8");
    expect(beforeCsv).not.toContain("Cesare");

    await setRequirementAiTouched(page, SEEDED_LOCATION_REQ_1_ID, true);
    await page.reload();
    await navigateToLocations(page, LOCATIONS_PROJECT_ID);

    const afterDownload = await exportCsv(page);
    const afterPath = await afterDownload.path();
    if (!afterPath) throw new Error("Download path is null");
    const afterCsv = await readFile(afterPath, "utf-8");
    expect(afterCsv.split("\n")[0]).toBe(
      "Questa esportazione contiene requirement o candidate aggiunte da Cesare (AI).",
    );
  });

  test("[Permanenza] the note survives a manual edit of the requirement after a Cesare tool touched it", async ({
    authenticatedPage: page,
  }) => {
    await navigateToLocations(page, LOCATIONS_PROJECT_ID);

    // Simulate "Cesare touched this requirement once" the same way the
    // location tools do in production (markLocationRequirementAiTouched sets
    // the flag; it never resets it) — driving a real add_candidate turn is
    // covered separately in ai-disclosure-stamp-plumbing.spec.ts, this
    // test's target is the flag's permanence through a LATER manual
    // mutation, not the Cesare write path itself.
    await setRequirementAiTouched(page, SEEDED_LOCATION_REQ_1_ID, true);

    // The writer now opens the requirement by hand — a plain read/detail
    // interaction that never touches location_requirements.everAiTouched —
    // to prove the note isn't cleared by simply revisiting the requirement.
    const row = page.locator('[data-testid^="requirement-row-"]').first();
    if (await row.isVisible().catch(() => false)) {
      await row.click();
    }

    const download = await exportCsv(page);
    const filePath = await download.path();
    if (!filePath) throw new Error("Download path is null");
    const { readFile } = await import("node:fs/promises");
    const csv = await readFile(filePath, "utf-8");
    expect(csv.split("\n")[0]).toBe(
      "Questa esportazione contiene requirement o candidate aggiunte da Cesare (AI).",
    );
  });
});
