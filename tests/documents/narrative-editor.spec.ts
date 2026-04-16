/**
 * Spec 04 — Narrative Editor E2E (logline, synopsis, treatment)
 *
 * Blocco 1 — content caps (client + server):
 *   [OHW-204] Logline counter shows warn class above 180 chars (90% of 200)
 *   [OHW-205] Logline textarea refuses input past 200 chars (HTML maxLength)
 *   [OHW-206] Server rejects saveDocument with content longer than LOGLINE_MAX
 *             even when the HTML maxLength has been bypassed
 */

import { test, expect } from "../fixtures";
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
