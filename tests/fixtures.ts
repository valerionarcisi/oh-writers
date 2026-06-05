import {
  test as base,
  expect,
  type Page,
  type Browser,
} from "@playwright/test";

// Mirror the port resolution in `playwright.config.ts` so the browser always
// navigates to the same server Playwright started. The config derives the
// server port from `WEB_PORT` (default 3002); the fixture MUST use the same
// source, otherwise an overridden `WEB_PORT` boots the server on one port
// while the browser drives a different one (e.g. a stale local dev server) —
// the cause of the Spec 55 suite silently running against pre-Spec-55 code.
const WEB_PORT = process.env["WEB_PORT"] ?? "3002";
export const BASE_URL =
  process.env["BASE_URL"] ?? `http://localhost:${WEB_PORT}`;

const TEST_EMAIL = "test@ohwriters.dev";
const TEST_PASSWORD = "testpassword123";

const TEST_VIEWER_EMAIL = "viewer@ohwriters.dev";
const TEST_VIEWER_PASSWORD = "viewerpassword123";

// Matches the seeded team project ID (see packages/db/src/seed/index.ts).
// Both the owner and the viewer have access to this project; the viewer
// can read but not write.
export const TEST_TEAM_PROJECT_ID = "00000000-0000-4000-a000-000000000011";

// The seeded personal "Non fa ridere" project (`TEST_PROJECT_ID` in the seed) —
// the one carrying the NON FA RIDERE screenplay + document versions. The test
// user owns it. Used by the `testProjectId` fixture.
export const TEST_PERSONAL_PROJECT_ID = "00000000-0000-4000-a000-000000000010";

type AuthFixtures = {
  authenticatedPage: Page;
  authenticatedViewerPage: Page;
  testProjectId: string;
};

const signInAndOpenPage = async (
  browser: Browser,
  email: string,
  password: string,
): Promise<Page> => {
  // Sign in via API to avoid React hydration timing issues
  const resp = await fetch(`${BASE_URL}/api/auth/sign-in/email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: BASE_URL,
    },
    body: JSON.stringify({ email, password }),
  });
  if (!resp.ok) throw new Error(`Sign-in failed for ${email}: ${resp.status}`);

  const setCookieHeaders = resp.headers.getSetCookie();
  const cookies = setCookieHeaders
    .map((header) => {
      const [nameValue] = header.split(";");
      if (!nameValue) return null;
      const eqIdx = nameValue.indexOf("=");
      if (eqIdx === -1) return null;
      return {
        name: nameValue.substring(0, eqIdx),
        value: nameValue.substring(eqIdx + 1),
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
  if (cookies.length > 0) {
    await context.addCookies(cookies);
  }
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/dashboard`);
  await page.waitForURL("**/dashboard", { timeout: 15_000 });
  return page;
};

export const test = base.extend<AuthFixtures>({
  authenticatedPage: async ({ browser }, use) => {
    const page = await signInAndOpenPage(browser, TEST_EMAIL, TEST_PASSWORD);
    await use(page);
    await page.context().close();
  },

  authenticatedViewerPage: async ({ browser }, use) => {
    const page = await signInAndOpenPage(
      browser,
      TEST_VIEWER_EMAIL,
      TEST_VIEWER_PASSWORD,
    );
    await use(page);
    await page.context().close();
  },

  testProjectId: async ({ authenticatedPage: _page }, use) => {
    // The seeded personal "Non fa ridere" project carrying the NON FA RIDERE
    // screenplay. The seed creates SEVERAL projects titled "Non fa ridere"
    // (personal + team), so scraping the dashboard by title is ambiguous
    // (`.first()` is non-deterministic and flaked). Return the stable seeded id
    // directly — the test user owns it and every editor spec expects its
    // screenplay content.
    await use(TEST_PERSONAL_PROJECT_ID);
  },
});

export { expect };
