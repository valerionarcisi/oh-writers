import { test, expect } from "./fixtures";
import { BASE_URL } from "./fixtures";
import type { Page } from "@playwright/test";
import { TEAM_PROJECT_ID } from "./breakdown/helpers";
import {
  openCesareSheet,
  sendCesareMessage,
  resetCesareState,
} from "./helpers/cesare";

/**
 * [Spec 50] Write-from-zero with Cesare — next-step suggestion (NO wizard).
 *
 * Inside the normal Cesare chat, Cesare offers the NEXT narrative step as a
 * single suggestion chip, derived purely from which documents already have
 * content (the docs ARE the state). Clicking it runs EXACTLY ONE generation via
 * the canonical Agentic Edit Pattern — never an automatic chain. The user can
 * ignore the chip and type anything.
 *
 * Runs in the `mock-ui` Playwright project (MOCK_AI=true) via the
 * `cesare-agentic-*.spec.ts` glob.
 */

const SOGGETTO_PATH = (projectId: string) =>
  `${BASE_URL}/projects/${projectId}/soggetto`;

const NARRATIVE_TYPES = [
  "logline",
  "soggetto",
  "synopsis",
  "outline",
  "treatment",
] as const;

/**
 * Force the project's narrative document state so the suggestion is
 * deterministic. `present` lists the document types that should hold content;
 * everything else is cleared to empty.
 */
async function setNarrativeState(
  page: Page,
  projectId: string,
  present: ReadonlyArray<(typeof NARRATIVE_TYPES)[number]>,
): Promise<void> {
  const res = await page.request.post(
    `${BASE_URL}/api/test/set-narrative-state`,
    {
      data: { projectId, present },
      headers: { "Content-Type": "application/json" },
    },
  );
  expect(res.ok(), "set-narrative-state must succeed").toBe(true);
}

const chip = (page: Page) => page.getByTestId("cesare-next-step-chip");

test.describe("[Spec 50] Cesare next-step suggestion", () => {
  // Spec 51 persists Cesare sessions + document edits across the serial mock-ui
  // run. Each test sets its own narrative-doc state via setNarrativeState, but
  // reset first so a prior test's session history (and its synopsis generation)
  // never leaks in. setNarrativeState then overrides the doc content as needed.
  test.beforeEach(async ({ authenticatedPage }) => {
    await resetCesareState(authenticatedPage, TEAM_PROJECT_ID);
  });

  // ── Empty project → the suggestion is "scrivi una logline" ─────────────────
  test("[050] an empty project suggests writing a logline", async ({
    authenticatedPage: page,
  }) => {
    await setNarrativeState(page, TEAM_PROJECT_ID, []);
    await page.goto(SOGGETTO_PATH(TEAM_PROJECT_ID));
    await page.waitForLoadState("networkidle");

    await openCesareSheet(page);

    await expect(chip(page)).toBeVisible({ timeout: 10_000 });
    await expect(chip(page)).toHaveAttribute("data-step", "logline");
    await expect(chip(page)).toContainText(/logline/i);
  });

  // ── Once a logline exists → the suggestion becomes the soggetto ────────────
  test("[050] after a logline exists the suggestion becomes the soggetto", async ({
    authenticatedPage: page,
  }) => {
    await setNarrativeState(page, TEAM_PROJECT_ID, ["logline"]);
    await page.goto(SOGGETTO_PATH(TEAM_PROJECT_ID));
    await page.waitForLoadState("networkidle");

    await openCesareSheet(page);

    await expect(chip(page)).toBeVisible({ timeout: 10_000 });
    await expect(chip(page)).toHaveAttribute("data-step", "soggetto");
    await expect(chip(page)).toContainText(/soggetto/i);
  });

  // ── Clicking runs exactly ONE generation live (version + flash), no chain ──
  test("[050] clicking the suggestion runs ONE generation live (trace + version), not a chain", async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(120_000);
    // logline + soggetto present → the next step is the SYNOPSIS, which the mock
    // can generate (propose_synopsis_from_screenplay).
    await setNarrativeState(page, TEAM_PROJECT_ID, ["logline", "soggetto"]);
    await page.goto(SOGGETTO_PATH(TEAM_PROJECT_ID));
    await page.waitForLoadState("networkidle");

    await openCesareSheet(page);

    const suggestion = chip(page);
    await expect(suggestion).toBeVisible({ timeout: 10_000 });
    await expect(suggestion).toHaveAttribute("data-step", "synopsis");

    await suggestion.click();

    // The canonical agentic trace renders for the single generation.
    const trace = page.getByTestId("cesare-change-trace");
    await expect(trace).toBeVisible({ timeout: 90_000 });

    // Agentic-edit proof: a version is auto-created, surfaced via the transient
    // "Mostra modifiche" flash (Spec 47e — no inline Annulla).
    await expect(trace.getByTestId("cesare-show-changes-btn")).toBeVisible({
      timeout: 10_000,
    });
    await expect(trace.getByRole("button", { name: "Annulla" })).toHaveCount(0);

    // NO auto-chain: exactly ONE change trace exists (one generation), and the
    // chat did not fan out into multiple generation traces.
    await expect(page.getByTestId("cesare-change-trace")).toHaveCount(1);
  });

  // ── The user can ignore the suggestion and type anything freely ────────────
  test("[050] the user can ignore the chip and type a free message", async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(120_000);
    await setNarrativeState(page, TEAM_PROJECT_ID, ["logline"]);
    await page.goto(SOGGETTO_PATH(TEAM_PROJECT_ID));
    await page.waitForLoadState("networkidle");

    await openCesareSheet(page);
    // The chip is offered…
    await expect(chip(page)).toBeVisible({ timeout: 10_000 });

    // …but the user types something unrelated instead. It sends as a normal
    // chat turn (the conversation gets the user's message).
    await sendCesareMessage(page, "Ciao Cesare, come stai?");

    const conversation = page.getByTestId("cesare-conversation");
    await expect(conversation).toContainText("Ciao Cesare, come stai?", {
      timeout: 15_000,
    });
  });
});
