// tests/settings/ai-provider-wizard.spec.ts
//
// OHW-844 — Spec 84 §2/§3 (Wave 3) BYOK provider settings wizard.
//
// Coverage note: `validateProviderKey`/`getKeyInfo`/`getCredits`/`listModels`
// run server-side inside the `/settings/ai` server functions, issuing a real
// Node `fetch()` to openrouter.ai. Unlike the Google Places area-search stub
// (tests/cesare-agentic-locations-ux.spec.ts), `page.route()` does NOT
// intercept these — verified empirically: mocking
// `https://openrouter.ai/api/v1/key` via `page.route()` and submitting the
// manual-key form still hit the real network path and returned the
// "invalid key" branch, proving the browser-level route interception never
// saw the request. The wrapper functions (`getCredits`/`getKeyInfo`/
// `listModels`) and the composed `checkAiProviderCreditsForUser` are
// covered by mocked-`fetch` UNIT tests instead:
//   - apps/web/app/features/ai-providers/openrouter-api.server.test.ts
//   - apps/web/app/features/ai-providers/ai-providers.server.test.ts
//     (checkAiProviderCreditsForUser describe block)
// This E2E suite covers what IS observable end-to-end without a live
// OpenRouter account: route rendering, the disconnected wizard, and the
// manual-key form's CLIENT-SIDE validation (empty key), which never reaches
// the network.
import { test, expect, BASE_URL } from "../fixtures";
import type { Page } from "@playwright/test";

async function resetAiProviderState(page: Page): Promise<void> {
  const response = await page.request.post(
    `${BASE_URL}/api/test/reset-ai-provider-state`,
  );
  if (!response.ok()) {
    throw new Error(
      `resetAiProviderState failed: ${response.status()} ${response.statusText()}`,
    );
  }
}

test.describe("[OHW-844] BYOK provider settings wizard", () => {
  test.afterEach(async ({ authenticatedPage }) => {
    // Never leak a saved provider row into a later test sharing the DB.
    await resetAiProviderState(authenticatedPage);
  });

  test("disconnected state renders the connect wizard at /settings/ai", async ({
    authenticatedPage: page,
  }) => {
    await resetAiProviderState(page);
    await page.goto(`${BASE_URL}/settings/ai`);
    await page.waitForURL("**/settings/ai", { timeout: 15_000 });

    await expect(page.getByTestId("ai-connect-wizard")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByTestId("ai-connect-openrouter-btn")).toBeVisible();
    await expect(
      page.getByTestId("ai-connect-manual-key-toggle"),
    ).toBeVisible();
    // Nothing connected yet — no steady-state card, no post-connect wizard.
    await expect(page.getByTestId("ai-connected-card")).toHaveCount(0);
    await expect(page.getByTestId("ai-post-connect-wizard")).toHaveCount(0);
  });

  test("the primary CTA links to the OpenRouter PKCE start route", async ({
    authenticatedPage: page,
  }) => {
    await resetAiProviderState(page);
    await page.goto(`${BASE_URL}/settings/ai`);
    await expect(page.getByTestId("ai-connect-wizard")).toBeVisible({
      timeout: 10_000,
    });

    // Clicking navigates to the PKCE start route (a real browser navigation,
    // never a fetch — the browser must carry the PKCE cookie and follow the
    // 302 chain to openrouter.ai). We assert the navigation target rather
    // than following it through to the real openrouter.ai auth page.
    const [request] = await Promise.all([
      page.waitForRequest("**/api/ai-providers/openrouter/start"),
      page.getByTestId("ai-connect-openrouter-btn").click(),
    ]);
    expect(request.url()).toContain("/api/ai-providers/openrouter/start");
  });

  test("manual-key form: opens from the secondary CTA and validates an empty key client-side (no network)", async ({
    authenticatedPage: page,
  }) => {
    await resetAiProviderState(page);
    await page.goto(`${BASE_URL}/settings/ai`);
    await expect(page.getByTestId("ai-connect-wizard")).toBeVisible({
      timeout: 10_000,
    });

    await page.getByTestId("ai-connect-manual-key-toggle").click();
    await expect(page.getByTestId("ai-manual-key-form")).toBeVisible();

    // Empty key: the form validates client-side and never calls the server —
    // no OpenRouter mock needed for this assertion.
    await page.getByTestId("ai-manual-key-submit-btn").click();
    await expect(page.getByText("Inserisci una chiave API")).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByTestId("ai-connected-card")).toHaveCount(0);
    await expect(page.getByTestId("ai-post-connect-wizard")).toHaveCount(0);

    // Cancel closes the form back to the plain wizard.
    await page.getByTestId("ai-manual-key-cancel-btn").click();
    await expect(page.getByTestId("ai-manual-key-form")).toHaveCount(0);
  });

  test("a direct visit with ?error=provider_denied shows the friendly error strip", async ({
    authenticatedPage: page,
  }) => {
    await resetAiProviderState(page);
    await page.goto(`${BASE_URL}/settings/ai?error=provider_denied`);
    await expect(page.getByTestId("ai-connect-error-banner")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByTestId("ai-connect-error-banner")).toContainText(
      "annullata",
    );
  });
});
