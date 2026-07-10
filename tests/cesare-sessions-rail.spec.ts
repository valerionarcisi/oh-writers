// tests/cesare-sessions-rail.spec.ts
//
// LeftRail Cesare-sessions cap + pinning.
//
// (a) The rail caps the "Sessioni Cesare" list at 5 visible rows; beyond that
//     it shows a "Vedi tutte (N)" link to the full `/projects/:id/sessions`
//     page.
// (b) Users can pin up to 3 sessions — pinned sessions always sort to the top
//     of the rail list, persist across reload, and the 4th pin attempt shows
//     inline feedback ("Puoi fissare fino a 3 sessioni") instead of applying.
//
// Session rows are otherwise only created via a real first-message send, so
// this suite seeds sessions directly against the test DB (`seedCesareSessions`)
// rather than driving N chat turns through the UI.
import { test, expect } from "./fixtures";
import { TEST_PERSONAL_PROJECT_ID, BASE_URL } from "./fixtures";
import { reseedTestDb } from "./breakdown/helpers";
import { seedCesareSessions } from "./helpers/cesare";

// Matches packages/db/src/seed/index.ts TEST_USER_ID — the owner of
// TEST_PERSONAL_PROJECT_ID (the "test@ohwriters.dev" account the
// `authenticatedPage` fixture signs in as).
const TEST_USER_ID = "00000000-0000-4000-a000-000000000001";

test.describe("[cesare-sessions-rail] LeftRail cap + pinning", () => {
  test.afterEach(() => {
    // Full reseed restores the pristine (zero-session) personal project for
    // whichever spec file runs next — `workers: 1` means the suite is
    // sequential, but the seeded rows would otherwise leak across spec files.
    reseedTestDb();
  });

  test("shows at most 5 sessions with a 'Vedi tutte (N)' link when there are more", async ({
    authenticatedPage: page,
  }) => {
    seedCesareSessions(TEST_PERSONAL_PROJECT_ID, TEST_USER_ID, 7, 0);

    await page.goto(
      `${BASE_URL}/projects/${TEST_PERSONAL_PROJECT_ID}/soggetto`,
    );
    const rail = page.getByTestId("left-rail");
    await expect(rail).toBeVisible({ timeout: 15_000 });

    const sessionRows = rail.locator("[data-session-id]");
    await expect(sessionRows).toHaveCount(5, { timeout: 10_000 });

    const seeAll = rail.getByTestId("rail-sessions-see-all");
    await expect(seeAll).toBeVisible();
    await expect(seeAll).toHaveText("Vedi tutte (7)");
  });

  test("'Vedi tutte' navigates to the full sessions page", async ({
    authenticatedPage: page,
  }) => {
    seedCesareSessions(TEST_PERSONAL_PROJECT_ID, TEST_USER_ID, 6, 0);

    await page.goto(
      `${BASE_URL}/projects/${TEST_PERSONAL_PROJECT_ID}/soggetto`,
    );
    const rail = page.getByTestId("left-rail");
    await expect(rail).toBeVisible({ timeout: 15_000 });

    await rail.getByTestId("rail-sessions-see-all").click();
    await page.waitForURL(/\/sessions$/, { timeout: 10_000 });
    await expect(page.getByTestId("cesare-sessions-landing")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("does not cap the rail or show 'Vedi tutte' with 5 or fewer sessions", async ({
    authenticatedPage: page,
  }) => {
    seedCesareSessions(TEST_PERSONAL_PROJECT_ID, TEST_USER_ID, 5, 0);

    await page.goto(
      `${BASE_URL}/projects/${TEST_PERSONAL_PROJECT_ID}/soggetto`,
    );
    const rail = page.getByTestId("left-rail");
    await expect(rail).toBeVisible({ timeout: 15_000 });

    await expect(rail.locator("[data-session-id]")).toHaveCount(5, {
      timeout: 10_000,
    });
    await expect(rail.getByTestId("rail-sessions-see-all")).toHaveCount(0);
  });

  test("pinning a session moves it to the top and persists across reload", async ({
    authenticatedPage: page,
  }) => {
    seedCesareSessions(TEST_PERSONAL_PROJECT_ID, TEST_USER_ID, 3, 0);

    await page.goto(
      `${BASE_URL}/projects/${TEST_PERSONAL_PROJECT_ID}/soggetto`,
    );
    const rail = page.getByTestId("left-rail");
    await expect(rail).toBeVisible({ timeout: 15_000 });

    // Sessions are seeded oldest-title-first but ordered by recency (most
    // recent first) by the server, so "Sessione seed 1" (oldest) is last.
    const rows = rail.locator("[data-session-id]");
    await expect(rows).toHaveCount(3, { timeout: 10_000 });
    const lastRowId = await rows.last().getAttribute("data-session-id");
    expect(lastRowId).toBeTruthy();

    const lastRow = rail.locator(`[data-session-id="${lastRowId}"]`);
    await lastRow.hover();
    await lastRow.getByTestId("session-actions-btn").click();
    await page.getByTestId("session-pin-item").click();

    // The pinned row moves to the top of the rail.
    await expect
      .poll(async () => rows.first().getAttribute("data-session-id"), {
        timeout: 10_000,
      })
      .toBe(lastRowId);
    await expect(
      rail.locator(`[data-session-id="${lastRowId}"]`),
    ).toHaveAttribute("data-session-pinned", "true");

    // Persists across a full reload.
    await page.reload();
    await expect(rail).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(async () => rows.first().getAttribute("data-session-id"), {
        timeout: 10_000,
      })
      .toBe(lastRowId);
    await expect(
      rail.locator(`[data-session-id="${lastRowId}"]`),
    ).toHaveAttribute("data-session-pinned", "true");
  });

  test("the 4th pin attempt shows the limit feedback instead of pinning", async ({
    authenticatedPage: page,
  }) => {
    // 3 already pinned + 1 unpinned session to attempt pinning.
    seedCesareSessions(TEST_PERSONAL_PROJECT_ID, TEST_USER_ID, 4, 3);

    await page.goto(
      `${BASE_URL}/projects/${TEST_PERSONAL_PROJECT_ID}/soggetto`,
    );
    const rail = page.getByTestId("left-rail");
    await expect(rail).toBeVisible({ timeout: 15_000 });

    const rows = rail.locator("[data-session-id]");
    await expect(rows).toHaveCount(4, { timeout: 10_000 });

    // The unpinned row is the last one (pinned sessions sort first).
    const unpinnedRow = rows.last();
    await expect(unpinnedRow).not.toHaveAttribute(
      "data-session-pinned",
      "true",
    );
    await unpinnedRow.hover();
    await unpinnedRow.getByTestId("session-actions-btn").click();
    await page.getByTestId("session-pin-item").click();

    await expect(page.getByText("Puoi fissare fino a 3 sessioni")).toBeVisible({
      timeout: 5_000,
    });
    // The row is still unpinned — the mutation was rejected server-side.
    await expect(unpinnedRow).not.toHaveAttribute(
      "data-session-pinned",
      "true",
    );
  });
});
