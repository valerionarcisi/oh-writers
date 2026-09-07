/**
 * Spec 89 — AI disclosure stamp, screenplay: direct plumbing coverage.
 *
 * Complements ai-disclosure-stamp.spec.ts (export-level assertion, driven by
 * a test-hook) with a check that a REAL Cesare tool call
 * (propose_screenplay_revision, cesare-screenplay-tools.ts) actually sets
 * screenplay_versions.everAiTouched = true on the draft it creates — not
 * just that the export reads the field correctly once it's set by hand.
 */
import { test, expect, BASE_URL } from "../fixtures";
import { TEAM_PROJECT_ID } from "../breakdown/helpers";
import {
  openCesareSheet,
  resetScreenplayState,
  sendCesareWithRetry,
} from "../helpers/cesare";

test.describe("[OHW-148] Screenplay — Cesare tool sets everAiTouched directly", () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await resetScreenplayState(authenticatedPage, TEAM_PROJECT_ID);
  });

  test("propose_screenplay_revision sets everAiTouched=true on the draft version it creates", async ({
    authenticatedPage: page,
  }) => {
    const before = await page.request.get(
      `${BASE_URL}/api/test/set-screenplay-ai-touched?projectId=${TEAM_PROJECT_ID}`,
    );
    expect((await before.json()).anyVersionAiTouched).toBe(false);

    await page.goto(`${BASE_URL}/projects/${TEAM_PROJECT_ID}/screenplay`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("prosemirror-view")).toBeVisible({
      timeout: 20_000,
    });

    await openCesareSheet(page);
    await sendCesareWithRetry(page, "Fammi una v2 più corta.");
    await expect(page.getByTestId("cesare-draft-banner")).toBeVisible({
      timeout: 10_000,
    });

    const after = await page.request.get(
      `${BASE_URL}/api/test/set-screenplay-ai-touched?projectId=${TEAM_PROJECT_ID}`,
    );
    expect((await after.json()).anyVersionAiTouched).toBe(true);
  });

  test("[Permanenza] the flag survives a manual rewrite once the Cesare draft is promoted to the active version", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`${BASE_URL}/projects/${TEAM_PROJECT_ID}/screenplay`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("prosemirror-view")).toBeVisible({
      timeout: 20_000,
    });

    // Cesare proposes a revision, the writer promotes it to the active
    // version (screenplay.currentVersionId now points at the AI-touched row
    // saveScreenplay's autosave updates in place — content changes, but
    // everAiTouched must not be cleared by that UPDATE).
    await openCesareSheet(page);
    await sendCesareWithRetry(page, "Fammi una v2 più corta.");
    const banner = page.getByTestId("cesare-draft-banner");
    await expect(banner).toBeVisible({ timeout: 10_000 });
    await page.getByTestId("cesare-draft-banner-accept").click();
    await expect(banner).toBeHidden({ timeout: 10_000 });

    const afterPromote = await page.request.get(
      `${BASE_URL}/api/test/set-screenplay-ai-touched?projectId=${TEAM_PROJECT_ID}`,
    );
    expect((await afterPromote.json()).anyVersionAiTouched).toBe(true);

    // The writer now rewrites by hand — saveScreenplay's autosave is an
    // UPDATE on the active version row's `content`, never touching
    // `everAiTouched`.
    const editor = page.getByTestId("prosemirror-view");
    await editor.click();
    await page.keyboard.type(" manual rewrite");
    await page.waitForResponse(
      (r) =>
        r.url().includes("saveScreenplay") &&
        r.request().method() === "POST" &&
        r.ok(),
      { timeout: 15_000 },
    );

    const afterRewrite = await page.request.get(
      `${BASE_URL}/api/test/set-screenplay-ai-touched?projectId=${TEAM_PROJECT_ID}`,
    );
    expect((await afterRewrite.json()).anyVersionAiTouched).toBe(true);
  });
});
