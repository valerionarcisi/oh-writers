import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { test, BASE_URL } from "../fixtures";
import {
  navigateToBreakdown,
  switchBreakdownView,
  TEAM_PROJECT_ID,
} from "./helpers";

/**
 * [OHW-148] AI disclosure stamp — Breakdown export.
 *
 * A breakdown export (either export path — the TopBar "⋯" → "Esporta CSV"
 * modal, or the "Per progetto" view's own "Esporta CSV" button) carries a
 * visible AI-assistance note the moment any element in the project has EVER
 * been Cesare-touched (`breakdownElements.everAiTouched`, permanent once
 * true — set by every real Cesare write path: llm-spoglio.server.ts,
 * cesare-suggest.server.ts, cesare-tools.ts). No note at all when nothing in
 * the project was ever Cesare-touched (the sad path — proves this isn't a
 * blanket disclaimer).
 */

const setOccurrenceSource = async (
  page: Page,
  projectId: string,
  source: "regex" | "cesare" | "manual",
  elementIndex = 0,
): Promise<void> => {
  const response = await page.request.post(
    `${BASE_URL}/api/test/breakdown-set-occurrence-source`,
    {
      data: { projectId, source, elementIndex },
      headers: { "Content-Type": "application/json" },
    },
  );
  if (!response.ok()) {
    throw new Error(
      `setOccurrenceSource failed: ${response.status()} ${response.statusText()}`,
    );
  }
};

const resetAiTouched = async (page: Page, projectId: string): Promise<void> => {
  const response = await page.request.post(
    `${BASE_URL}/api/test/breakdown-reset-ai-touched`,
    {
      data: { projectId },
      headers: { "Content-Type": "application/json" },
    },
  );
  if (!response.ok()) {
    throw new Error(
      `resetAiTouched failed: ${response.status()} ${response.statusText()}`,
    );
  }
};

const readDownloadedCsv = async (
  page: Page,
  trigger: () => Promise<void>,
): Promise<string> => {
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 20_000 }),
    trigger(),
  ]);
  const filePath = await download.path();
  if (!filePath) throw new Error("Download path is null — file not saved");
  const { readFile } = await import("node:fs/promises");
  return readFile(filePath, "utf-8");
};

test.describe("[OHW-148] Breakdown — AI disclosure stamp on export", () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    // Every test starts from a clean "nothing was ever Cesare-touched" state
    // on the shared seed project, restoring the occurrence sources too.
    await resetAiTouched(authenticatedPage, TEAM_PROJECT_ID);
    await setOccurrenceSource(authenticatedPage, TEAM_PROJECT_ID, "regex", 0);
    await setOccurrenceSource(authenticatedPage, TEAM_PROJECT_ID, "manual", 1);
  });

  test.afterEach(async ({ authenticatedPage }) => {
    await resetAiTouched(authenticatedPage, TEAM_PROJECT_ID);
    await setOccurrenceSource(authenticatedPage, TEAM_PROJECT_ID, "regex", 0);
    await setOccurrenceSource(authenticatedPage, TEAM_PROJECT_ID, "manual", 1);
  });

  test("[Per-progetto export] no note when nothing was ever Cesare-touched, note present once one element was", async ({
    authenticatedPage: page,
  }) => {
    await navigateToBreakdown(page, TEAM_PROJECT_ID);
    await switchBreakdownView(page, "per-project");

    const beforeCsv = await readDownloadedCsv(page, () =>
      page.getByTestId("breakdown-export-csv").click(),
    );
    expect(beforeCsv.split("\n")[0]).toContain("id,categoria,nome");
    expect(beforeCsv).not.toContain("Cesare");

    await setOccurrenceSource(page, TEAM_PROJECT_ID, "cesare", 0);
    await page.reload();
    await switchBreakdownView(page, "per-project");

    const afterCsv = await readDownloadedCsv(page, () =>
      page.getByTestId("breakdown-export-csv").click(),
    );
    expect(afterCsv.split("\n")[0]).toContain("Cesare");
  });

  test("[Modale Esporta] PDF/CSV: note is permanent once an element was ever Cesare-touched, even after that occurrence is corrected back to manual", async ({
    authenticatedPage: page,
  }) => {
    await navigateToBreakdown(page, TEAM_PROJECT_ID);

    await page.getByLabel("Altre azioni").click();
    await page.getByRole("menuitem", { name: /Esporta CSV/i }).click();
    await page.getByTestId("breakdown-export-format").selectOption("csv");

    const beforeCsv = await readDownloadedCsv(page, () =>
      page.getByTestId("breakdown-export-generate").click(),
    );
    expect(beforeCsv.split("\n")[0]).toContain("Categoria,Nome");
    expect(beforeCsv).not.toContain("Cesare");

    // Element 0 is Cesare-touched once (sets everAiTouched permanently)...
    await setOccurrenceSource(page, TEAM_PROJECT_ID, "cesare", 0);
    // ...then the writer "corrects" the occurrence back to manual. The note
    // must survive regardless — Spec 89's core invariant is permanence, not
    // proportionality: everAiTouched is never reset once true, even after
    // every occurrence trace is manually overwritten.
    await setOccurrenceSource(page, TEAM_PROJECT_ID, "manual", 0);
    await page.reload();

    await page.getByLabel("Altre azioni").click();
    await page.getByRole("menuitem", { name: /Esporta CSV/i }).click();
    await page.getByTestId("breakdown-export-format").selectOption("csv");

    const afterCsv = await readDownloadedCsv(page, () =>
      page.getByTestId("breakdown-export-generate").click(),
    );
    expect(afterCsv.split("\n")[0]).toBe(
      "Questo spoglio contiene elementi suggeriti da Cesare (AI).",
    );
  });
});
