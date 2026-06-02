import { test, expect } from "./fixtures";
import { BASE_URL } from "./fixtures";
import type { Page } from "@playwright/test";
import { TEAM_PROJECT_ID } from "./breakdown/helpers";
import { resetCesareState } from "./helpers/cesare";

/**
 * [Spec 47c] Logline unified + Cesare write/edit (A8).
 *
 * PHASE 2 — the logline is a single source of truth: the `logline` document.
 * The overview pill on a narrative page edits THAT document and persists.
 *
 * PHASE 3 — Cesare can WRITE a logline from a free instruction and EDIT the
 * existing one via the universal `write_logline` tool. Both follow the canonical
 * agentic-edit pattern: apply LIVE to the open logline, auto-create a version
 * BEFORE applying, render the inline trace with the transient "Mostra / Nascondi
 * modifiche" flash (Spec 47e — no inline Annulla; rollback lives in Versions).
 *
 * Lives in the `mock-ui` Playwright project (MOCK_AI=true) via the
 * `cesare-agentic-*.spec.ts` glob.
 */

const SOGGETTO_PATH = (projectId: string) =>
  `${BASE_URL}/projects/${projectId}/soggetto`;

async function openLoglinePill(page: Page) {
  const pill = page.getByTestId("narrative-logline-pill");
  await expect(pill).toBeVisible({ timeout: 15_000 });
  await pill.click();
  const editor = page.getByTestId("narrative-logline-editor");
  await expect(editor).toBeVisible({ timeout: 5_000 });
  return editor;
}

/**
 * Read the current logline WITHOUT opening the popover. The pill button carries
 * the full logline in its aria-label (`Logline: <text>`), so we can poll it
 * while the Cesare sheet is open without the popover stealing focus/clicks.
 */
async function readLoglineFromPill(page: Page): Promise<string> {
  const pill = page.getByTestId("narrative-logline-pill");
  await expect(pill).toBeVisible({ timeout: 15_000 });
  const label = (await pill.getAttribute("aria-label")) ?? "";
  return label.replace(/^Logline:\s*/, "").trim();
}

async function openCesare(page: Page): Promise<void> {
  // The dock's Cesare toggle and the rail's sessions header both carry the
  // accessible name "Apri Cesare"; scope to the bottom dock to open the
  // floating chat.
  const trigger = page
    .getByTestId("bottom-dock")
    .getByTestId("cesare-open-btn");
  await trigger.waitFor({ state: "visible", timeout: 15_000 });
  await trigger.click();
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

interface StreamEvent {
  _tag: string;
  entity?: { domain: string };
  result?: string;
}

function parseNdjson(body: string): StreamEvent[] {
  return body
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l) as StreamEvent);
}

