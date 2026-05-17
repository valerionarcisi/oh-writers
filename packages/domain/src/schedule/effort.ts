export const EFFORT_LEVELS = [1, 2, 3, 4, 5] as const;
export type EffortLevel = (typeof EFFORT_LEVELS)[number];

export const EFFORT_LABELS: Record<EffortLevel, string> = {
  1: "Semplice",
  2: "Normale",
  3: "Complessa",
  4: "Difficile",
  5: "Eccezionale",
};

export const DEFAULT_EFFORT: EffortLevel = 2;

export const BASE_MINUTES_PER_SHOT = 15;

export const DAILY_CAPACITY_HOURS = 8;

export const SHOOTING_DAY_MINUTES = DAILY_CAPACITY_HOURS * 60;

/**
 * Minutes required to shoot a scene at each effort level.
 * Used by the "Genera piano" bulk planner to group scenes into shooting days.
 */
export const EFFORT_MINUTES: Record<EffortLevel, number> = {
  1: 20,
  2: 45,
  3: 90,
  4: 180,
  5: 360,
};

export const resolveEffortHours = (
  pageCount: number,
  override: number | null,
): number => override ?? pageCount * 1.0;
