import { expect, type APIRequestContext } from "@playwright/test";
import { BASE_URL } from "./fixtures";

const SEED_PATH = "/api/test/fundraising-seed";

/**
 * POST the test-only fundraising seed endpoint, retrying on a 503.
 *
 * The dev server (vinxi) lazy-compiles API file routes on first hit, so the very
 * first request to `/api/test/fundraising-seed` in a run can land while the
 * route module is still compiling and return a generic 503. Retry until the
 * route is warm (it then returns 200/4xx from the handler itself).
 */
export async function seedFundraising(
  request: APIRequestContext,
  data: Record<string, unknown>,
): Promise<{ itemId?: string; opportunityId?: string }> {
  let res = await request.post(`${BASE_URL}${SEED_PATH}`, { data });
  // The dev server (vinxi) compiles this API route lazily on first hit and can
  // return 503 for several seconds while it builds (the schema imports are
  // heavy). Retry generously until it's warm.
  for (let attempt = 0; attempt < 40 && res.status() === 503; attempt++) {
    await new Promise((r) => setTimeout(r, 750));
    res = await request.post(`${BASE_URL}${SEED_PATH}`, { data });
  }
  expect(res.status(), `seed responded ${res.status()}`).toBe(200);
  return (await res.json()) as { itemId?: string; opportunityId?: string };
}
