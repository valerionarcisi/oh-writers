import { test, expect, BASE_URL } from "./fixtures";

const CRON_SECRET = "test-cron-secret";
const CRON_PATH = "/api/cron/fundraising-ingest";

/**
 * [Spec 35] Fundraising RSS ingestion — cron endpoint
 *
 * Verifies the cron auth gate and the happy path of triggering ingestion
 * across all active sources. The seeded fundraising sources point to real
 * external feeds that may be unreachable from CI; the endpoint reports
 * per-source errors in its summary rather than failing the whole call.
 */
test.describe("[Spec 35] Fundraising ingest", () => {
  test("[358] Cron endpoint rejects requests without the secret header", async ({
    request,
  }) => {
    const res = await request.post(`${BASE_URL}${CRON_PATH}`);
    expect(res.status()).toBe(401);
  });

  test("[358] Cron endpoint rejects requests with a wrong secret", async ({
    request,
  }) => {
    const res = await request.post(`${BASE_URL}${CRON_PATH}`, {
      headers: { "x-cron-secret": "nope" },
    });
    expect(res.status()).toBe(401);
  });

  test("[350] Cron endpoint returns a summary when authenticated", async ({
    request,
  }) => {
    const res = await request.post(`${BASE_URL}${CRON_PATH}`, {
      headers: { "x-cron-secret": CRON_SECRET },
    });
    expect(res.status()).toBe(200);
    const body = (await res.json()) as {
      total: number;
      ok: number;
      errors: unknown[];
      inserted: number;
    };
    expect(typeof body.total).toBe("number");
    expect(typeof body.ok).toBe("number");
    expect(Array.isArray(body.errors)).toBe(true);
    expect(typeof body.inserted).toBe("number");
    // Seed runs 10 curated sources in the test DB.
    expect(body.total).toBeGreaterThan(0);
  });
});
