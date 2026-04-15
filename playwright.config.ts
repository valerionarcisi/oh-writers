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
  reporter: [["html", { open: "never" }]],
  use: {
    baseURL: TEST_BASE_URL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: `PORT=${TEST_PORT} BETTER_AUTH_URL=${TEST_BASE_URL} DATABASE_URL=${TEST_DB_URL} pnpm --filter @oh-writers/web dev`,
      url: TEST_BASE_URL,
      // Always start a dedicated test server so it uses the test DB, never the dev DB.
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
