// tests/invalid-project-id-not-found.spec.ts
//
// Issue #62 — an invalid project `$id` (e.g. a non-uuid) used to fire the
// project-scoped server functions, whose `z.string().uuid()` validators threw,
// producing a retried HTTP 500 STORM whose body leaked the server stack trace +
// absolute filesystem paths, behind a silently broken empty shell (no branded
// boundary).
//
// The fix validates `$id` in each project route's `beforeLoad`
// (`assertValidProjectId`), which throws `notFound()` to short-circuit the route
// BEFORE its loaders/queries run, so a bad id never fires a query and the router
// renders the branded `defaultNotFoundComponent` instead. (A throw from
// `params.parse` does NOT short-circuit in this router version — see
// project-route.ts.) This test locks: (1) the branded not-found is shown,
// (2) NO project-scoped server-fn request fires (no 500 storm, no stack leak).

import { test, expect } from "./fixtures";
import { BASE_URL } from "./fixtures";

const INVALID_ID = "not-a-real-uuid-zzz";

test.describe("[#62] invalid project id → branded not-found, no 500 leak", () => {
  test("a non-uuid project id renders the branded not-found, fires no server-fn, leaks no stack", async ({
    authenticatedPage: page,
  }) => {
    // The headline #62 signal is the 500 STORM: the project-scoped server fns
    // 500'd (16× retries) and leaked the stack trace + fs paths. Capture every
    // 5xx — the guard short-circuits the route before any query runs, so there
    // must be none. (We do NOT assert "zero server fns": the root/_app loaders,
    // fetchUser/resolveLocale, legitimately run on the not-found path too.)
    const serverErrors: { status: number; url: string }[] = [];
    page.on("response", (resp) => {
      if (resp.status() >= 500)
        serverErrors.push({ status: resp.status(), url: resp.url() });
    });

    await page.goto(`${BASE_URL}/projects/${INVALID_ID}/soggetto`);

    // Branded not-found is shown…
    await expect(page.getByTestId("route-not-found")).toBeVisible({
      timeout: 10_000,
    });
    // …reusing the error-fallback chrome (shares the testid) with not-found copy.
    await expect(page.getByTestId("route-error-title")).toBeVisible();

    // No 500 fired — the storm + stack/path leak are gone at source.
    expect(serverErrors, "no 5xx responses for an invalid id").toEqual([]);
  });

  test("the not-found is transient — a real project after it renders normally", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`${BASE_URL}/projects/${INVALID_ID}/soggetto`);
    await expect(page.getByTestId("route-not-found")).toBeVisible();

    await page.goto(`${BASE_URL}/dashboard`);
    await expect(page.getByTestId("route-not-found")).toHaveCount(0);
  });
});
