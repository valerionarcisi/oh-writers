// tests/cesare-new-session-fullscreen.spec.ts
//
// [OHW-052] Glowy Cesare new-session landing (Notion AI style).
//
// Clicking the LeftRail "Nuova sessione" / "+ Nuova" opens the Cesare
// new-session landing (`/projects/:id/sessions/new`) with a centred glowing
// input, an Italian heading and quick-prompt suggestions. Per N-13 the landing
// lives INSIDE the AppShell — the rail + TopBar STAY PRESENT (not a bare
// full-screen/focus-mode takeover); the prompt is centred within the main lane.
// Typing + submitting the first message creates the session and DOCKS into the
// normal conversation view — the SAME single chat container (no duplicate). The
// landing is routed + deep-linkable.
import { test, expect } from "./fixtures";
import { BASE_URL } from "./fixtures";
import { TEAM_PROJECT_ID } from "./breakdown/helpers";

test.describe("[OHW-052] Full-screen glowy Cesare new-session landing", () => {
  test("rail 'Nuova sessione' → landing INSIDE the shell (rail present) with heading, glowing input, quick prompts", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`${BASE_URL}/projects/${TEAM_PROJECT_ID}/soggetto`);
    await page.waitForLoadState("networkidle");

    await page.getByTestId("new-session-btn").click();

    await page.waitForURL(`**/projects/${TEAM_PROJECT_ID}/sessions/new`, {
      timeout: 10_000,
    });

    const landing = page.getByTestId("cesare-new-session-landing");
    await expect(landing).toBeVisible({ timeout: 10_000 });

    // Heading + glowing input + placeholder.
    await expect(page.getByTestId("new-session-heading")).toBeVisible();
    const input = page.getByTestId("new-session-input");
    await expect(input).toBeVisible();
    await expect(input).toHaveAttribute(
      "placeholder",
      "Chiedi qualunque cosa a Cesare…",
    );
    await expect(page.getByTestId("new-session-glow")).toBeVisible();

    // At least one quick-prompt suggestion (the spec-50 next step + generic
    // starters).
    await expect(
      page.getByTestId("new-session-suggestion").first(),
    ).toBeVisible();

    // N-13: the landing lives INSIDE the AppShell — it does NOT engage focus
    // mode, and the rail stays present (non-zero width), so the rail nav is
    // reachable while composing.
    await expect
      .poll(() => page.evaluate(() => document.body.getAttribute("data-shell")))
      .not.toBe("focus");
    const railWidth = await page.evaluate(() => {
      const rail = document.querySelector("main")?.previousElementSibling;
      return rail ? rail.getBoundingClientRect().width : -1;
    });
    expect(railWidth).toBeGreaterThan(0);
  });

  test("type + submit → session created, page docks into the conversation, single chat container", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`${BASE_URL}/projects/${TEAM_PROJECT_ID}/sessions/new`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("cesare-new-session-landing")).toBeVisible({
      timeout: 10_000,
    });

    await page.getByTestId("new-session-input").fill("Aiutami con la storia");
    await page.getByTestId("new-session-send").click();

    // A real session row is created and we route to its central conversation.
    await page.waitForURL(
      new RegExp(`/projects/${TEAM_PROJECT_ID}/sessions/[0-9a-f-]+$`),
      { timeout: 10_000 },
    );

    const conversation = page.getByTestId("session-conversation");
    await expect(conversation).toBeVisible({ timeout: 10_000 });

    // The first message docked into the conversation (the trace renders behind).
    await expect(conversation).toContainText("Aiutami con la storia", {
      timeout: 10_000,
    });

    // Single chat container — exactly one conversation surface and one composer,
    // never a fork/duplicate.
    await expect(page.getByTestId("session-conversation")).toHaveCount(1);
    await expect(page.getByTestId("session-composer")).toHaveCount(1);

    // The conversation is a normal shell page; focus mode is never engaged.
    await expect
      .poll(() => page.evaluate(() => document.body.getAttribute("data-shell")))
      .not.toBe("focus");
  });

  test("deep-link straight to the landing renders the surface inside the shell", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`${BASE_URL}/projects/${TEAM_PROJECT_ID}/sessions/new`);
    await page.waitForLoadState("networkidle");

    await expect(page.getByTestId("cesare-new-session-landing")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByTestId("new-session-heading")).toBeVisible();
    // N-13: rail present (non-focus) even on a direct deep-link.
    await expect
      .poll(() => page.evaluate(() => document.body.getAttribute("data-shell")))
      .not.toBe("focus");
    const railWidth = await page.evaluate(() => {
      const rail = document.querySelector("main")?.previousElementSibling;
      return rail ? rail.getBoundingClientRect().width : -1;
    });
    expect(railWidth).toBeGreaterThan(0);
  });

  test("a quick-prompt seeds the composer (the corresponding flow)", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`${BASE_URL}/projects/${TEAM_PROJECT_ID}/sessions/new`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("cesare-new-session-landing")).toBeVisible({
      timeout: 10_000,
    });

    // Pick a "starter" chip — these seed the composer so the user can refine
    // before sending (the next-step chip starts its flow directly).
    const starter = page
      .getByTestId("new-session-suggestion")
      .filter({ hasText: "Esplora un'idea per il film" });
    await expect(starter).toBeVisible();
    await starter.click();

    const input = page.getByTestId("new-session-input");
    await expect(input).not.toHaveValue("");
  });
});
