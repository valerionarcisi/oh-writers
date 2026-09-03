import { test, expect, TEST_PERSONAL_PROJECT_ID, BASE_URL } from "./fixtures";
import type { Page } from "@playwright/test";

/**
 * OHW-846 — Spec 84 §5 AI-off state.
 *
 * Drives `Features.AI_ENABLED` OFF/ON via the test-only `/api/test/set-ai-enabled`
 * override (mirrors the existing `/api/test/mock-context` pattern: MOCK_AI-gated,
 * 404s outside mock mode, never reachable in production). Real provider/trial
 * resolution ships in Spec 84 Wave 2 — this override is the only way to reach
 * the OFF branch until then.
 */
async function setAiEnabled(
  page: Page,
  enabled: boolean | null,
): Promise<void> {
  const response = await page.request.post(
    `${BASE_URL}/api/test/set-ai-enabled`,
    {
      data: { enabled },
      headers: { "Content-Type": "application/json" },
    },
  );
  if (!response.ok()) {
    throw new Error(
      `setAiEnabled failed: ${response.status()} ${response.statusText()}`,
    );
  }
}

test.describe("[OHW-846] AI-off state", () => {
  test.afterEach(async ({ authenticatedPage }) => {
    // Never leak the override into a later test file sharing the same server.
    await setAiEnabled(authenticatedPage, null);
  });

  test("OFF hides every AI surface: dock, rail sessions, margin notes, breakdown respoglio — and shows exactly one banner", async ({
    authenticatedPage: page,
  }) => {
    await setAiEnabled(page, false);

    // Soggetto: AiOffBanner shown, no CesareUpdatedBanner slot, no margin notes.
    await page.goto(`/projects/${TEST_PERSONAL_PROJECT_ID}/soggetto`);
    await expect(page.getByTestId("ai-off-banner")).toBeVisible();
    await expect(page.getByTestId("margin-notes-column")).toHaveCount(0);
    await expect(page.getByTestId("cesare-updated-banner")).toHaveCount(0);

    // Exactly one banner on the page.
    await expect(page.getByTestId("ai-off-banner")).toHaveCount(1);

    // Shell-level surfaces: no BottomDock, no LeftRail "Sessioni Cesare" entry.
    await expect(page.getByTestId("bottom-dock")).toHaveCount(0);
    await expect(page.getByTestId("rail-cesare-entry")).toHaveCount(0);
    await expect(page.locator('[data-rail-section="sessions"]')).toHaveCount(0);

    // Scaletta (Outline via the shared NarrativeEditor mount): same coverage.
    await page.goto(`/projects/${TEST_PERSONAL_PROJECT_ID}/outline`);
    await expect(page.getByTestId("ai-off-banner")).toBeVisible();
    await expect(page.getByTestId("ai-off-banner")).toHaveCount(1);
    await expect(page.getByTestId("margin-notes-column")).toHaveCount(0);

    // Breakdown: no "Ri-spogliare con AI" CTA, no stale/auto-spoglio banners.
    await page.goto(`/projects/${TEST_PERSONAL_PROJECT_ID}/breakdown`);
    await expect(page.getByTestId("breakdown-respoglio-cta")).toHaveCount(0);
    await expect(page.getByTestId("breakdown-stale-banner")).toHaveCount(0);
    await expect(page.getByTestId("auto-spoglio-banner")).toHaveCount(0);
    await expect(page.getByTestId("bottom-dock")).toHaveCount(0);

    // A direct deep link to a Cesare session redirects away (route guard).
    await page.goto(
      `/projects/${TEST_PERSONAL_PROJECT_ID}/sessions/00000000-0000-4000-a000-000000000099`,
    );
    await page.waitForURL(`**/projects/${TEST_PERSONAL_PROJECT_ID}`, {
      timeout: 15_000,
    });

    // Shooting plan dock: no "Cesare" button (2026-09-03 audit finding — was
    // the one AI surface still reachable with AI disabled).
    await page.goto(`/projects/${TEST_PERSONAL_PROJECT_ID}/shooting-plan`);
    await expect(page.getByTestId("shooting-plan-cesare-btn")).toHaveCount(0);

    // Settings: no AI section, and a direct visit to /settings/ai redirects
    // away (route guard, not just the link hidden).
    await page.goto("/settings");
    await expect(page.getByTestId("ai-section")).toHaveCount(0);
    await page.goto("/settings/ai");
    await page.waitForURL("**/dashboard", { timeout: 15_000 });
  });

  test("dismissing the AI-off banner persists across reload", async ({
    authenticatedPage: page,
  }) => {
    await setAiEnabled(page, false);
    await page.goto(`/projects/${TEST_PERSONAL_PROJECT_ID}/soggetto`);

    const banner = page.getByTestId("ai-off-banner");
    await expect(banner).toBeVisible();
    await page.getByTestId("ai-off-banner-dismiss").click();
    await expect(banner).toHaveCount(0);

    await page.reload();
    await expect(page.getByTestId("ai-off-banner")).toHaveCount(0);
  });

  test("ON restores every AI surface and shows no stale banner", async ({
    authenticatedPage: page,
  }) => {
    await setAiEnabled(page, true);

    await page.goto(`/projects/${TEST_PERSONAL_PROJECT_ID}/soggetto`);
    await expect(page.getByTestId("ai-off-banner")).toHaveCount(0);
    await expect(page.getByTestId("margin-notes-column")).toBeVisible();
    await expect(page.getByTestId("bottom-dock")).toBeVisible();

    await page.goto(`/projects/${TEST_PERSONAL_PROJECT_ID}/breakdown`);
    await expect(page.getByTestId("breakdown-respoglio-cta")).toBeVisible();

    await page.goto(`/projects/${TEST_PERSONAL_PROJECT_ID}/shooting-plan`);
    await expect(page.getByTestId("shooting-plan-cesare-btn")).toBeVisible();

    await page.goto("/settings");
    await expect(page.getByTestId("ai-section")).toBeVisible();
  });
});
