// tests/cesare-sessions-pages-ui.spec.ts
//
// [N-12 / N-13 / N-14] Cesare sessions pages — UI/shell regressions.
//
// - N-12: the sessions LIST renders INSIDE the AppShell (rail present) as
//   Notion-style cards with a "+ Nuova" CTA and a session count.
// - N-13: the new-session landing lives INSIDE the AppShell — the rail stays
//   present (NOT a bare full-screen / focus-mode takeover).
// - N-14: the conversation page routes all copy through the i18n keys (IT
//   values present) and docks the composer at the bottom of a chat layout.
import { test, expect } from "./fixtures";
import { BASE_URL } from "./fixtures";
import { TEAM_PROJECT_ID } from "./breakdown/helpers";

const railWidth = (page: import("@playwright/test").Page) =>
  page.evaluate(() => {
    const rail = document.querySelector("main")?.previousElementSibling;
    return rail ? rail.getBoundingClientRect().width : -1;
  });

test.describe("[N-12] Sessions list inside the shell, as cards", () => {
  test("list renders inside the AppShell (rail present) with cards, count, and a + Nuova CTA", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`${BASE_URL}/projects/${TEAM_PROJECT_ID}/sessions`);
    await page.waitForLoadState("networkidle");

    const landing = page.getByTestId("cesare-sessions-landing");
    await expect(landing).toBeVisible({ timeout: 10_000 });

    // Inside the shell: the rail is present (non-zero width), not a takeover.
    await expect
      .poll(() => page.evaluate(() => document.body.getAttribute("data-shell")))
      .not.toBe("focus");
    expect(await railWidth(page)).toBeGreaterThan(0);

    // The primary "+ Nuova" CTA + at least one session card.
    await expect(page.getByTestId("cesare-session-new")).toBeVisible();
    const firstCard = landing.locator("[data-session-id]").first();
    await expect(firstCard).toBeVisible({ timeout: 10_000 });

    // The card shows the relative-activity meta in Italian ("Ultima attività").
    await expect(firstCard).toContainText("Ultima attività");
  });
});

test.describe("[N-13] New-session landing inside the shell", () => {
  test("landing keeps the rail present (not a bare full-screen takeover)", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`${BASE_URL}/projects/${TEAM_PROJECT_ID}/sessions/new`);
    await page.waitForLoadState("networkidle");

    await expect(page.getByTestId("cesare-new-session-landing")).toBeVisible({
      timeout: 10_000,
    });
    await expect
      .poll(() => page.evaluate(() => document.body.getAttribute("data-shell")))
      .not.toBe("focus");
    expect(await railWidth(page)).toBeGreaterThan(0);

    // The glowy composer + Italian heading + quick prompts are present.
    await expect(page.getByTestId("new-session-heading")).toContainText(
      "Cosa scriviamo oggi?",
    );
    await expect(page.getByTestId("new-session-glow")).toBeVisible();
    await expect(
      page.getByTestId("new-session-suggestion").first(),
    ).toBeVisible();
  });
});

test.describe("[N-14] Conversation page — IT copy + docked composer", () => {
  test("conversation header + composer render in Italian with the composer docked at the bottom", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`${BASE_URL}/projects/${TEAM_PROJECT_ID}/sessions/new`);
    await page.waitForLoadState("networkidle");

    await page.getByTestId("new-session-input").fill("Aggiungi tre film");
    await page.getByTestId("new-session-send").click();

    await page.waitForURL(
      new RegExp(`/projects/${TEAM_PROJECT_ID}/sessions/[0-9a-f-]+$`),
      { timeout: 10_000 },
    );

    const conversation = page.getByTestId("session-conversation");
    await expect(conversation).toBeVisible({ timeout: 10_000 });

    // IT copy (routed through i18n keys — no EN leak): the header subtitle and
    // the composer placeholder are the Italian values.
    await expect(conversation).toContainText("Conversazione con Cesare");
    const composerInput = page.getByTestId("cesare-composer-input");
    await expect(composerInput).toHaveAttribute(
      "placeholder",
      "Chiedi a Cesare…",
    );

    // The composer is docked at the bottom: its top edge sits below the thread.
    const composer = page.getByTestId("session-composer");
    await expect(composer).toBeVisible();
    const layout = await page.evaluate(() => {
      const composerEl = document.querySelector(
        '[data-testid="session-composer"]',
      );
      const threadEl = document.querySelector(
        '[data-testid="session-conversation-thread"]',
      );
      if (!composerEl || !threadEl) return null;
      return {
        composerTop: composerEl.getBoundingClientRect().top,
        threadTop: threadEl.getBoundingClientRect().top,
        viewportHeight: window.innerHeight,
      };
    });
    expect(layout).not.toBeNull();
    // Composer sits below the thread start and in the lower half of the viewport.
    expect(layout!.composerTop).toBeGreaterThan(layout!.threadTop);
    expect(layout!.composerTop).toBeGreaterThan(layout!.viewportHeight / 2);
  });
});
