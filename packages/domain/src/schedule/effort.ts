export const DAILY_CAPACITY_HOURS = 8;

export const resolveEffortHours = (
  pageCount: number,
  override: number | null,
): number => override ?? pageCount * 1.0;
