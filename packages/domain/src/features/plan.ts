/**
 * Subscription plan. Real billing (Spec 16-core) does not exist yet, so the
 * resolver treats every plan permissively — `Plans.STUDIO` is the safe default
 * that unlocks everything. The type + the default are in place so plan-gating
 * later is a data change, not a code change.
 */
export const Plans = {
  FREE: "free",
  PRO: "pro",
  STUDIO: "studio",
} as const;

export type Plan = (typeof Plans)[keyof typeof Plans];

/** The permissive default used everywhere until billing lands. */
export const DEFAULT_PLAN: Plan = Plans.STUDIO;
