import { test } from "../fixtures";

/**
 * [Spec 10 — E2/E4] Cesare browser flow
 *
 * The deterministic MOCK_AI fixture is exhaustively unit-tested at
 * `apps/web/app/mocks/ai-responses.test.ts` (257). The
 * `checkAndStampRateLimit` helper is unit-tested at
 * `apps/web/app/features/breakdown/lib/rate-limit.test.ts` (259).
 */

test.describe("[Spec 10] Breakdown — Cesare", () => {
  // SKIPPED (removed UI, not a v3 testid rename): this asserted the per-scene
  // "Suggerisci" button (`cesare-suggest-scene`) on the BreakdownPanel. The v3
  // redesign removed the BreakdownPanel and its suggest button — breakdown
  // suggestions now surface as inline ghosts auto-generated on mount (no manual
  // per-scene trigger). There is no rendered `cesare-suggest-scene` to test.
  test.skip("[257-ui] suggest button visible and operable for editor", () => {});

  test.skip("[258] re-run Cesare on already-breakdown scene preserves accepted/ignored states", () => {
    // Pending: requires a seeded scene with a mix of pending/accepted/
    // ignored occurrences from a previous Cesare run, then assert that
    // calling suggest again only adds new pending rows and never
    // overwrites the existing terminal states.
  });

  test.skip("[259] suggest-all rate limit toast within 5 minutes", () => {
    // Pending: blocked by the missing "Suggerisci tutto lo script" UI
    // affordance + the matching `suggestBreakdownForAllScenes` server
    // fn. The per-scene rate-limit branch is covered by the unit test on
    // `checkAndStampRateLimit`.
  });

  test.skip("[257] MOCK_AI returns deterministic 5 suggestions for warehouse fixture", () => {
    // Pending: requires (a) the dev server to be launched with
    // MOCK_AI=true (Playwright cannot toggle it after start) and (b) a
    // seeded scene whose heading contains "WAREHOUSE" + "Rick" so the
    // mock heuristic fires. Until the seed lands a dedicated warehouse
    // fixture, the assertion is satisfied by the unit test in
    // ai-responses.test.ts that exercises the same code path with no
    // browser overhead.
  });
});
