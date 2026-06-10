import { defineConfig, devices } from "@playwright/test";

const TEST_PORT = process.env["WEB_PORT"] ?? "3002";
const TEST_BASE_URL =
  process.env["BASE_URL"] ?? `http://localhost:${TEST_PORT}`;
const TEST_DB_URL =
  process.env["DATABASE_URL_TEST"] ??
  "postgresql://oh-writers:oh-writers@localhost:5432/oh-writers_test";

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
      // Agentic specs require MOCK_AI=true and live in the mock-ui project; keep
      // them out of the default run so they aren't executed twice.
      testIgnore: /cesare-agentic-.*\.spec\.ts$/,
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
      dependencies: ["warmup"],
      use: {
        ...devices["Desktop Chrome"],
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
      command: `PORT=${TEST_PORT} BETTER_AUTH_URL=${TEST_BASE_URL} DATABASE_URL=${TEST_DB_URL} VITE_WS_URL= LLM_FIRST_BREAKDOWN=false MOCK_AI=true CRON_SECRET=test-cron-secret pnpm --filter @oh-writers/web dev`,
      url: TEST_BASE_URL,
      // Always start a dedicated test server so it uses the test DB, never the
      // dev DB. Locally a warm server (already bound to the test DB) can be
      // reused by exporting PW_REUSE_SERVER=1 — never set in CI.
      reuseExistingServer: process.env["PW_REUSE_SERVER"] === "1",
      // CI cold starts (vinxi + Vite) routinely exceed 60s on GitHub runners;
      // 180s gives headroom without hiding real start-up issues.
      timeout: 180_000,
    },
  ],
});
