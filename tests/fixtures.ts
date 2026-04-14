import { test as base, expect, type Page } from "@playwright/test";

export const BASE_URL = process.env["BASE_URL"] ?? "http://localhost:3002";

const TEST_EMAIL = "test@ohwriters.dev";
const TEST_PASSWORD = "testpassword123";

type AuthFixtures = {
  authenticatedPage: Page;
  testProjectId: string;
};

export const test = base.extend<AuthFixtures>({
  authenticatedPage: async ({ browser }, use) => {
    // Sign in via API to avoid React hydration timing issues
    const resp = await fetch(`${BASE_URL}/api/auth/sign-in/email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: BASE_URL,
      },
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    });
    if (!resp.ok) throw new Error(`Sign-in failed: ${resp.status}`);

    // Extract session cookie from Set-Cookie header
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

    // Navigate to dashboard to confirm auth works
    await page.goto(`${BASE_URL}/dashboard`);
    await page.waitForURL("**/dashboard", { timeout: 15_000 });

    await use(page);
    await context.close();
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
