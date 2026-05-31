import { test } from "../fixtures";

/**
 * [Spec 10 — OHW-243] "Ignora tutti" dismiss-all-suggestions flow.
 *
 * SKIPPED (removed UI, not a v3 testid rename): this exercised the per-scene
 * Cesare suggestion banner (`cesare-suggest-scene` → `cesare-suggestion-banner`
 * → "Ignora tutti") plus the side-panel `ghost-tag-*` / `accepted-tag-*` chips,
 * all of which lived on the BreakdownPanel that v3 removed. There is no bulk
 * "Ignora tutti" affordance for scene ghosts anymore — ghosts are accepted or
 * ignored individually via the inline GhostPopover (click ghost → Accetta /
 * Ignora), which is covered by inline-tagging OHW-285 / OHW-286. Re-enable if a
 * bulk dismiss-all affordance is reintroduced.
 */
test.describe("[Spec 10] Breakdown — Ignora tutti", () => {
  test.skip("removes ghost suggestions and does not leak them into the project table", () => {});
});
