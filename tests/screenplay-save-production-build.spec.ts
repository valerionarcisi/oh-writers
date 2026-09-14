// tests/screenplay-save-production-build.spec.ts
//
// Regression for issue #174 — saveScreenplay returned 500 ("Async validation
// not supported") on beta/prod but not under `vinxi dev`. Root cause: the app
// pins zod@3, better-auth (a direct dependency) requires zod@4, and Vite's SSR
// build left `zod` as a bare runtime import — at deploy time a single
// `node_modules/zod` served every consumer and could resolve to the wrong
// major for a given schema (zod@4's `z.record(z.unknown())` Standard Schema
// validate() is broken, crashing instead of returning a sync result). Fixed
// via `vite.ssr.noExternal: ["zod"]` in app.config.ts, which bundles each
// chunk's own correctly-resolved zod instead of leaving it external.
//
// This duplicates editor.spec.ts's "[086] content persists after edit +
// save" against a REAL production build (`vinxi build` + `vinxi start`),
// since that class of bug only exists in the bundled output — `vinxi dev`
// never goes through Nitro's build pipeline and cannot catch it.
import { test, expect } from "./fixtures";
import { waitForEditor, goToNewLine, getEditorContent } from "./helpers";

test.describe("[prod-build] screenplay save", () => {
  test("saveScreenplay succeeds and content persists across reload", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    await page.goto(`/projects/${testProjectId}/screenplay`);
    await waitForEditor(page);
    await goToNewLine(page);

    const marker = `MARKER_${Date.now()}`;
    await page.keyboard.type(marker);

    const [resp] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes("saveScreenplay") && r.request().method() === "POST",
        { timeout: 15_000 },
      ),
      page.evaluate(() =>
        (
          window as unknown as { __ohWritersForceSave?: () => void }
        ).__ohWritersForceSave?.(),
      ),
    ]);
    expect(resp.ok()).toBe(true);

    await expect(
      page.locator('[data-testid="save-status-indicator"][data-state="saved"]'),
    ).toBeVisible({ timeout: 10_000 });

    await page.reload();
    await waitForEditor(page);

    const content = await getEditorContent(page);
    expect(content).toContain(marker);
  });
});
