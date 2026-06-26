// tests/cesare-sessions-route.spec.ts
//
// [047-A5] LeftRail Cesare entry + central Sessions route.
//
// The rail's dedicated "Cesare" entry opens the sessions landing
// (`/projects/:id/sessions`); clicking a session opens its full conversation at
// the deep-linkable central route (`/projects/:id/sessions/:sessionId`) which
// REPLACES the main content (it is not a `?peek=` side-peek). A session id the
// user doesn't own — or one that doesn't exist — must fail closed: the route
// renders a not-found body and leaks no session title or content.
import { test, expect } from "./fixtures";
import { BASE_URL } from "./fixtures";
import { TEAM_PROJECT_ID } from "./breakdown/helpers";

// Syntactically valid UUID that is not seeded → the ownership guard returns
// not-found. Stands in for "foreign / non-existent session".
const FOREIGN_SESSION_ID = "99999999-9999-4999-a999-999999999999";

test.describe("[047-A5] Cesare sidebar entry + sessions route", () => {
  test("rail Cesare entry → sessions landing → open a session → central conversation", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`${BASE_URL}/projects/${TEAM_PROJECT_ID}/soggetto`);
    await page.waitForLoadState("networkidle");

    // The dedicated "Cesare" entry lives in the rail's sessions section title.
    const railCesare = page.getByTestId("rail-cesare-entry");
    await expect(railCesare).toBeVisible({ timeout: 15_000 });
    await railCesare.click();

    // Lands on the full sessions landing.
    await page.waitForURL(`**/projects/${TEAM_PROJECT_ID}/sessions`, {
      timeout: 10_000,
    });
    const landing = page.getByTestId("cesare-sessions-landing");
    await expect(landing).toBeVisible({ timeout: 10_000 });

    // The landing lists at least the lazily-provisioned default session. Open
    // the first row → central conversation route.
    const firstRow = landing.locator("[data-session-id]").first();
    await expect(firstRow).toBeVisible({ timeout: 10_000 });
    await firstRow.click();

    await page.waitForURL(
      new RegExp(`/projects/${TEAM_PROJECT_ID}/sessions/[0-9a-f-]+$`),
      { timeout: 10_000 },
    );
    await expect(page.getByTestId("session-conversation")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByTestId("session-title")).toBeVisible();
  });

  test("deep-link straight to a session renders its conversation", async ({
    authenticatedPage: page,
  }) => {
    // Discover a real session id via the landing, then deep-link to it in a
    // fresh navigation (simulating a pasted URL).
    await page.goto(`${BASE_URL}/projects/${TEAM_PROJECT_ID}/sessions`);
    await page.waitForLoadState("networkidle");
    const firstRow = page
      .getByTestId("cesare-sessions-landing")
      .locator("[data-session-id]")
      .first();
    await expect(firstRow).toBeVisible({ timeout: 10_000 });
    const sessionId = await firstRow.getAttribute("data-session-id");
    expect(sessionId).toBeTruthy();

    await page.goto(
      `${BASE_URL}/projects/${TEAM_PROJECT_ID}/sessions/${sessionId}`,
    );
    await page.waitForLoadState("networkidle");
    const conversation = page.getByTestId("session-conversation");
    await expect(conversation).toBeVisible({ timeout: 10_000 });
    await expect(conversation).toHaveAttribute("data-session-id", sessionId!);
  });

  test("SAD: a foreign / non-existent session id → not-found, no leaked content", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(
      `${BASE_URL}/projects/${TEAM_PROJECT_ID}/sessions/${FOREIGN_SESSION_ID}`,
    );
    await page.waitForLoadState("networkidle");

    // Not-found body renders…
    await expect(page.getByTestId("cesare-session-not-found")).toBeVisible({
      timeout: 10_000,
    });
    // …and the real conversation surface never mounts (no title/content leak).
    await expect(page.getByTestId("session-conversation")).toHaveCount(0);
    await expect(page.getByTestId("session-title")).toHaveCount(0);
  });

  test("SAD: a malformed (non-uuid) session id → not-found, no server leak", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(
      `${BASE_URL}/projects/${TEAM_PROJECT_ID}/sessions/not-a-real-id`,
    );
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("cesare-session-not-found")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByTestId("session-conversation")).toHaveCount(0);
  });
});
