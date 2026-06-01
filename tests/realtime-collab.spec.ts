import { test, expect, BASE_URL } from "./fixtures";
import type { Browser, Page } from "@playwright/test";

// Spec 09b — Yjs real-time collaboration.
// The seeded team screenplay both editors share.
const TEAM_PROJECT_ID = "00000000-0000-4000-a000-000000000011";
const SCREENPLAY_URL = `${BASE_URL}/projects/${TEAM_PROJECT_ID}/screenplay`;

// collab@ is seeded as an EDITOR on the team, giving us a second writer for the
// two-user sync test. viewer@ is a VIEWER (read-only).
const COLLAB_EMAIL = "collab@ohwriters.dev";
const COLLAB_PASSWORD = "collab123";

// Realtime only runs when the client was built with VITE_WS_URL pointing at a
// live ws-server. When it isn't, the suite asserts the graceful fallback
// instead of the collaborative path.
const REALTIME_ENABLED = !!process.env["VITE_WS_URL"];

const signInPage = async (
  browser: Browser,
  email: string,
  password: string,
): Promise<Page> => {
  const resp = await fetch(`${BASE_URL}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE_URL },
    body: JSON.stringify({ email, password }),
  });
  if (!resp.ok) throw new Error(`Sign-in failed for ${email}: ${resp.status}`);

  const cookies = resp.headers
    .getSetCookie()
    .map((header) => {
      const [nameValue] = header.split(";");
      if (!nameValue) return null;
      const eq = nameValue.indexOf("=");
      if (eq === -1) return null;
      return {
        name: nameValue.slice(0, eq),
        value: nameValue.slice(eq + 1),
        domain: "localhost",
        path: "/",
      };
    })
    .filter(Boolean) as {
    name: string;
    value: string;
    domain: string;
    path: string;
  }[];

  const context = await browser.newContext();
  if (cookies.length > 0) await context.addCookies(cookies);
  const page = await context.newPage();
  return page;
};

const fountainOf = (page: Page): Promise<string> =>
  page.evaluate(
    () =>
      (window as unknown as { __ohWritersFountain?: () => string })
        .__ohWritersFountain?.() ?? "",
  );

test.describe("[OHW-09b] realtime collaboration — fallback", () => {
  // Always-on guarantee: with or without a ws-server the editor must load and
  // accept input (HTTP autosave is the durable path).
  test("editor loads and is usable", async ({ authenticatedPage: page }) => {
    await page.goto(SCREENPLAY_URL);
    await expect(page.locator("[data-pm-screenplay]")).toBeVisible({
      timeout: 15_000,
    });

    if (!REALTIME_ENABLED) {
      // No realtime → no presence pill, editor still mounts.
      await expect(page.locator("[aria-label*='online']")).toHaveCount(0);
    }
  });
});

test.describe("[OHW-09b] realtime collaboration — live sync", () => {
  test.skip(!REALTIME_ENABLED, "requires VITE_WS_URL + a running ws-server");

  test("two editors see each other's edits and the presence count", async ({
    browser,
  }) => {
    const alice = await signInPage(browser, "test@ohwriters.dev", "testpassword123");
    const bob = await signInPage(browser, COLLAB_EMAIL, COLLAB_PASSWORD);

    await alice.goto(SCREENPLAY_URL);
    await expect(alice.locator("[data-pm-screenplay]")).toBeVisible({
      timeout: 20_000,
    });
    await bob.goto(SCREENPLAY_URL);
    await expect(bob.locator("[data-pm-screenplay]")).toBeVisible({
      timeout: 20_000,
    });

    // Once the second peer's awareness propagates the count is >= 2. We assert
    // >= 2 (not exactly 2) and read the dedicated count span — a shared dev
    // ws-server can carry ghost awareness from prior runs, and the root element
    // also contains avatar initials, so an exact substring match is brittle.
    await expect
      .poll(
        async () => {
          const text =
            (await alice
              .locator("[data-testid='presence-count']")
              .textContent()) ?? "";
          return Number(text.match(/(\d+)/)?.[1] ?? "0");
        },
        { timeout: 15_000 },
      )
      .toBeGreaterThanOrEqual(2);

    // Bob types a unique marker; Alice mirrors it (proves CRDT round-trip
    // through the nested scene schema). Unique per run so it doesn't collide
    // with content left by a previous run on the shared dev doc.
    const marker = `INT. SYNC-${Date.now()} - GIORNO`;
    await bob.locator("[data-pm-screenplay]").click();
    await bob.keyboard.type(marker);
    await expect
      .poll(() => fountainOf(alice), { timeout: 15_000 })
      .toContain(marker);

    await alice.context().close();
    await bob.context().close();
  });

  test("a viewer sees live content but cannot edit", async ({
    browser,
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(SCREENPLAY_URL);
    await expect(
      authenticatedPage.locator("[data-pm-screenplay]"),
    ).toBeVisible();
    const marker = `EST. VIEW-${Date.now()} - NOTTE`;
    await authenticatedPage.locator("[data-pm-screenplay]").click();
    await authenticatedPage.keyboard.type(marker);
    // Let the owner's edit reach the server before the viewer connects.
    await expect
      .poll(() => fountainOf(authenticatedPage), { timeout: 10_000 })
      .toContain(marker);

    const viewer = await signInPage(
      browser,
      "viewer@ohwriters.dev",
      "viewerpassword123",
    );
    await viewer.goto(SCREENPLAY_URL);
    await expect(viewer.locator("[data-pm-screenplay]")).toBeVisible({
      timeout: 20_000,
    });

    // Viewer receives the live content…
    await expect
      .poll(() => fountainOf(viewer), { timeout: 15_000 })
      .toContain(marker);

    // …but the editor surface is not editable.
    const editable = await viewer
      .locator("[data-pm-screenplay] [contenteditable]")
      .first()
      .getAttribute("contenteditable");
    expect(editable).toBe("false");

    await viewer.context().close();
  });
});
