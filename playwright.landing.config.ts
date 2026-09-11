import { defineConfig, devices } from "@playwright/test";

// Static apps/landing pages: plain HTML/CSS/JS, no build step, no DB, no
// auth. Separate from the main playwright.config.ts on purpose — that
// config's webServer array always starts every entry (the full vinxi dev
// server + a prod build) regardless of --project, which would make a static
// HTML smoke test wait on Postgres and a cold build for no reason.
//
// Run with: npx playwright test -c playwright.landing.config.ts

const PORT = process.env["LANDING_PORT"] ?? "4174";
const BASE_URL = process.env["LANDING_BASE_URL"] ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/landing",
  fullyParallel: true,
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 2 : 0,
  reporter: process.env["CI"]
    ? [
        ["list"],
        ["html", { open: "never", outputFolder: "playwright-report-landing" }],
      ]
    : [["html", { open: "never", outputFolder: "playwright-report-landing" }]],
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `npx --yes serve@latest apps/landing -l ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: process.env["PW_REUSE_SERVER"] === "1",
    timeout: 30_000,
  },
});
