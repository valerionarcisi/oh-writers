// tests/route-error-boundary.spec.ts
//
// [060] Spec 60 — app-wide route error boundary.
//
// A render throw on any routed surface must land on our branded fallback
// (RouteErrorBoundary → RouteErrorFallback), NOT the framework's bare unstyled
// "Something went wrong!" page. The shell document chrome survives; the user can
// retry and reveal the stack. The crash is forced via the dev/test-only route
// `/crash-test` (it throws in any non-production build; gated off in prod).

import { test, expect } from "./fixtures";
import { BASE_URL } from "./fixtures";

test.describe("[Spec 60] route error boundary", () => {
  test("a route render throw renders the branded fallback, not the bare page", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`${BASE_URL}/crash-test`);

    // Our branded fallback is shown…
    await expect(page.getByTestId("route-error-fallback")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByTestId("route-error-title")).toBeVisible();

    // …and the framework's bare default page is absent.
    await expect(page.getByText("Something went wrong!")).toHaveCount(0);

    // The shell chrome SURVIVES — only the matched route subtree is replaced.
    // This is the headline invariant of Spec 60: a leaf throw must not blank the
    // whole document (rail + main region stay mounted around the fallback).
    await expect(page.getByTestId("left-rail")).toBeVisible();
    await expect(page.locator("#main-content")).toBeVisible();
  });

  test("the stack is hidden until 'Mostra dettagli', then revealed", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`${BASE_URL}/crash-test`);
    await expect(page.getByTestId("route-error-fallback")).toBeVisible();

    await expect(page.getByTestId("route-error-stack")).toHaveCount(0);
    await page.getByTestId("route-error-details-toggle").click();
    await expect(page.getByTestId("route-error-stack")).toBeVisible();
    // The forced throw mirrors the original walk crash shape.
    await expect(page.getByTestId("route-error-stack")).toContainText(
      "IP_DIFF",
    );
  });

  test("the boundary is transient — a healthy route after a crash renders normally", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`${BASE_URL}/crash-test`);
    await expect(page.getByTestId("route-error-fallback")).toBeVisible();

    // Navigating away to a healthy route clears the boundary — it is not a stuck
    // app-wide state.
    await page.goto(`${BASE_URL}/dashboard`);
    await expect(page.getByTestId("route-error-fallback")).toHaveCount(0);
  });
});
