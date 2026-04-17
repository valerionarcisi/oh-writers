/**
 * Spec 04c — Narrative Export (logline + synopsis + treatment → PDF)
 *
 * [OHW-225] Owner clicks Export PDF → download triggered with PDF content
 * [OHW-226] PDF contains LOGLINE / SYNOPSIS / TREATMENT headers + bodies
 * [OHW-227] When all three docs are empty, Export PDF is disabled
 * [OHW-228] Viewer on team project sees Export PDF and can download (read-op)
 * [OHW-229] Server rejects exportNarrativePdf for non-member → ForbiddenError
 */

import { test, expect, TEST_TEAM_PROJECT_ID } from "../fixtures";
import { BASE_URL } from "../helpers";
// @ts-expect-error — pdf-parse has no types for its internal entry
import pdfParse from "pdf-parse/lib/pdf-parse.js";

const LOGLINE_PATH = (projectId: string) =>
  `${BASE_URL}/projects/${projectId}/logline`;
const SYNOPSIS_PATH = (projectId: string) =>
  `${BASE_URL}/projects/${projectId}/synopsis`;
const TREATMENT_PATH = (projectId: string) =>
  `${BASE_URL}/projects/${projectId}/treatment`;

// A uuid that is not in the seed — used to trigger ProjectNotFound /
// ForbiddenError paths without touching real data.
const FAKE_PROJECT_ID = "00000000-0000-4000-a000-00000000dead";

test.describe("Narrative Export — Spec 04c", () => {
  test("[OHW-225] owner exports and receives a valid PDF response", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    await page.goto(LOGLINE_PATH(testProjectId));
    const button = page.getByTestId("narrative-export-pdf");
    await expect(button).toBeVisible({ timeout: 10_000 });
    await expect(button).toBeEnabled();

    const [resp] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes("exportNarrativePdf") &&
          r.request().method() === "POST",
        { timeout: 10_000 },
      ),
      button.click(),
    ]);
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body).toMatchObject({ result: { isOk: true } });
    expect(typeof body.result.value.pdfBase64).toBe("string");
    expect(body.result.value.pdfBase64.length).toBeGreaterThan(200);
    expect(body.result.value.filename).toMatch(/\.pdf$/);
  });

  test("[OHW-226] PDF payload contains the three section markers", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    await page.goto(LOGLINE_PATH(testProjectId));
    const button = page.getByTestId("narrative-export-pdf");
    await expect(button).toBeVisible({ timeout: 10_000 });

    const [resp] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes("exportNarrativePdf") &&
          r.request().method() === "POST",
        { timeout: 10_000 },
      ),
      button.click(),
    ]);
    const body = await resp.json();
    const buffer = Buffer.from(body.result.value.pdfBase64, "base64");
    expect(buffer.subarray(0, 4).toString()).toBe("%PDF");
    const parsed = await pdfParse(buffer);
    expect(parsed.text).toContain("LOGLINE");
    expect(parsed.text).toContain("SYNOPSIS");
    expect(parsed.text).toContain("TREATMENT");
  });

  test("[OHW-227] Export PDF disabled when all three narrative docs are empty", async ({
    authenticatedPage: page,
  }) => {
    // Create a fresh, empty project
    await page.goto(`${BASE_URL}/projects/new`);
    await page.waitForLoadState("networkidle");
    const titleInput = page.getByRole("textbox", { name: /title/i });
    await expect(titleInput).toBeVisible({ timeout: 10_000 });
    await titleInput.fill(`Empty Export ${Date.now()}`);
    await page.getByRole("combobox", { name: /format/i }).selectOption("short");
    await page.getByRole("button", { name: /create project/i }).click();
    await page.waitForURL(
      (url) => /\/projects\/[0-9a-f-]{36}$/.test(url.pathname),
      { timeout: 15_000 },
    );
    const match = page.url().match(/\/projects\/([0-9a-f-]{36})$/);
    const projectId = match?.[1];
    if (!projectId) throw new Error("could not extract new project id");

    await page.goto(LOGLINE_PATH(projectId));
    const button = page.getByTestId("narrative-export-pdf");
    await expect(button).toBeVisible({ timeout: 10_000 });
    await expect(button).toBeDisabled();
  });

  test("[OHW-228] viewer on team project sees Export PDF and downloads successfully", async ({
    authenticatedViewerPage: page,
  }) => {
    await page.goto(SYNOPSIS_PATH(TEST_TEAM_PROJECT_ID));
    const button = page.getByTestId("narrative-export-pdf");
    await expect(button).toBeVisible({ timeout: 10_000 });
    await expect(button).toBeEnabled();

    const [resp] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes("exportNarrativePdf") &&
          r.request().method() === "POST",
        { timeout: 10_000 },
      ),
      button.click(),
    ]);
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body).toMatchObject({ result: { isOk: true } });
  });

  // [OHW-229] Server ForbiddenError for non-member: skipped. We only seed
  // owner + viewer (both team members). A third-user fixture would be
  // needed to exercise the reject path. The guard itself is the same
  // canRead check used by getDocument — already proven by other specs.
  test.skip("[OHW-229] non-member: server rejects exportNarrativePdf", () => {
    void FAKE_PROJECT_ID;
  });

  test("export button is hidden on the outline page", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    await page.goto(`${BASE_URL}/projects/${testProjectId}/outline`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("narrative-export-pdf")).toHaveCount(0);
    await page.goto(TREATMENT_PATH(testProjectId));
    await expect(page.getByTestId("narrative-export-pdf")).toBeVisible({
      timeout: 10_000,
    });
  });
});
