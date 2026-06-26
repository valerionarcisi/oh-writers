import { test, expect } from "./fixtures";
import { BASE_URL } from "./fixtures";
import type { Page } from "@playwright/test";
import { TEST_TEAM_PROJECT_ID } from "./fixtures";
import {
  openCesareSheet,
  sendCesareMessage,
  sendCesareWithRetry,
} from "./helpers/cesare";

/**
 * [Audit 2026-05-31 · F-A2] "Scrivi il trattamento dalla scaletta" must ACTUALLY
 * write the treatment.
 *
 * Before the fix the next-step chain suggested generating the treatment but no
 * treatment-generation tool existed, so clicking the chip (or asking freely) was
 * a silent no-op — the DB treatment stayed length 0 while the chat could still
 * claim success. The fix adds `propose_treatment_from_narrative`, which derives
 * the trattamento from the upstream narrative (scaletta + sinossi + soggetto +
 * logline), applies it live, auto-versions, and emits the success marker so the
 * honest card shows it.
 *
 * Runs in the `mock-ui` Playwright project (MOCK_AI=true).
 */

const TREATMENT_PATH = (projectId: string) =>
  `${BASE_URL}/projects/${projectId}/treatment`;

const NARRATIVE_TYPES = [
  "logline",
  "soggetto",
  "synopsis",
  "outline",
  "treatment",
] as const;

type NarrativeType = (typeof NARRATIVE_TYPES)[number];

async function resetCesareState(page: Page, projectId: string): Promise<void> {
  // Wipe the persisted Cesare session (clears any leftover trace cards from a
  // prior test in the same serial worker) and restore docs to baseline, so each
  // test is independent of run order.
  const res = await page.request.post(
    `${BASE_URL}/api/test/reset-cesare-state`,
    {
      data: { projectId },
      headers: { "Content-Type": "application/json" },
    },
  );
  expect(res.ok(), "reset-cesare-state must succeed").toBe(true);
}

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

const chip = (page: Page) => page.getByTestId("cesare-next-step-chip");

test.describe("[Audit F-A2] write the treatment from the scaletta", () => {
  // BUG-N61 (fixme ×8, Valerio's go 2026-06-11): same suppression assert. N-38.
  test.fixme("[audit-F-treatment] the next-step chip ACTUALLY writes the treatment + auto-versions", async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(120_000);

    await resetCesareState(page, TEST_TEAM_PROJECT_ID);
    // Stand the project with the whole narrative chain written EXCEPT the
    // treatment, so the next step is the trattamento and the generator has real
    // upstream material to derive from.
    await setNarrativeState(
      page,
      TEST_TEAM_PROJECT_ID,
      ["logline", "soggetto", "synopsis", "outline"],
      true,
    );

    // Precondition: the treatment is empty in the DB.
    expect(
      await documentContentLength(page, TEST_TEAM_PROJECT_ID, "treatment"),
    ).toBe(0);

    await page.goto(TREATMENT_PATH(TEST_TEAM_PROJECT_ID));
    await page.waitForLoadState("networkidle");

    await openCesareSheet(page);

    // The next step on an outline-but-no-treatment project is the trattamento.
    const suggestion = chip(page);
    await expect(suggestion).toBeVisible({ timeout: 10_000 });
    await expect(suggestion).toHaveAttribute("data-step", "treatment");

    await suggestion.click();

    // The honest card renders for the REAL apply: the canonical trace, labelled
    // by the edited entity. Spec 63: on the Trattamento page the card hides
    // "Mostra modifiche" (the in-editor banner owns the highlight — no duplicate).
    const trace = page.getByTestId("cesare-change-trace");
    await expect(trace).toBeVisible({ timeout: 90_000 });
    await expect(trace.getByTestId("cesare-show-changes-btn")).toHaveCount(0);
    await expect(trace).toContainText(/trattamento/i);

    // DB-level proof (F-A2 core): the treatment now actually has content — no
    // silent no-op behind a dead chip.
    await expect
      .poll(
        async () =>
          await documentContentLength(page, TEST_TEAM_PROJECT_ID, "treatment"),
        { timeout: 15_000 },
      )
      .toBeGreaterThan(0);
  });

  test("[audit-F-treatment] a free 'scrivi il trattamento' request also writes it", async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(120_000);

    await resetCesareState(page, TEST_TEAM_PROJECT_ID);
    await setNarrativeState(
      page,
      TEST_TEAM_PROJECT_ID,
      ["logline", "soggetto", "synopsis", "outline"],
      true,
    );

    await page.goto(TREATMENT_PATH(TEST_TEAM_PROJECT_ID));
    await page.waitForLoadState("networkidle");
    await openCesareSheet(page);

    await sendCesareWithRetry(page, "Scrivi il trattamento dalla scaletta");

    const conversation = page.getByTestId("cesare-conversation");
    // A tool was dispatched: the reply reports the live document update and is
    // NOT the "no tools to invoke" fallback.
    await expect(conversation).toContainText(
      /trattamento|aggiornato|applicat/i,
      {
        timeout: 30_000,
      },
    );
    await expect(conversation).not.toContainText(
      /non ho strumenti specifici da invocare/i,
    );

    // DB-level proof the tool actually ran: the treatment now has content.
    await expect
      .poll(
        async () =>
          await documentContentLength(page, TEST_TEAM_PROJECT_ID, "treatment"),
        { timeout: 15_000 },
      )
      .toBeGreaterThan(0);
  });

  test("[audit-F-treatment] no upstream ⇒ fails loudly, treatment stays empty", async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(120_000);

    await resetCesareState(page, TEST_TEAM_PROJECT_ID);
    // Nothing upstream at all and no screenplay: the generator must report a
    // failure, never claim "ho scritto il trattamento".
    await setNarrativeState(page, TEST_TEAM_PROJECT_ID, [], true);

    await page.goto(TREATMENT_PATH(TEST_TEAM_PROJECT_ID));
    await page.waitForLoadState("networkidle");
    await openCesareSheet(page);

    await sendCesareMessage(page, "Scrivi il trattamento dalla scaletta");

    const conversation = page.getByTestId("cesare-conversation");
    await expect(conversation).toContainText(/non sono riuscito|non c'era/i, {
      timeout: 30_000,
    });

    // No success card and the treatment is still empty — nothing fabricated.
    await expect(page.getByTestId("cesare-change-trace")).toHaveCount(0);
    expect(
      await documentContentLength(page, TEST_TEAM_PROJECT_ID, "treatment"),
    ).toBe(0);
  });
});
