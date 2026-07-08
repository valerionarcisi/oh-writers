import type { Market } from "./market.js";
import type { Plan } from "./plan.js";

/**
 * Every gateable feature. The full surface is catalogued so the framework is
 * complete and uniform — every nav feature + Cesare asks `useFeature(...)` even
 * though only the Italy-only ones ever turn off today. Adding plan/user gating
 * later is a rule change in `resolveFeatures`, not a new call site.
 */
export const Features = {
  // Narrative
  SOGGETTO: "soggetto",
  SYNOPSIS: "synopsis",
  OUTLINE: "outline",
  TREATMENT: "treatment",
  SCREENPLAY: "screenplay",
  // Production
  BREAKDOWN: "breakdown",
  BUDGET: "budget",
  SCHEDULE: "schedule",
  LOCATIONS: "locations",
  SHOOTING_PLAN: "shootingPlan",
  // Cross-cutting
  CESARE: "cesare",
  // Italy-only — detached on the international (EN) market
  SIAE_EXPORT: "siaeExport",
  FUNDRAISING: "fundraising",
} as const;

export type Feature = (typeof Features)[keyof typeof Features];

const ALL_FEATURES: ReadonlyArray<Feature> = Object.values(Features);

/** Features available only in the Italian market. */
const ITALY_ONLY: ReadonlySet<Feature> = new Set<Feature>([
  Features.SIAE_EXPORT,
  Features.FUNDRAISING,
]);

/**
 * Features not yet stable enough for production — visible only when the app
 * runs in a development environment (`import.meta.env.DEV`). Stable surface
 * today stops at Breakdown + Calendario; Budget/Location/Piano di ripresa are
 * still shaping up.
 */
const DEV_ONLY: ReadonlySet<Feature> = new Set<Feature>([
  Features.BUDGET,
  Features.LOCATIONS,
  Features.SHOOTING_PLAN,
]);

export interface FeatureContext {
  market: Market;
  plan: Plan;
  /** True in a development environment (`import.meta.env.DEV`). Gates
   *  `DEV_ONLY` features — false (production) hides them. Required (not
   *  optional): an omitted field silently resolves to "hidden," which is
   *  the right default for production but the wrong one to fall into by
   *  accident — every call site must say which environment it means. */
  isDevEnvironment: boolean;
  /**
   * Features the user has switched off in settings. Designed-for now; the
   * settings toggle + its persistence ship in a later cycle, so this is empty
   * in practice today.
   */
  userDisabled?: ReadonlySet<Feature>;
}

/**
 * Resolve the set of ENABLED features. First source to exclude wins
 * (market → stage → plan → user). Market drops the Italy-only features on the
 * international market; stage drops DEV_ONLY features outside a dev
 * environment. Plan is permissive until billing exists; userDisabled is
 * honoured when populated.
 */
export const resolveFeatures = (ctx: FeatureContext): ReadonlySet<Feature> => {
  const enabled = new Set<Feature>();
  for (const feature of ALL_FEATURES) {
    if (ctx.market === "intl" && ITALY_ONLY.has(feature)) continue;
    if (!ctx.isDevEnvironment && DEV_ONLY.has(feature)) continue;
    // Plan gating: no feature is plan-restricted yet — every plan unlocks all.
    if (ctx.userDisabled?.has(feature)) continue;
    enabled.add(feature);
  }
  return enabled;
};

export const isFeatureEnabled = (
  feature: Feature,
  ctx: FeatureContext,
): boolean => resolveFeatures(ctx).has(feature);
