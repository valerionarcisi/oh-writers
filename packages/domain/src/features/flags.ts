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
  /**
   * Spec 84 §5 — the master AI switch. OFF hides every AI surface (Cesare
   * drawer/dock, margin notes, breakdown AI actions, generator CTAs) and
   * shows exactly one dismissible "Attiva l'AI" banner instead. Resolved
   * per-user server-side from provider/trial state — see
   * `resolveAiEnabled` in `apps/web/app/features/feature-flags/`.
   */
  AI_ENABLED: "aiEnabled",
  /**
   * Spec 84 §2.2 (Wave 3) — the onboarding trial quota switch. ON means a
   * small one-time platform-funded AI allowance exists for users with no
   * connected provider, metered from the `ai_usage` ledger. Resolved from
   * the `AI_TRIAL_QUOTA_EUR` env var server-side (see `checkTrialQuota` in
   * `apps/web/app/features/ai/ai-usage.server.ts`) — this catalogue entry
   * documents the switch; it is not driven through `resolveFeatures`'
   * market/plan/user context like the UI-facing features above, because it
   * gates a server-only allowance amount, not a rendered surface. Default
   * OFF is the safe default (no platform-funded spend unless explicitly
   * turned on).
   */
  AI_TRIAL_QUOTA: "aiTrialQuota",
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
  /**
   * Spec 84 §5 — whether the user has a working AI source (connected
   * provider OR remaining trial quota), resolved server-side per user. Gates
   * `Features.AI_ENABLED` only; every other feature is unaffected. Required
   * (not optional) for the same reason as `isDevEnvironment`: an omitted
   * field must never silently resolve to "AI on" by accident.
   */
  isAiEnabled: boolean;
}

/**
 * Resolve the set of ENABLED features. First source to exclude wins
 * (market → stage → plan → user → AI state). Market drops the Italy-only
 * features on the international market; stage drops DEV_ONLY features
 * outside a dev environment. Plan is permissive until billing exists;
 * userDisabled is honoured when populated; `isAiEnabled: false` drops
 * `Features.AI_ENABLED` (and only that feature — components gate every AI
 * surface on it individually, per Spec 84).
 */
export const resolveFeatures = (ctx: FeatureContext): ReadonlySet<Feature> => {
  const enabled = new Set<Feature>();
  for (const feature of ALL_FEATURES) {
    if (ctx.market === "intl" && ITALY_ONLY.has(feature)) continue;
    if (!ctx.isDevEnvironment && DEV_ONLY.has(feature)) continue;
    // Plan gating: no feature is plan-restricted yet — every plan unlocks all.
    if (ctx.userDisabled?.has(feature)) continue;
    if (!ctx.isAiEnabled && feature === Features.AI_ENABLED) continue;
    enabled.add(feature);
  }
  return enabled;
};

export const isFeatureEnabled = (
  feature: Feature,
  ctx: FeatureContext,
): boolean => resolveFeatures(ctx).has(feature);
