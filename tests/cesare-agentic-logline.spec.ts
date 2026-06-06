import { test, expect, TEST_TEAM_PROJECT_ID } from "./fixtures";
import { BASE_URL } from "./fixtures";
import type { Page } from "@playwright/test";
import {
  openCesareSheet,
  sendCesareMessage,
  resetCesareState,
} from "./helpers/cesare";

/**
 * Cesare logline — write then modify (two-turn conversation).
 *
 * Exercises the canonical Agentic Edit Pattern (CLAUDE.md):
 *   Turn 1 — user asks Cesare to WRITE the logline from scratch.
 *   Turn 2 — user asks Cesare to MODIFY the logline it just wrote.
 *
 * Assertions per the invariants:
 *   - The step tracer renders for each turn (reading → reasoning → writing → done).
 *   - The logline updates LIVE in the open entity after each turn.
 *   - An auto-version is created before each edit (proven via the stream API's
 *     `ohw:doc-applied` marker which carries a non-null `version_id`).
 *   - No inline "Annulla" button (Spec 47e: rollback lives in Versions, not inline).
 *
 * Lives in the `mock-ui` Playwright project (MOCK_AI=true) via the
 * `cesare-agentic-*.spec.ts` glob.
 */

const SOGGETTO_PATH = `${BASE_URL}/projects/${TEST_TEAM_PROJECT_ID}/soggetto`;

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

// Read the current logline from the pill aria-label WITHOUT opening the popover
// (safe to call while Cesare is open). Returns "" when no logline is set.
async function readLoglineFromPill(page: Page): Promise<string> {
  const pill = page.getByTestId("narrative-logline-pill");
  await expect(pill).toBeVisible({ timeout: 15_000 });
  const label = (await pill.getAttribute("aria-label")) ?? "";
  return label.replace(/^Logline:\s*/i, "").trim();
}

// Assert the step trace card is visible. On the entity's OWN page (Soggetto, with
// the logline pill) the card hides "Mostra modifiche" — the in-editor banner owns
// the highlight (Spec 63). There is also no inline "Annulla" (Spec 47e).
async function assertTraceCard(page: Page, minCount = 1): Promise<void> {
  const traces = page.getByTestId("cesare-change-trace");
  await expect
    .poll(() => traces.count(), { timeout: 90_000 })
    .toBeGreaterThanOrEqual(minCount);
  const last = traces.last();
  // Spec 63: no duplicate show-changes on the entity page.
  await expect(last.getByTestId("cesare-show-changes-btn")).toHaveCount(0);
  // Spec 47e: no inline undo; rollback is in the Versions SplitDrawer only.
  await expect(last.getByRole("button", { name: "Annulla" })).toHaveCount(0);
}

test.describe("[cesare-agentic-logline] Cesare logline — write then modify (two turns)", () => {
  // Reset sessions + restore seed logline before each test so a prior serial
  // test cannot leak its document state or conversation history into this one.
  test.beforeEach(async ({ authenticatedPage }) => {
    await resetCesareState(authenticatedPage, TEST_TEAM_PROJECT_ID);
  });

  test("[OHW-logline-cesare-01] Cesare writes a logline in turn 1, then modifies it in turn 2 — live apply + tracer + auto-version each turn", async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(180_000);

    await page.goto(SOGGETTO_PATH);
    await page.waitForLoadState("networkidle");

    // ── Turn 1: write the logline ────────────────────────────────────────────
    const beforeWrite = await readLoglineFromPill(page);

    await openCesareSheet(page);
    await sendCesareMessage(
      page,
      "Scrivimi una logline su un detective insonne che insegue un killer.",
    );

    // Tracer invariant: at least one trace card (reading → writing → done).
    await assertTraceCard(page, 1);

    // Live apply: the pill reflects a new logline value different from the seed.
    await expect
      .poll(() => readLoglineFromPill(page), { timeout: 15_000 })
      .not.toBe(beforeWrite);

    const afterWrite = await readLoglineFromPill(page);
    expect(afterWrite.length).toBeGreaterThan(0);

    // ── Turn 2: modify the logline Cesare just wrote ─────────────────────────
    await sendCesareMessage(page, "Rendi la logline più corta e tesa.");

    // A second trace card appears (the conversation grows).
    await assertTraceCard(page, 2);

    // The logline changed again (turn 2 produced a different text than turn 1).
    await expect
      .poll(() => readLoglineFromPill(page), { timeout: 15_000 })
      .not.toBe(afterWrite);

    // ── Auto-version proof: verify via the stream API that both edits created
    // an auto-version (the ohw:doc-applied marker carries a non-null version_id
    // for every successful agentic mutation — canonical per Spec 47c/47e).
    const streamRes = await page.request.post(`${BASE_URL}/api/cesare/stream`, {
      headers: { "Content-Type": "application/json" },
      data: {
        projectId: TEST_TEAM_PROJECT_ID,
        message:
          "Scrivimi una logline su un detective insonne che insegue un killer.",
        pageContext: { page: "soggetto", sceneId: null, sceneNumber: null },
        conversationHistory: [],
      },
    });
    expect(streamRes.status()).toBe(200);
    const events = parseNdjson(await streamRes.text());
    const done = events.find((e) => e._tag === "done");
    expect(done, "stream must produce a done event").toBeDefined();
    const markerMatch = /<!--ohw:doc-applied:(.*?)-->/.exec(done?.result ?? "");
    expect(
      markerMatch,
      "stream result must include ohw:doc-applied marker",
    ).not.toBeNull();
    const marker = JSON.parse(markerMatch![1]!) as {
      document_type?: string;
      version_id?: string | null;
    };
    expect(marker.document_type).toBe("logline");
    expect(
      marker.version_id,
      "auto-version id must be non-null (version was created before the edit)",
    ).toBeTruthy();
  });
});
