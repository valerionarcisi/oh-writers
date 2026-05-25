import { test, expect, BASE_URL, TEST_TEAM_PROJECT_ID } from "./fixtures";

const SEED_PATH = "/api/test/fundraising-seed";

/**
 * [Spec 35] Fundraising UI — Phase 3
 *
 * Tests run with MOCK_AI=true against the test DB.
 * Opportunities are seeded directly via the extended /api/test/fundraising-seed
 * endpoint (withOpportunity field), bypassing classification.
 *
 * OHW-355: expired deadline → status=expired filter shows/hides correctly
 * OHW-356: save/dismiss/applied state persists per project
 */
test.describe("[Spec 35] Fundraising UI", () => {
  test("[OHW-355] expired item hidden in active filter, visible in expired filter", async ({
    authenticatedPage: page,
    request,
  }) => {
    const pastDeadline = new Date(Date.now() - 10 * 86_400_000).toISOString();
    const guid = `ohw-e2e-355-${Date.now()}`;

    // Seed an expired opportunity
    const seedRes = await request.post(`${BASE_URL}${SEED_PATH}`, {
      data: {
        title: "Bando scaduto E2E test 355",
        guid,
        rawText: "Bando già scaduto per test.",
        withOpportunity: {
          kind: "bando_pubblico",
          status: "expired",
          deadlineAt: pastDeadline,
          organization: "Ente Test 355",
        },
      },
    });
    expect(seedRes.status()).toBe(200);
    const { opportunityId } = (await seedRes.json()) as {
      itemId: string;
      opportunityId?: string;
    };
    expect(opportunityId).toBeTruthy();

    // Navigate to the opportunities page
    await page.goto(
      `${BASE_URL}/projects/${TEST_TEAM_PROJECT_ID}/opportunities`,
    );
    await page.waitForLoadState("networkidle");

    // Default filter is "Attivi" — expired item should NOT be visible
    const activeChip = page.getByTestId("filter-status-active");
    await expect(activeChip).toBeVisible({ timeout: 10_000 });
    // The expired opportunity card should not exist in the active view
    const cardInActive = page.getByTestId(`opportunity-card-${opportunityId}`);
    await expect(cardInActive).not.toBeVisible();

    // Switch to "Scaduti"
    const expiredChip = page.getByTestId("filter-status-expired");
    await expiredChip.click();
    await page.waitForLoadState("networkidle");

    // Now the expired card should appear
    await expect(cardInActive).toBeVisible({ timeout: 10_000 });
  });

  test("[OHW-356] save state persists after page reload", async ({
    authenticatedPage: page,
    request,
  }) => {
    const futureDeadline = new Date(Date.now() + 60 * 86_400_000).toISOString();
    const guid = `ohw-e2e-356-${Date.now()}`;

    // Seed an active opportunity
    const seedRes = await request.post(`${BASE_URL}${SEED_PATH}`, {
      data: {
        title: "Grant attivo E2E test 356",
        guid,
        rawText: "Grant per cortometraggi italiani.",
        withOpportunity: {
          kind: "grant_privato",
          status: "active",
          deadlineAt: futureDeadline,
          organization: "Fondazione Test 356",
        },
      },
    });
    expect(seedRes.status()).toBe(200);
    const { opportunityId } = (await seedRes.json()) as {
      itemId: string;
      opportunityId?: string;
    };
    expect(opportunityId).toBeTruthy();

    await page.goto(
      `${BASE_URL}/projects/${TEST_TEAM_PROJECT_ID}/opportunities`,
    );
    await page.waitForLoadState("networkidle");

    // Click the card to open the drawer
    const card = page.getByTestId(`opportunity-card-${opportunityId}`);
    await expect(card).toBeVisible({ timeout: 10_000 });
    await card.click();

    // Drawer should open
    const drawer = page.getByTestId("opportunity-drawer");
    await expect(drawer).toBeVisible({ timeout: 5_000 });

    // Click "Salva" in the drawer
    const saveBtn = drawer.getByTestId("save-btn");
    await expect(saveBtn).toBeVisible();
    await saveBtn.click();

    // Save button should be active (aria or data-active)
    await expect(saveBtn).toHaveAttribute("data-active", "true");

    // Reload page
    await page.reload();
    await page.waitForLoadState("networkidle");

    // Re-open the card
    const cardAfterReload = page.getByTestId(
      `opportunity-card-${opportunityId}`,
    );
    await expect(cardAfterReload).toBeVisible({ timeout: 10_000 });
    await cardAfterReload.click();

    // Verify saved state persists
    const drawerAfterReload = page.getByTestId("opportunity-drawer");
    await expect(drawerAfterReload).toBeVisible({ timeout: 5_000 });
    const saveBtnAfterReload = drawerAfterReload.getByTestId("save-btn");
    await expect(saveBtnAfterReload).toHaveAttribute("data-active", "true");
  });
});
