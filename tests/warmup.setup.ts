import { test as setup } from "@playwright/test";
import { BASE_URL } from "./fixtures";

const TEST_EMAIL = "test@ohwriters.dev";
const TEST_PASSWORD = "testpassword123";

// Seeded project ids the agentic suite navigates to.
const PROJECT_IDS = [
  "00000000-0000-4000-a000-000000000010", // personal project
  "00000000-0000-4000-a000-000000000011", // TEAM project
];

// The heaviest authenticated routes — each JIT-compiles its server route AND
// its client component bundle on the FIRST browser navigation.
const ROUTE_SUFFIXES = [
  "breakdown",
  "budget",
  "schedule",
  "shooting-plan",
  "synopsis",
  "soggetto",
  "outline",
  "treatment",
  "locations",
  "screenplay",
];

/**
 * Pre-compile the heavy authenticated routes once, after the web server is up
 * but before the agentic suite runs. The dev server JIT-compiles each route's
 * server module AND its client component bundle on first browser navigation; on
 * a 2-core CI runner that cold compile can take 15-40s and was timing out the
 * first test to hit a given route on its page-load precondition (a different
 * test each run → "flaky"). We navigate a real logged-in browser to each route
 * so both server + client transforms happen here, leaving the routes warm for
 * the real tests. Runs only as the mock-ui project's dependency.
 */
setup("warm heavy routes", async ({ browser }) => {
  setup.setTimeout(300_000);

  // Sign in via the API (same handoff the fixtures use) and seed the cookie.
  const resp = await fetch(`${BASE_URL}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE_URL },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
  });
  if (!resp.ok) throw new Error(`warmup sign-in failed: ${resp.status}`);

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

  // Sequential: parallel cold compiles only contend for the same 2 cores.
  for (const id of PROJECT_IDS) {
    for (const suffix of ROUTE_SUFFIXES) {
      await page
        .goto(`${BASE_URL}/projects/${id}/${suffix}`, {
          waitUntil: "domcontentloaded",
          timeout: 60_000,
        })
        .catch(() => undefined);
    }
  }

  await context.close();
});
