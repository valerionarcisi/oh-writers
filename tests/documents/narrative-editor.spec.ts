/**
 * Spec 04 — Narrative Editor E2E (logline, synopsis, treatment)
 *
 * Blocco 1 — content caps (client + server):
 *   [OHW-204] Logline counter shows warn class above 180 chars (90% of 200)
 *   [OHW-205] Logline textarea refuses input past 200 chars (HTML maxLength)
 *   [OHW-206] Server rejects saveDocument with content longer than LOGLINE_MAX
 *             even when the HTML maxLength has been bypassed
 *
 * Blocco 2 — role guard (team projects):
 *   [OHW-211] Viewer sees read-only UI: textarea is readonly, Save button hidden
 *   [OHW-212] Viewer raw save hits the server and gets rejected (ForbiddenError)
 *   [OHW-213] Owner on the same team project can save normally
 */

import { test, expect, TEST_TEAM_PROJECT_ID } from "../fixtures";
import { BASE_URL } from "../helpers";

const LOGLINE_PATH = (projectId: string) =>
  `${BASE_URL}/projects/${projectId}/logline`;

test.describe("Narrative Editor — content caps", () => {
  test("[OHW-204] logline counter warns above 180 characters", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    await page.goto(LOGLINE_PATH(testProjectId));
    const textarea = page.locator("textarea").first();
    await expect(textarea).toBeVisible({ timeout: 10_000 });

    // Exactly 180 chars → no warning (threshold is strict >, not >=)
    await textarea.fill("x".repeat(180));
    const counter = page.locator('[class*="charCount"]').first();
    await expect(counter).toBeVisible();
    await expect(counter).toContainText("180/200");
    const classAt180 = await counter
      .locator("span")
      .first()
      .getAttribute("class");
    expect(classAt180 ?? "").not.toContain("charCountWarn");

    // 181 chars → warning kicks in
    await textarea.fill("x".repeat(181));
    await expect(counter).toContainText("181/200");
    const warnSpan = counter.locator("span").first();
    await expect(warnSpan).toHaveClass(/charCountWarn/);
  });

  test("[OHW-205] logline textarea refuses input past 200 chars", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    await page.goto(LOGLINE_PATH(testProjectId));
    const textarea = page.locator("textarea").first();
    await expect(textarea).toBeVisible({ timeout: 10_000 });

    // HTML maxLength clamps to 200; Playwright fill respects the attribute
    // only on Keyboard.type, so we set value, then dispatch input, then
    // read back what the browser actually stored.
    await textarea.evaluate((el: HTMLTextAreaElement) => {
      el.focus();
    });
    await page.keyboard.type("x".repeat(250), { delay: 0 });

    const actualLength = await textarea.evaluate(
      (el: HTMLTextAreaElement) => el.value.length,
    );
    expect(actualLength).toBe(200);

    const maxLengthAttr = await textarea.getAttribute("maxlength");
    expect(maxLengthAttr).toBe("200");
  });

  test("[OHW-206] server rejects logline save with content > LOGLINE_MAX", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    await page.goto(LOGLINE_PATH(testProjectId));
    const textarea = page.locator("textarea").first();
    await expect(textarea).toBeVisible({ timeout: 10_000 });

    // Wait for the E2E bypass hook to be attached by NarrativeEditor
    await page.waitForFunction(
      () =>
        typeof (window as unknown as { __ohWritersSaveDocumentRaw?: unknown })
          .__ohWritersSaveDocumentRaw === "function",
      undefined,
      { timeout: 10_000 },
    );

    // Trigger a save with 201 chars — bypasses HTML maxLength, hits the server
    await page.evaluate(() => {
      (
        window as unknown as {
          __ohWritersSaveDocumentRaw: (content: string) => void;
        }
      ).__ohWritersSaveDocumentRaw("x".repeat(201));
    });

    // Server responds with ValidationError → useSaveDocument's
    // unwrapResult throws → react-query isError → SaveStatus "Error saving"
    const saveStatus = page.locator('[class*="status"]').filter({
      hasText: /Error saving/i,
    });
    await expect(saveStatus).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Narrative Editor — role guard", () => {
  const TEAM_LOGLINE_PATH = `${BASE_URL}/projects/${TEST_TEAM_PROJECT_ID}/logline`;

  test("[OHW-211] viewer sees read-only UI on a team project", async ({
    authenticatedViewerPage: page,
  }) => {
    await page.goto(TEAM_LOGLINE_PATH);

    const textarea = page.locator("textarea").first();
    await expect(textarea).toBeVisible({ timeout: 10_000 });

    // Read-only badge visible in the toolbar
    const badge = page.getByTestId("narrative-readonly-badge");
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText(/read only/i);

    // Textarea is readonly (viewer cannot type)
    await expect(textarea).toHaveAttribute("readonly", "");

    // Save button is not rendered in read-only mode
    const saveBtn = page.getByRole("button", { name: /^save$/i });
    await expect(saveBtn).toHaveCount(0);
  });

  test("[OHW-212] viewer raw save is rejected by the server", async ({
    authenticatedViewerPage: page,
  }) => {
    await page.goto(TEAM_LOGLINE_PATH);

    // The E2E save hook is installed even in read-only mode so we can
    // verify the server guard (the UI alone isn't proof).
    await page.waitForFunction(
      () =>
        typeof (window as unknown as { __ohWritersSaveDocumentRaw?: unknown })
          .__ohWritersSaveDocumentRaw === "function",
      undefined,
      { timeout: 10_000 },
    );

    await page.evaluate(() => {
      (
        window as unknown as {
          __ohWritersSaveDocumentRaw: (content: string) => void;
        }
      ).__ohWritersSaveDocumentRaw("viewer tried to overwrite this");
    });

    // Read-only mode doesn't render SaveStatus, so we assert via the
    // network response: saveDocument returns a ResultShape with the
    // ForbiddenError tag.
    const saveResp = await page.waitForResponse(
      (resp) =>
        resp.url().includes("saveDocument") &&
        resp.request().method() === "POST",
      { timeout: 10_000 },
    );
    const raw = await saveResp.text();
    const body = JSON.parse(raw) as unknown;
    // Tanstack Start wraps server fn returns in a few shapes depending on
    // the client; unwrap progressively until we find the ResultShape.
    const findShape = (
      input: unknown,
    ): { isOk: boolean; error?: { _tag?: string } } | null => {
      if (!input || typeof input !== "object") return null;
      const o = input as Record<string, unknown>;
      if ("isOk" in o && typeof o["isOk"] === "boolean") {
        return o as { isOk: boolean; error?: { _tag?: string } };
      }
      for (const v of Object.values(o)) {
        const found = findShape(v);
        if (found) return found;
      }
      return null;
    };
    const shape = findShape(body);
    expect(shape, `no ResultShape in: ${raw}`).not.toBeNull();
    expect(shape!.isOk).toBe(false);
    expect(shape!.error?._tag).toBe("ForbiddenError");
  });

  test("[OHW-213] owner can save on the same team project", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(TEAM_LOGLINE_PATH);

    const textarea = page.locator("textarea").first();
    await expect(textarea).toBeVisible({ timeout: 10_000 });

    // Owner has full access → no read-only badge, textarea is writable.
    await expect(page.getByTestId("narrative-readonly-badge")).toHaveCount(0);
    await expect(textarea).not.toHaveAttribute("readonly", "");

    // Edit + manual save path
    const marker = `owner-write-${Date.now()}`;
    await textarea.fill(marker);

    const saveBtn = page.getByRole("button", { name: /^save$/i });
    await expect(saveBtn).toBeEnabled();
    await saveBtn.click();

    // SaveStatus transitions to "Saved"
    const savedStatus = page.locator('[class*="status"]').filter({
      hasText: /^Saved$/,
    });
    await expect(savedStatus).toBeVisible({ timeout: 10_000 });

    // Round-trip: reload and verify the marker is persisted
    await page.reload();
    await expect(page.locator("textarea").first()).toHaveValue(marker, {
      timeout: 10_000,
    });
  });
});
