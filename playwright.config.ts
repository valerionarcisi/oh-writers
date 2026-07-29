import { defineConfig, devices } from "@playwright/test";

const TEST_PORT = process.env["WEB_PORT"] ?? "3002";
const TEST_BASE_URL =
  process.env["BASE_URL"] ?? `http://localhost:${TEST_PORT}`;
const TEST_DB_URL =
  process.env["DATABASE_URL_TEST"] ??
  "postgresql://oh-writers:oh-writers@localhost:5432/oh-writers_test";

// Dedicated port/URL for the production-build webServer (isDevEnvironment
// gating can only be exercised against a real `vinxi build` — `import.meta.
// env.DEV` is always true under `vinxi dev`, which every other project uses).
const PROD_PORT = process.env["WEB_PROD_PORT"] ?? "3003";
const PROD_BASE_URL =
  process.env["PROD_BASE_URL"] ?? `http://localhost:${PROD_PORT}`;

export default defineConfig({
  globalSetup: "./tests/global-setup.ts",
  testDir: "./tests",
  // Tests share a single DB — run serially to avoid data races on the screenplay row
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 2 : 0,
  // Default 30s is tight on CI for tool-loop tests: a single Cesare turn
  // can hit a cold vinxi route + execute a DB query, easily 20-40s before
  // the response paragraph appears. Local runs stay under 10s.
  timeout: process.env["CI"] ? 90_000 : 30_000,
  // `html` for the artifact upload, `list` so failures appear in CI stdout
  // (overriding from CLI would drop the html report and break the upload).
  reporter: process.env["CI"]
    ? [["list"], ["html", { open: "never" }]]
    : [["html", { open: "never" }]],
  use: {
    baseURL: TEST_BASE_URL,
    trace: "on-first-retry",
    // CI runs at 1280x720 by default (devices.Desktop Chrome); the Cesare
    // bottom sheet animates 42% of the viewport height which on 720px
    // lands the textarea below the fold — clicks fail with "outside of
    // the viewport". Bump to a height where the sheet fits in view.
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    {
      name: "chromium",
      testIgnore: [
        // Agentic specs require MOCK_AI=true and live in the mock-ui project;
        // keep them out of the default run so they aren't executed twice.
        /cesare-agentic-.*\.spec\.ts$/,
        // Out of the production scope (MVP #97: everything up to Calendario
        // ships; Budget, Location, Piano di ripresa and Fundraising stay
        // DEV_ONLY and unshipped). Their suites are parked, not deleted —
        // remove the entry to reactivate one when its feature comes back into
        // scope. The GATING of these pages stays covered: prod-build's
        // shell-production-gating and mvp-surface-smoke still run.
        /(budget|locations|shooting-plan)\/.*\.spec\.ts$/,
        /fundraising-.*\.spec\.ts$/,
        // Belongs to the prod-build project only: it asserts
        // isDevEnvironment=false gating, which against the dev server this
        // project uses fails BY CONSTRUCTION (DEV_ONLY pages must be visible
        // in dev). Without this ignore, `--project=chromium` runs it wrongly.
        /shell-production-gating\.spec\.ts$/,
      ],
      // `viewport` override comes AFTER the spread — devices.Desktop Chrome
      // sets it to 1280x720 by default which is too small for the Cesare
      // bottom sheet to fit on screen.
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      // Pre-compiles the heavy authenticated routes so the agentic suite's
      // first navigation to each doesn't pay the cold JIT compile (the cause of
      // the rotating page-load-precondition timeouts on CI). See warmup.setup.ts.
      name: "warmup",
      testMatch: /warmup\.setup\.ts$/,
    },
    {
      name: "mock-ui",
      testMatch: /cesare-agentic-.*\.spec\.ts$/,
      // Same MVP #97 parking as the chromium project: the Cesare flows for
      // Budget and Location drive DEV_ONLY pages that do not ship.
      testIgnore:
        /cesare-agentic-(budget|budget-intelligence|locations|locations-ux)\.spec\.ts$/,
      dependencies: ["warmup"],
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      // Real `vinxi build` + `vinxi start` — the only way to exercise
      // isDevEnvironment=false (DEV_ONLY nav/route gating for Budget,
      // Location, Piano di ripresa). Separate webServer entry below builds
      // and starts a production server on PROD_BASE_URL for this project only.
      name: "prod-build",
      testMatch: /shell-production-gating\.spec\.ts$/,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: PROD_BASE_URL,
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
  webServer: [
    {
      // VITE_WS_URL is force-emptied: without it the test server inherits the
      // dev ws-server from apps/web/.env, whose auth/persistence DB does not
      // match the test DB — the editor then remount-loops between skeleton and
      // editor and eats keystrokes (BUG-N57). The E2E stack is non-realtime by
      // contract (N-42) until it runs its own ws-server.
      //
      // DEV_AUTH_BYPASS is force-disabled for the same class of reason: it is a
      // local convenience for hand-testing, but inherited from apps/web/.env it
      // makes the server answer EVERY request as the dev user. The role fixtures
      // then sign in for nothing — `authenticatedViewerPage` holds owner rights —
      // and permission assertions silently test the wrong thing in BOTH
      // directions: viewer guards fail, and owner-only flows pass that should
      // not. The suite must not depend on how a developer left their .env.
      command: `PORT=${TEST_PORT} BETTER_AUTH_URL=${TEST_BASE_URL} DATABASE_URL=${TEST_DB_URL} VITE_WS_URL= DEV_AUTH_BYPASS=false LLM_FIRST_BREAKDOWN=false MOCK_AI=true CRON_SECRET=test-cron-secret pnpm --filter @oh-writers/web dev`,
      url: TEST_BASE_URL,
      // Always start a dedicated test server so it uses the test DB, never the
      // dev DB. Locally a warm server (already bound to the test DB) can be
      // reused by exporting PW_REUSE_SERVER=1 — never set in CI.
      reuseExistingServer: process.env["PW_REUSE_SERVER"] === "1",
      // CI cold starts (vinxi + Vite) routinely exceed 60s on GitHub runners;
      // 180s gives headroom without hiding real start-up issues.
      timeout: 180_000,
    },
    {
      // MOCK_AI is baked in at BUILD time (Vite `define`), so it must be set
      // for the build step too, not just the start step, or this "prod" build
      // would call the real Anthropic API. Uses the same test DB as the dev
      // webServer above — this is only about isDevEnvironment, not data.
      command: `PORT=${PROD_PORT} BETTER_AUTH_URL=${PROD_BASE_URL} DATABASE_URL=${TEST_DB_URL} VITE_WS_URL= DEV_AUTH_BYPASS=false LLM_FIRST_BREAKDOWN=false MOCK_AI=true CRON_SECRET=test-cron-secret pnpm --filter @oh-writers/web build && PORT=${PROD_PORT} BETTER_AUTH_URL=${PROD_BASE_URL} DATABASE_URL=${TEST_DB_URL} VITE_WS_URL= DEV_AUTH_BYPASS=false LLM_FIRST_BREAKDOWN=false MOCK_AI=true CRON_SECRET=test-cron-secret pnpm --filter @oh-writers/web start`,
      url: PROD_BASE_URL,
      reuseExistingServer: process.env["PW_REUSE_SERVER"] === "1",
      // Build + start: a cold production build easily exceeds the 180s the
      // dev server gets.
      timeout: 300_000,
    },
  ],
});