test.describe("[Spec 47c] Cesare logline — unify + write/edit", () => {
  // Spec 51 persists the logline document edits + Cesare sessions; the mock-ui
  // project runs serially against one shared DB. These tests assert the logline
  // CHANGED (after !== before), so a prior test that already wrote the same mock
  // logline would make `before === after` and break the assertion. Restore the
  // seed logline + clear sessions before each test.
  test.beforeEach(async ({ authenticatedPage }) => {
    await resetCesareState(authenticatedPage, TEAM_PROJECT_ID);
  });

  // ── HAPPY: edit the logline by hand persists across reload ─────────────────
  test("[OHW-047-A8] editing the logline by hand persists across reload (single source of truth)", async ({
    authenticatedPage: page,
  }) => {
    // Shrink the 30s autosave debounce so the edit persists within the test.
    await page.addInitScript("window.__ohWritersAutoSaveDelayMs = 300;");
    await page.goto(SOGGETTO_PATH(TEAM_PROJECT_ID));
    await page.waitForLoadState("networkidle");

    const editor = await openLoglinePill(page);
    const unique = `Una logline scritta a mano ${Date.now()}`;
    await editor.fill(unique);
    // Autosave debounce (300ms) + round-trip; give it margin before reloading.
    await page.waitForTimeout(2_000);

    await page.reload();
    await page.waitForLoadState("networkidle");
    const reloadedEditor = await openLoglinePill(page);
    await expect(reloadedEditor).toHaveValue(unique, { timeout: 10_000 });
  });

  // ── HAPPY: Cesare WRITES a logline from a free prompt → live + version, and
  // the edit is ALWAYS kept (no inline Annulla — Spec 47e) ────────────────────
  test("[OHW-047-A8] Cesare writes a logline from a free prompt: applies live, auto-versions, no inline Annulla", async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(120_000);
    await page.goto(SOGGETTO_PATH(TEAM_PROJECT_ID));
    await page.waitForLoadState("networkidle");

    // Capture the logline before Cesare writes it.
    const before = await readLoglineFromPill(page);

    await openCesare(page);
    await sendCesare(
      page,
      "Scrivimi una logline su un detective insonne che insegue un killer.",
    );

    // The agentic trace renders (N passaggi › Aggiornato Logline › Fatto).
    const trace = page.getByTestId("cesare-change-trace");
    await expect(trace).toBeVisible({ timeout: 90_000 });

    // The logline document updated LIVE: the pill shows the new value (the doc
    // query is invalidated after the live apply on a doc page).
    await expect
      .poll(async () => readLoglineFromPill(page), { timeout: 15_000 })
      .not.toBe(before);

    // Spec 47e: the inline "Annulla" affordance is gone. The edit is kept; the
    // pill keeps the new logline (rollback lives in the Versions SplitDrawer).
    await expect(trace.getByRole("button", { name: "Annulla" })).toHaveCount(0);
    await expect(
      trace.getByTestId("cesare-show-changes-btn"),
    ).toBeVisible({ timeout: 5_000 });
    await expect
      .poll(async () => readLoglineFromPill(page), { timeout: 5_000 })
      .not.toBe(before);
  });

  // ── HAPPY: Cesare EDITS the existing logline → live + version ───────────────
  test("[OHW-047-A8] Cesare edits the existing logline: applies live and auto-versions", async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(120_000);
    await page.goto(SOGGETTO_PATH(TEAM_PROJECT_ID));
    await page.waitForLoadState("networkidle");

    const before = await readLoglineFromPill(page);

    await openCesare(page);
    await sendCesare(page, "Rendi la logline più corta e tesa.");

    const trace = page.getByTestId("cesare-change-trace");
    await expect(trace).toBeVisible({ timeout: 90_000 });

    // The edit landed live: the logline changed.
    await expect
      .poll(async () => readLoglineFromPill(page), { timeout: 15_000 })
      .not.toBe(before);

    // A version was auto-created (rollback lives in the Versions SplitDrawer);
    // the inline trace offers the transient "Mostra modifiche" flash, no Annulla.
    await expect(
      trace.getByTestId("cesare-show-changes-btn"),
    ).toBeVisible({ timeout: 5_000 });
    await expect(trace.getByRole("button", { name: "Annulla" })).toHaveCount(0);
  });

  // ── CROSS-PAGE: write_logline works from a NON-document page ────────────────
  test("[OHW-047-A8] write_logline is universal: a request on the Sceneggiatura page writes the logline (writing{logline}, version applied live)", async ({
    authenticatedPage: page,
  }) => {
    const res = await page.request.post(`${BASE_URL}/api/cesare/stream`, {
      headers: { "Content-Type": "application/json" },
      data: {
        projectId: TEAM_PROJECT_ID,
        message:
          "Scrivimi una logline su un detective insonne che insegue un killer.",
        pageContext: { page: "screenplay", sceneId: null, sceneNumber: null },
        conversationHistory: [],
      },
    });
    expect(res.status(), "stream route must authorize + accept").toBe(200);

    const events = parseNdjson(await res.text());
    const done = events.find((e) => e._tag === "done");
    expect(
      done,
      `expected a done event; got ${JSON.stringify(events)}`,
    ).toBeDefined();

    // The cross-domain write surfaced as writing{logline} even though the page
    // is the Sceneggiatura.
    const wroteLogline = events
      .filter((e) => e._tag === "writing")
      .some((e) => e.entity?.domain === "logline");
    expect(
      wroteLogline,
      `expected a writing{logline} event; got ${JSON.stringify(events)}`,
    ).toBe(true);

    // The version was applied LIVE: the doc-applied marker carries the logline
    // document_type + a non-null version_id (agentic-edit proof).
    const result = done?.result ?? "";
    const markerMatch = /<!--ohw:doc-applied:(.*?)-->/.exec(result);
    expect(
      markerMatch,
      `expected an ohw:doc-applied marker; got ${result}`,
    ).not.toBeNull();
    const marker = JSON.parse(markerMatch![1]!) as {
      document_type?: string;
      version_id?: string | null;
    };
    expect(marker.document_type).toBe("logline");
    expect(
      marker.version_id,
      "a new logline version id must be present",
    ).toBeTruthy();
  });

  // ── SAD: an empty instruction is rejected (no logline written) ──────────────
  test("[OHW-047-A8] an empty Cesare request is rejected (no logline written)", async ({
    authenticatedPage: page,
  }) => {
    const res = await page.request.post(`${BASE_URL}/api/cesare/stream`, {
      headers: { "Content-Type": "application/json" },
      data: {
        projectId: TEAM_PROJECT_ID,
        message: "",
        pageContext: { page: "soggetto", sceneId: null, sceneNumber: null },
        conversationHistory: [],
      },
    });
    // CesareInputSchema requires message.min(1); the route 400s an empty body.
    expect(res.status()).toBe(400);
  });

  // ── SAD: the applied logline never exceeds the 200-char cap (unify) ─────────
  test("[OHW-047-A8] a Cesare-written logline never exceeds the 200-char cap", async ({
    authenticatedPage: page,
  }) => {
    const res = await page.request.post(`${BASE_URL}/api/cesare/stream`, {
      headers: { "Content-Type": "application/json" },
      data: {
        projectId: TEAM_PROJECT_ID,
        message:
          "Scrivimi una logline su un detective insonne, lunghissima, prolissa, con tantissimi dettagli.",
        pageContext: { page: "screenplay", sceneId: null, sceneNumber: null },
        conversationHistory: [],
      },
    });
    expect(res.status()).toBe(200);
    const events = parseNdjson(await res.text());
    const done = events.find((e) => e._tag === "done");
    const markerMatch = /<!--ohw:doc-applied:(.*?)-->/.exec(done?.result ?? "");
    expect(markerMatch, "expected the logline to be applied").not.toBeNull();
    const marker = JSON.parse(markerMatch![1]!) as { document_type?: string };
    expect(marker.document_type).toBe("logline");

    // The persisted logline content is at most 200 chars (sanitizeLogline cap +
    // the document save cap). We read it back through the document query the UI
    // uses, by reloading the soggetto page and inspecting the pill.
    await page.goto(SOGGETTO_PATH(TEAM_PROJECT_ID));
    await page.waitForLoadState("networkidle");
    const editor = await openLoglinePill(page);
    const value = await editor.inputValue();
    expect(value.length).toBeLessThanOrEqual(200);
  });
});
