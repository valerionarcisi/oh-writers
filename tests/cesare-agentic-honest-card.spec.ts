import { test, expect } from "./fixtures";
import { BASE_URL } from "./fixtures";
import type { Page } from "@playwright/test";
import {
  openCesareSheet,
  sendCesareMessage,
  resetCesareState,
} from "./helpers/cesare";

/**
 * [Audit 2026-05-31 · F-A3 + F-M1] Cesare's result card must reflect the REAL
 * tool result, never a page/text heuristic.
 *
 * F-A3 — the `ChangeTrace` "Aggiornato X · Mostra modifiche" card used to render
 * whenever ANY tool ran, even when the tool no-op'd or failed (DB unchanged). It
 * derived the card from the current page + a text match on the reply, never from
 * the actual apply. The fix binds the card to the server's real apply markers
 * (`doc-applied` for narrative docs, `entity-applied` for budget/location/
 * schedule/shooting). No marker ⇒ no success card, only the honest outcome text.
 *
 * F-M1 — the entity label now comes from the marker's entity (what was actually
 * edited), not from the page: a logline edit reads "logline", never "Soggetto".
 *
 * Runs in the `mock-ui` Playwright project (MOCK_AI=true).
 */

// The test user's personal project, used here at genuine from-scratch.
const FROM_SCRATCH_PROJECT_ID = "00000000-0000-4000-a000-000000000010";

const SOGGETTO_PATH = (projectId: string) =>
  `${BASE_URL}/projects/${projectId}/soggetto`;

const NARRATIVE_TYPES = [
  "logline",
  "soggetto",
  "synopsis",
  "outline",
  "treatment",
] as const;

type NarrativeType = (typeof NARRATIVE_TYPES)[number];

async function setNarrativeState(
  page: Page,
  projectId: string,
  present: ReadonlyArray<NarrativeType>,
  clearScreenplay: boolean,
): Promise<void> {
  const res = await page.request.post(
    `${BASE_URL}/api/test/set-narrative-state`,
    {
      data: { projectId, present, clearScreenplay },
      headers: { "Content-Type": "application/json" },
    },
  );
  expect(res.ok(), "set-narrative-state must succeed").toBe(true);
}

async function documentContentLength(
  page: Page,
  projectId: string,
  type: NarrativeType,
): Promise<number> {
  const res = await page.request.get(
    `${BASE_URL}/api/test/set-narrative-state?projectId=${projectId}&type=${type}`,
  );
  expect(res.ok()).toBe(true);
  const body = (await res.json()) as { length: number };
  return body.length;
}

test.describe("[Audit F-A3] honest result card — no fabricated success", () => {
  // Spec 51 persists Cesare chat across the serial mock-ui run, so a result
  // card rendered by an EARLIER test on this same project stays in the DOM and
  // makes the "no card" assertion see a stale `cesare-change-trace`. Wipe the
  // project's sessions before each test (setNarrativeState only resets the
  // documents, not the chat thread).
  test.beforeEach(async ({ authenticatedPage }) => {
    await resetCesareState(authenticatedPage, FROM_SCRATCH_PROJECT_ID);
  });

  test("[OHW-AUDIT-FA3] a no-op tool shows NO success card and leaves the DB unchanged", async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(120_000);

    // Truly empty project: nothing upstream at all. Asking for the soggetto
    // dispatches propose_soggetto_v2; with no upstream it errors — a genuine
    // no-op against the DB.
    await setNarrativeState(page, FROM_SCRATCH_PROJECT_ID, [], true);
    expect(
      await documentContentLength(page, FROM_SCRATCH_PROJECT_ID, "soggetto"),
    ).toBe(0);

    await page.goto(SOGGETTO_PATH(FROM_SCRATCH_PROJECT_ID));
    await page.waitForLoadState("networkidle");
    await openCesareSheet(page);

    await sendCesareMessage(
      page,
      "Riscrivi il soggetto a partire dalla logline",
    );

    const conversation = page.getByTestId("cesare-conversation");
    // Honest outcome: the reply reports the failure…
    await expect(conversation).toContainText(/non sono riuscito|non c'era/i, {
      timeout: 30_000,
    });

    // …and crucially the success card is ABSENT — no "Aggiornato X", no
    // "Mostra modifiche" over a tool that did nothing.
    await expect(page.getByTestId("cesare-change-trace")).toHaveCount(0);
    await expect(
      page.getByTestId("cesare-show-changes-btn"),
    ).toHaveCount(0);

    // DB-level proof: nothing was written.
    expect(
      await documentContentLength(page, FROM_SCRATCH_PROJECT_ID, "soggetto"),
    ).toBe(0);
  });

  test("[OHW-AUDIT-FM1] a real logline edit shows the card labelled by the edited entity (logline, not Soggetto)", async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(120_000);

    // Stand the project with a logline present so write_logline edits it for real.
    await setNarrativeState(page, FROM_SCRATCH_PROJECT_ID, ["logline"], true);

    // We are on the SOGGETTO page, but the edit targets the LOGLINE: the card
    // must read the marker's entity, not the page.
    await page.goto(SOGGETTO_PATH(FROM_SCRATCH_PROJECT_ID));
    await page.waitForLoadState("networkidle");
    await openCesareSheet(page);

    await sendCesareMessage(page, "Rendi la logline più corta e tesa");

    // The real apply renders the canonical trace with "Mostra modifiche".
    const trace = page.getByTestId("cesare-change-trace");
    await expect(trace).toBeVisible({ timeout: 60_000 });
    await expect(
      trace.getByTestId("cesare-show-changes-btn"),
    ).toBeVisible({ timeout: 10_000 });

    // F-M1: the card titles the actually-edited entity. It must say "Logline"
    // and never mislabel it as "Soggetto" just because that's the open page.
    await expect(trace).toContainText(/logline/i);
    await expect(trace).not.toContainText(/soggetto/i);

    // DB-level proof the edit really landed.
    await expect
      .poll(
        async () =>
          await documentContentLength(page, FROM_SCRATCH_PROJECT_ID, "logline"),
        { timeout: 15_000 },
      )
      .toBeGreaterThan(0);
  });
});
