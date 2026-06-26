import { test, expect } from "./fixtures";
import { BASE_URL } from "./fixtures";
import type { Page } from "@playwright/test";
import { TEST_TEAM_PROJECT_ID } from "./fixtures";
import {
  openCesareSheet,
  sendCesareMessage,
  sendCesareWithRetry,
  resetCesareState,
} from "./helpers/cesare";

/**
 * [Audit 2026-05-31 · ALTO #3 + #4] Write-from-zero + free-dispatch.
 *
 * Bug #3 — On an EMPTY new project (no screenplay) the post-logline generators
 * used to no-op (they read ONLY the screenplay) while the chat falsely reported
 * success. The fix derives each generator from the upstream NARRATIVE document
 * (logline → soggetto → sinossi …) so the chain actually writes content, and
 * never claims success on a no-op.
 *
 * Bug #4 — A free natural-language writing request must reliably dispatch a tool
 * instead of falling through to "no tools to invoke".
 *
 * Runs in the `mock-ui` Playwright project (MOCK_AI=true).
 */

// A from-scratch project for Bug #3: the test user's personal project, with its
// screenplay wiped and only the logline present, so the soggetto MUST derive
// from the logline (not the screenplay) or it dead-ends.
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

async function setNarrativeState(
  page: Page,
  projectId: string,
  present: ReadonlyArray<(typeof NARRATIVE_TYPES)[number]>,
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
  type: (typeof NARRATIVE_TYPES)[number],
): Promise<number> {
  const res = await page.request.get(
    `${BASE_URL}/api/test/set-narrative-state?projectId=${projectId}&type=${type}`,
  );
  expect(res.ok()).toBe(true);
  const body = (await res.json()) as { length: number };
  return body.length;
}

const chip = (page: Page) => page.getByTestId("cesare-next-step-chip");

test.describe("[Audit ALTO #3] write-from-zero chain", () => {
  // Clear persisted Cesare chat (Spec 51) on the shared from-scratch project so
  // a prior test's trace/result card does not bleed into this one in the serial
  // mock-ui run.
  test.beforeEach(async ({ authenticatedPage }) => {
    await resetCesareState(authenticatedPage, FROM_SCRATCH_PROJECT_ID);
  });

  test("[AUDIT-3] from-scratch: generating the soggetto from the logline ACTUALLY writes content", async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(120_000);

    // Stand the project at genuine from-scratch: ONLY the logline has content,
    // the screenplay is wiped, the soggetto is empty.
    await setNarrativeState(page, FROM_SCRATCH_PROJECT_ID, ["logline"], true);

    // Precondition: the soggetto is empty in the DB.
    expect(
      await documentContentLength(page, FROM_SCRATCH_PROJECT_ID, "soggetto"),
    ).toBe(0);

    await page.goto(SOGGETTO_PATH(FROM_SCRATCH_PROJECT_ID));
    await page.waitForLoadState("networkidle");

    await openCesareSheet(page);

    // The next step on a logline-only project is the soggetto.
    const suggestion = chip(page);
    await expect(suggestion).toBeVisible({ timeout: 10_000 });
    await expect(suggestion).toHaveAttribute("data-step", "soggetto");

    await suggestion.click();

    // The canonical agentic trace renders, and a version is auto-created (the
    // transient "Mostra modifiche" flash proves a real apply).
    const trace = page.getByTestId("cesare-change-trace");
    await expect(trace).toBeVisible({ timeout: 90_000 });
    await expect(trace.getByTestId("cesare-show-changes-btn")).toBeVisible({
      timeout: 10_000,
    });

    // DB-level proof (Bug #3 core): the soggetto now actually has content — no
    // silent no-op behind a fabricated success.
    await expect
      .poll(
        async () =>
          await documentContentLength(
            page,
            FROM_SCRATCH_PROJECT_ID,
            "soggetto",
          ),
        { timeout: 15_000 },
      )
      .toBeGreaterThan(0);
  });

  test("[AUDIT-3] truly empty project: the generator FAILS loudly, does not claim success", async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(120_000);

    // Nothing upstream at all: no logline, no soggetto, no screenplay. The
    // soggetto generator must report a failure, never "ho aggiornato il soggetto".
    await setNarrativeState(page, FROM_SCRATCH_PROJECT_ID, [], true);

    await page.goto(SOGGETTO_PATH(FROM_SCRATCH_PROJECT_ID));
    await page.waitForLoadState("networkidle");

    await openCesareSheet(page);

    // The chip suggests the logline first (the only sensible first step).
    await expect(chip(page)).toHaveAttribute("data-step", "logline", {
      timeout: 10_000,
    });

    // The user ignores the chip and explicitly asks for the soggetto. The mock
    // dispatches propose_soggetto_v2; with nothing upstream it errors, and the
    // no-false-success guard makes the reply report the failure.
    await sendCesareMessage(
      page,
      "Riscrivi il soggetto a partire dalla logline",
    );

    const conversation = page.getByTestId("cesare-conversation");
    await expect(conversation).toContainText(/non sono riuscito|non c'era/i, {
      timeout: 30_000,
    });

    // And the soggetto is still empty — nothing was fabricated.
    expect(
      await documentContentLength(page, FROM_SCRATCH_PROJECT_ID, "soggetto"),
    ).toBe(0);
  });
});

test.describe("[Audit ALTO #4] free natural-language dispatch", () => {
  test("[AUDIT-4] a free 'scrivimi una logline' request dispatches a tool (not 'no tools to invoke')", async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(120_000);

    await setNarrativeState(page, TEST_TEAM_PROJECT_ID, [], false);

    await page.goto(SOGGETTO_PATH(TEST_TEAM_PROJECT_ID));
    await page.waitForLoadState("networkidle");

    await openCesareSheet(page);

    await sendCesareWithRetry(
      page,
      "scrivimi una logline su un detective che non dorme mai",
    );

    const conversation = page.getByTestId("cesare-conversation");
    // A tool was dispatched: the reply reports the live document update, and is
    // NOT the "no tools to invoke" fallback.
    await expect(conversation).toContainText(/logline|aggiornato|applicat/i, {
      timeout: 30_000,
    });
    await expect(conversation).not.toContainText(
      /non ho strumenti specifici da invocare/i,
    );

    // DB-level proof the tool actually ran: the logline now has content.
    await expect
      .poll(
        async () =>
          await documentContentLength(page, TEST_TEAM_PROJECT_ID, "logline"),
        { timeout: 15_000 },
      )
      .toBeGreaterThan(0);
  });
});
