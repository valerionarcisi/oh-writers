// tests/cesare-new-session-fullscreen.spec.ts
//
// [OHW-052] Full-screen glowy Cesare new-session landing (Notion AI style).
//
// Clicking the LeftRail "Nuova sessione" / "+ Nuova" opens a full-screen Cesare
// landing (`/projects/:id/sessions/new`) with a centred glowing input, an
// Italian heading and quick-prompt suggestions, with the rail + topstrip receded
// (AppShell focus mode). Typing + submitting the first message creates the
// session and DOCKS into the normal conversation view — the SAME single chat
// container (no duplicate). The landing is routed + deep-linkable, and
// `prefers-reduced-motion` removes the glow animation.
import { test, expect } from "./fixtures";
import { BASE_URL } from "./fixtures";
import { TEAM_PROJECT_ID } from "./breakdown/helpers";

test.describe("[OHW-052] Full-screen glowy Cesare new-session landing", () => {
  test("rail 'Nuova sessione' → full-screen landing (focus mode) with heading, glowing input, quick prompts", async ({
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
    await expect(
      page.getByTestId("new-session-heading"),
    ).toBeVisible();
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

    // Focus mode: the rail recedes (body[data-shell="focus"] drives the rail
    // to display:none via CSS, so the rail occupies zero width).
    await expect
      .poll(() => page.evaluate(() => document.body.getAttribute("data-shell")))
      .toBe("focus");
    const railWidth = await page.evaluate(() => {
      const rail = document.querySelector("main")?.previousElementSibling;
      return rail ? rail.getBoundingClientRect().width : -1;
    });
    expect(railWidth).toBe(0);
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

    // Focus mode is released once the landing unmounts (the conversation is a
    // normal shell page with the rail back).
    await expect
      .poll(() => page.evaluate(() => document.body.getAttribute("data-shell")))
      .not.toBe("focus");
  });

  test("deep-link straight to the landing renders the full-screen surface", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`${BASE_URL}/projects/${TEAM_PROJECT_ID}/sessions/new`);
    await page.waitForLoadState("networkidle");

    await expect(page.getByTestId("cesare-new-session-landing")).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page.getByTestId("new-session-heading"),
    ).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => document.body.getAttribute("data-shell")))
      .toBe("focus");
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

  test("prefers-reduced-motion → the glow ring is not animated", async ({
    authenticatedPage: page,
  }) => {
    // Force reduced motion on the authenticated page. The glow ring must drop
    // its animation (static ring) under the media query.
    await page.emulateMedia({ reducedMotion: "reduce" });

    await page.goto(`${BASE_URL}/projects/${TEAM_PROJECT_ID}/sessions/new`);
    await expect(page.getByTestId("cesare-new-session-landing")).toBeVisible({
      timeout: 10_000,
    });

    const ringAnimation = await page
      .locator('[data-testid="new-session-glow"] > div')
      .first()
      .evaluate((el) => getComputedStyle(el).animationName);
    expect(ringAnimation).toBe("none");
  });
});
