import { defineConfig, devices } from "@playwright/test";

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
    baseURL: process.env["BASE_URL"] ?? "http://localhost:3002",
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
      command: `PORT=${process.env["WEB_PORT"] ?? "3002"} BETTER_AUTH_URL=http://localhost:${process.env["WEB_PORT"] ?? "3002"} pnpm --filter @oh-writers/web dev`,
      url: process.env["BASE_URL"] ?? "http://localhost:3002",
      reuseExistingServer: !process.env["CI"],
      timeout: 60_000,
    },
  ],
});
