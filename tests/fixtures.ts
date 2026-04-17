import {
  test as base,
  expect,
  type Page,
  type Browser,
} from "@playwright/test";

export const BASE_URL = process.env["BASE_URL"] ?? "http://localhost:3002";

const TEST_EMAIL = "test@ohwriters.dev";
const TEST_PASSWORD = "testpassword123";

const TEST_VIEWER_EMAIL = "viewer@ohwriters.dev";
const TEST_VIEWER_PASSWORD = "viewerpassword123";

// Matches the seeded team project ID (see packages/db/src/seed/index.ts).
// Both the owner and the viewer have access to this project; the viewer
// can read but not write.
export const TEST_TEAM_PROJECT_ID = "00000000-0000-4000-a000-000000000011";

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

  testProjectId: async ({ authenticatedPage: page }, use) => {
    // We should already be on /dashboard after authenticatedPage
    if (!page.url().includes("/dashboard")) {
      await page.goto(`${BASE_URL}/dashboard`);
    }
    await page.waitForLoadState("networkidle");

    // Find the "Non fa ridere" project link
    const projectLink = page.locator('a[href*="/projects/"]').filter({
      hasText: "Non fa ridere",
    });
    await expect(projectLink).toBeVisible({ timeout: 10_000 });

    const href = await projectLink.getAttribute("href");
    if (!href) throw new Error("Project link has no href");
    const id = href.split("/projects/")[1]?.split("/")[0];
    if (!id) throw new Error(`Could not extract project ID from href: ${href}`);

    await use(id);
  },
});

export { expect };
