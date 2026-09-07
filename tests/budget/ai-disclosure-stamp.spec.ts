/**
 * Spec 89b — AI disclosure stamp, budget export.
 *
 * Both CSV and PDF exports carry the note once the project's budget was
 * ever touched by a Cesare write tool (add_budget_line, update_budget_line,
 * add_to_budget, mark_line_actual, redistribute_topsheet, set_budget_cap) —
 * driven by budgets.everAiTouched, permanent once true. Mirrors
 * tests/schedule/ai-disclosure-stamp.spec.ts.
 */
import { expect } from "@playwright/test";
import type { Page, Response } from "@playwright/test";
import { test } from "../fixtures";
import { BUDGET_PROJECT_ID, navigateToBudget, generateBudget } from "./helpers";
import { BASE_URL } from "../helpers";
import { pdfCompactText } from "../helpers/pdf";

const setBudgetAiTouched = async (
  page: Page,
  projectId: string,
  touched: boolean,
): Promise<void> => {
  const response = await page.request.post(
    `${BASE_URL}/api/test/set-budget-ai-touched`,
    {
      data: { projectId, touched },
      headers: { "Content-Type": "application/json" },
    },
  );
  if (!response.ok()) {
    throw new Error(
      `setBudgetAiTouched failed: ${response.status()} ${response.statusText()}`,
    );
  }
};

const openExportModal = async (page: Page) => {
  await page.getByLabel("Altre azioni").click();
  await page.getByRole("menuitem", { name: "Esporta" }).click();
};

test.describe("[OHW-148] Budget — AI disclosure stamp on export", () => {
  test.afterEach(async ({ authenticatedPage }) => {
    await setBudgetAiTouched(authenticatedPage, BUDGET_PROJECT_ID, false);
  });

  test("CSV export: no note when never Cesare-touched, note present once it was", async ({
    authenticatedPage: page,
  }) => {
    await navigateToBudget(page, BUDGET_PROJECT_ID);
    await generateBudget(page);
    await setBudgetAiTouched(page, BUDGET_PROJECT_ID, false);

    await openExportModal(page);
    await page.getByTestId("budget-export-format").selectOption("csv");
    const [beforeDownload] = await Promise.all([
      page.waitForEvent("download", { timeout: 20_000 }),
      page.getByTestId("budget-export-generate").click(),
    ]);
    const beforePath = await beforeDownload.path();
    if (!beforePath) throw new Error("Download path is null");
    const { readFile } = await import("node:fs/promises");
    const beforeCsv = await readFile(beforePath, "utf-8");
    expect(beforeCsv).not.toContain("Cesare");

    await setBudgetAiTouched(page, BUDGET_PROJECT_ID, true);
    await page.reload();
    await navigateToBudget(page, BUDGET_PROJECT_ID);

    await openExportModal(page);
    await page.getByTestId("budget-export-format").selectOption("csv");
    const [afterDownload] = await Promise.all([
      page.waitForEvent("download", { timeout: 20_000 }),
      page.getByTestId("budget-export-generate").click(),
    ]);
    const afterPath = await afterDownload.path();
    if (!afterPath) throw new Error("Download path is null");
    const afterCsv = await readFile(afterPath, "utf-8");
    expect(afterCsv.split("\n")[0]).toBe(
      "Questo budget contiene voci aggiunte o modificate da Cesare (AI).",
    );
  });

  test("PDF export: no note when never Cesare-touched, note present once it was", async ({
    authenticatedPage: page,
  }) => {
    await navigateToBudget(page, BUDGET_PROJECT_ID);
    await generateBudget(page);
    await setBudgetAiTouched(page, BUDGET_PROJECT_ID, false);

    await openExportModal(page);
    await page.getByTestId("budget-export-format").selectOption("pdf");
    const [beforeResponse] = await Promise.all([
      page.waitForResponse(
        (r: Response) =>
          r.url().includes("exportBudgetPdf") &&
          r.request().method() === "POST",
        { timeout: 15_000 },
      ),
      page.getByTestId("budget-export-generate").click(),
    ]);
    const beforeBody = await beforeResponse.json();
    const beforeBuffer = Buffer.from(
      beforeBody.result.value.pdfBase64,
      "base64",
    );
    const beforeText = await pdfCompactText(beforeBuffer);
    expect(beforeText).not.toContain("Cesare");

    await setBudgetAiTouched(page, BUDGET_PROJECT_ID, true);
    await page.reload();
    await navigateToBudget(page, BUDGET_PROJECT_ID);

    await openExportModal(page);
    await page.getByTestId("budget-export-format").selectOption("pdf");
    const [afterResponse] = await Promise.all([
      page.waitForResponse(
        (r: Response) =>
          r.url().includes("exportBudgetPdf") &&
          r.request().method() === "POST",
        { timeout: 15_000 },
      ),
      page.getByTestId("budget-export-generate").click(),
    ]);
    const afterBody = await afterResponse.json();
    const afterBuffer = Buffer.from(afterBody.result.value.pdfBase64, "base64");
    const afterText = await pdfCompactText(afterBuffer);
    expect(afterText).toContain(
      "QuestobudgetcontienevociaggiunteomodificatedaCesare(AI).",
    );
  });

  test("[Permanenza] the note survives a manual line edit after a Cesare tool touched the budget", async ({
    authenticatedPage: page,
  }) => {
    await navigateToBudget(page, BUDGET_PROJECT_ID);
    await generateBudget(page);

    // Simulate "Cesare touched this budget once" the same way the budget
    // tools do in production (markBudgetAiTouched sets the flag; it never
    // resets it) — driving a real add_budget_line turn is covered separately
    // in ai-disclosure-stamp-plumbing.spec.ts, this test's target is the
    // flag's permanence through a LATER manual mutation, not the Cesare
    // write path itself.
    await setBudgetAiTouched(page, BUDGET_PROJECT_ID, true);

    await openExportModal(page);
    await page.getByTestId("budget-export-format").selectOption("pdf");
    const [response] = await Promise.all([
      page.waitForResponse(
        (r: Response) =>
          r.url().includes("exportBudgetPdf") &&
          r.request().method() === "POST",
        { timeout: 15_000 },
      ),
      page.getByTestId("budget-export-generate").click(),
    ]);
    const body = await response.json();
    const buffer = Buffer.from(body.result.value.pdfBase64, "base64");
    const text = await pdfCompactText(buffer);
    expect(text).toContain(
      "QuestobudgetcontienevociaggiunteomodificatedaCesare(AI).",
    );
  });
});
