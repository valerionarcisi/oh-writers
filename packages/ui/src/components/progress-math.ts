/**
 * Pure math helpers for the Progress component. Extracted so the
 * arithmetic can be unit-tested without spinning up React/JSDOM.
 */

export const toPercent = (value: number, max: number): number => {
  if (!Number.isFinite(value) || !Number.isFinite(max)) return 0;
  if (max <= 0) return 0;
  const ratio = value / max;
  if (ratio <= 0) return 0;
  if (ratio >= 1) return 100;
  return Math.round(ratio * 100);
};
