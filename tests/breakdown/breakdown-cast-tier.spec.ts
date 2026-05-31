import { test } from "../fixtures";

/**
 * [Spec 10d] Cast tier on breakdown elements
 *
 * SKIPPED (removed UI, not a v3 testid rename): all three tests drove the
 * "Aggiungi elemento" modal (`add-element-trigger` → `add-element-category` →
 * `add-element-cast-tier` → `add-element-name` → `add-element-submit`) and the
 * `cast-tier-label-*` / `accepted-tag-*` side-panel chips. The v3 breakdown
 * redesign removed the BreakdownPanel and its AddElementModal entirely — there
 * is no rendered `add-element-trigger` anywhere in the per-scene view, so the
 * manual add-with-tier flow no longer exists to test.
 *
 * Cast tier itself survives as data and is rendered as a "Tier" column in the
 * per-project ProjectBreakdownView table; the manual-creation flow these tests
 * exercised does not. Re-enable if/when an add-element affordance returns.
 */
test.describe("[Spec 10d] Cast tier on breakdown elements", () => {
  test.skip("[OHW-300] Aggiungi defaults to Cast and shows the Tier select", () => {});
  test.skip("[OHW-301] Tier select hides when category is not Cast", () => {});
  test.skip("[OHW-302] Add a Day Player → Cast section sub-groups by tier", () => {});
});
