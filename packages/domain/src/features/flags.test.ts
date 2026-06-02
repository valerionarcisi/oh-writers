import { describe, expect, it } from "vitest";
import {
  Features,
  resolveFeatures,
  isFeatureEnabled,
  type FeatureContext,
} from "./flags.js";
import { Plans } from "./plan.js";

const ctx = (over: Partial<FeatureContext>): FeatureContext => ({
  market: "it",
  plan: Plans.STUDIO,
  ...over,
});

describe("resolveFeatures", () => {
  it("enables everything in the Italian market", () => {
    const enabled = resolveFeatures(ctx({ market: "it" }));
    expect(enabled.has(Features.SIAE_EXPORT)).toBe(true);
    expect(enabled.has(Features.FUNDRAISING)).toBe(true);
    expect(enabled.has(Features.SCREENPLAY)).toBe(true);
    expect(enabled.has(Features.CESARE)).toBe(true);
  });

  it("detaches ONLY the Italy-only features on the international market", () => {
    const enabled = resolveFeatures(ctx({ market: "intl" }));
    expect(enabled.has(Features.SIAE_EXPORT)).toBe(false);
    expect(enabled.has(Features.FUNDRAISING)).toBe(false);
    // Everything else stays on.
    expect(enabled.has(Features.SCREENPLAY)).toBe(true);
    expect(enabled.has(Features.BUDGET)).toBe(true);
    expect(enabled.has(Features.CESARE)).toBe(true);
    expect(enabled.has(Features.LOCATIONS)).toBe(true);
  });

  it("plan is permissive — no feature is plan-gated yet", () => {
    for (const plan of [Plans.FREE, Plans.PRO, Plans.STUDIO]) {
      const enabled = resolveFeatures(ctx({ market: "it", plan }));
      expect(enabled.has(Features.CESARE)).toBe(true);
    }
  });

  it("honours userDisabled when populated (forward-compat)", () => {
    const enabled = resolveFeatures(
      ctx({ userDisabled: new Set([Features.CESARE]) }),
    );
    expect(enabled.has(Features.CESARE)).toBe(false);
    expect(enabled.has(Features.SCREENPLAY)).toBe(true);
  });

  it("market exclusion wins regardless of plan/user", () => {
    expect(
      isFeatureEnabled(
        Features.SIAE_EXPORT,
        ctx({ market: "intl", plan: Plans.STUDIO }),
      ),
    ).toBe(false);
  });
});
