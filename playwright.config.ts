import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 2 : 0,
  workers: process.env["CI"] ? 1 : undefined,
  reporter: [["html", { open: "never" }]],
  use: {
    baseURL: process.env["BASE_URL"] ?? "http://localhost:3000",
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
      command: `PORT=${process.env["WEB_PORT"] ?? "3000"} pnpm --filter @oh-writers/web dev`,
      url: process.env["BASE_URL"] ?? "http://localhost:3000",
      reuseExistingServer: !process.env["CI"],
      timeout: 60_000,
    },
    {
      command: "pnpm --filter @oh-writers/ws-server dev",
      url: "http://localhost:1234/health",
      reuseExistingServer: !process.env["CI"],
      timeout: 30_000,
    },
  ],
});
