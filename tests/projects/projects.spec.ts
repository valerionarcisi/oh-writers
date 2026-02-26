/**
 * Spec 03 — Projects
 *
 * Browser E2E tests. Require the dev server running with MOCK_API=true:
 *   MOCK_API=true pnpm dev
 *
 * Run tests:
 *   pnpm test
 *
 * [OHW-031] Project creation → 4 documents + 1 screenplay auto-created
 * [OHW-032] Personal project creation succeeds for MOCK_USER (team viewer
 *            restriction is enforced in the server function — see projects.server.ts)
 * [OHW-033] Archiving a project shows archived state and disables edit
 * [OHW-034] Delete requires archiving first; archive → delete → redirect to dashboard
 */

import { test, expect } from "@playwright/test";

const BASE = "http://localhost:3002";

test("[OHW-031] project creation auto-creates 4 documents and 1 screenplay", async ({
  page,
}) => {
  await page.goto(`${BASE}/projects/new`);
  await expect(
    page.getByRole("heading", { name: "New Project" }),
  ).toBeVisible();

  await page.getByLabel("Title").fill("OHW-031 Browser Test");
  await page.getByLabel("Format").selectOption("feature");
  await page.getByRole("button", { name: "Create project" }).click();

  // Redirected to project overview
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);

  // All 4 document type labels are visible
  await expect(page.getByText("logline")).toBeVisible();
  await expect(page.getByText("synopsis")).toBeVisible();
  await expect(page.getByText("outline")).toBeVisible();
  await expect(page.getByText("treatment")).toBeVisible();

  // Screenplay section is rendered
  await expect(page.getByRole("heading", { name: "Screenplay" })).toBeVisible();
});

test("[OHW-032] personal project creation succeeds; project overview renders correctly", async ({
  page,
}) => {
  await page.goto(`${BASE}/projects/new`);

  await page.getByLabel("Title").fill("OHW-032 Access Test");
  await page.getByLabel("Format").selectOption("short");
  await page.getByLabel("Genre").selectOption("thriller");
  await page.getByRole("button", { name: "Create project" }).click();

  // Personal project creation always succeeds for MOCK_USER
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
  await expect(
    page.getByRole("heading", { name: "OHW-032 Access Test" }),
  ).toBeVisible();

  // Genre badge is shown
  await expect(page.getByText("thriller")).toBeVisible();
});

test("[OHW-033] archiving a project makes it read-only", async ({ page }) => {
  // Create
  await page.goto(`${BASE}/projects/new`);
  await page.getByLabel("Title").fill("OHW-033 Archive Test");
  await page.getByLabel("Format").selectOption("short");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);

  // Archive
  await page.getByRole("button", { name: "Archive" }).click();

  // Archived badge is now visible
  await expect(page.getByText("Archived")).toBeVisible();

  // Restore + Delete buttons appear; Archive button is gone
  await expect(page.getByRole("button", { name: "Restore" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Archive" })).not.toBeVisible();

  // Settings page shows read-only message
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByText("You don't have edit access")).toBeVisible();
});

test("[OHW-034] deleting without archiving is prevented; archive then delete redirects to dashboard", async ({
  page,
}) => {
  // Create
  await page.goto(`${BASE}/projects/new`);
  await page.getByLabel("Title").fill("OHW-034 Delete Test");
  await page.getByLabel("Format").selectOption("feature");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);

  const projectUrl = page.url();

  // Delete button is not visible on a non-archived project
  await expect(page.getByRole("button", { name: "Delete" })).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Archive" })).toBeVisible();

  // Archive first
  await page.getByRole("button", { name: "Archive" }).click();
  await expect(page.getByText("Archived")).toBeVisible();

  // Delete is now available — accept the window.confirm dialog
  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete" }).click();

  // Redirected to dashboard after successful deletion
  await expect(page).toHaveURL(/\/dashboard$/);

  // Navigating back to the project URL shows "not found"
  await page.goto(projectUrl);
  await expect(page.getByText("Project not found")).toBeVisible();
});
