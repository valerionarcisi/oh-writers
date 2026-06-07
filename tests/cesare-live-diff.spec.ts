// tests/cesare-live-diff.spec.ts
//
// [ADR-0003] No word-level diff highlight in the editor, ever.
//
// A Cesare edit to a narrative document (Soggetto, Sinossi, Trattamento, logline)
// applies LIVE to the open editor and the editor always shows the FINAL text,
// clean — like a normal document. The audience is writers/directors/producers,
// so the change is never communicated as a programmer-style green/red word diff
// painted inside the prose. `CesareLiveDiff` is no longer mounted on any editor.
//
// What still holds on the entity's own page:
//   - the edit is applied live (the new text is in the editor);
//   - the result card renders the agentic ChangeTrace;
//   - there is NO inline "Annulla" (rollback lives in Versions);
//   - clicking "Mostra modifiche" NEVER paints an inline `cesare-live-diff-inline`
//     highlight inside the editor — the document stays clean.
//
// Runs in the default chromium project against the mock AI (the webServer always
// sets MOCK_AI=true).
import { test, expect } from "./fixtures";
import type { ConsoleMessage, Page } from "@playwright/test";
import { BASE_URL } from "./fixtures";
import { TEAM_PROJECT_ID } from "./breakdown/helpers";
import { resetCesareState } from "./helpers/cesare";

async function openCesare(page: Page): Promise<void> {
  const trigger = page
    .getByTestId("bottom-dock")
    .getByTestId("cesare-open-btn");
  await trigger.waitFor({ state: "visible", timeout: 15_000 });
  // The dock pill's react-aria press can be cancelled by layout settling on
  // heavy routes; retry until the shell reports the drawer open.
  await expect(async () => {
    await trigger.click();
    expect(await page.evaluate(() => document.body.dataset.cesare)).toBe(
      "expanded",
    );
  }).toPass({ timeout: 15_000 });
  await page
    .getByPlaceholder("Chiedi a Cesare…")
    .waitFor({ state: "visible", timeout: 5_000 });
  await page.waitForTimeout(400);
}

async function sendCesare(page: Page, text: string): Promise<void> {
  const input = page.getByPlaceholder("Chiedi a Cesare…");
  await input.focus();
  await input.fill(text);
  await expect(input).toHaveValue(text, { timeout: 5_000 });
  const sendBtn = page.getByTestId("cesare-send-btn");
  await expect(sendBtn).toBeEnabled({ timeout: 5_000 });
  await sendBtn.click();
}

/** Collect "Maximum update depth exceeded" console errors for the lifetime of
 *  the test, so we can assert the editor never enters a render loop. */
function trackUpdateDepthErrors(page: Page): { count: () => number } {
  let n = 0;
  const onConsole = (m: ConsoleMessage) => {
    if (m.type() === "error" && m.text().includes("Maximum update depth")) n++;
  };
  page.on("console", onConsole);
  return { count: () => n };
}

test.describe("[ADR-0003] Cesare edit applies live; the editor never paints an inline diff", () => {
  // Reset the shared Cesare chat store so a prior turn (this run) can't bleed in.
  test.beforeEach(async ({ authenticatedPage }) => {
    await resetCesareState(authenticatedPage, TEAM_PROJECT_ID);
  });

  test("the new version lands in the editor clean; no inline diff; no Annulla; no update-depth loop", async ({
    authenticatedPage,
  }) => {
    test.setTimeout(120_000);
    const loop = trackUpdateDepthErrors(authenticatedPage);

    await authenticatedPage.goto(
      `${BASE_URL}/projects/${TEAM_PROJECT_ID}/soggetto`,
    );
    await authenticatedPage.waitForLoadState("networkidle");

    await openCesare(authenticatedPage);
    await sendCesare(
      authenticatedPage,
      "Fammi un v2 del soggetto più asciutto.",
    );

    const trace = authenticatedPage.getByTestId("cesare-change-trace");
    await expect(trace).toBeVisible({ timeout: 90_000 });

    // The edit is applied LIVE: the deterministic v2 marker is in the document.
    const editor = authenticatedPage.getByTestId("subject-editor");
    const appliedMarker = "Marco torna a Falerone";
    await expect(editor).toContainText(appliedMarker, { timeout: 15_000 });

    // No inline "Annulla" affordance on the trace card (rollback lives in
    // Versions, ADR-0001).
    await expect(trace.getByRole("button", { name: "Annulla" })).toHaveCount(0);

    // The editor never paints an inline word-level diff — not before clicking
    // "Mostra modifiche"…
    await expect(
      authenticatedPage.getByTestId("cesare-live-diff-inline"),
    ).toHaveCount(0);

    // …and not after. "Mostra modifiche" is still offered on the floating drawer
    // card, but it does NOT decorate the prose: the document stays clean (the
    // change is already applied; ADR-0003).
    await trace.getByTestId("cesare-show-changes-btn").click();
    // Give any (incorrect) inline highlight a chance to render — it must not.
    await authenticatedPage.waitForTimeout(800);
    await expect(
      authenticatedPage.getByTestId("cesare-live-diff-inline"),
    ).toHaveCount(0);

    // The document still holds the new version — nothing reverted.
    await expect(editor).toContainText(appliedMarker, { timeout: 5_000 });

    // Regression: no "Maximum update depth exceeded" anywhere in the flow.
    expect(loop.count()).toBe(0);
  });
});
