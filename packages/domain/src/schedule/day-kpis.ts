/**
 * Day-level KPIs aggregated from the strips assigned to a single shooting day.
 *
 * Pure, side-effect-free, runtime-agnostic. The web app and any future mobile
 * companion both consume this. The output is what the schedule view renders
 * in the per-day header (mockup A) and in the day drilldown (mockup D).
 */

export interface DayKpiInput {
  readonly pageCount: number;
  readonly resolvedHours: number;
  readonly location: string | null;
  readonly intExt: string;
  readonly castIds?: ReadonlyArray<string>;
}

export interface DayKpis {
  readonly sceneCount: number;
  readonly totalPages: number;
  readonly totalHours: number;
  readonly locationCount: number;
  readonly castCount: number;
  readonly primaryLocation: string | null;
  readonly intExtMix: "INT" | "EXT" | "MIX";
}

const normalizeLocation = (loc: string | null): string | null => {
  if (!loc) return null;
  const trimmed = loc.trim();
  return trimmed.length === 0 ? null : trimmed.toUpperCase();
};

const pickPrimaryLocation = (
  strips: ReadonlyArray<DayKpiInput>,
): string | null => {
  const counts = new Map<string, number>();
  for (const s of strips) {
    const key = normalizeLocation(s.location);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  if (counts.size === 0) return null;
  let bestKey: string | null = null;
  let bestCount = -1;
  for (const [key, count] of counts) {
    if (count > bestCount) {
      bestCount = count;
      bestKey = key;
    }
  }
  return bestKey;
};

const resolveIntExtMix = (
  strips: ReadonlyArray<DayKpiInput>,
): "INT" | "EXT" | "MIX" => {
  let sawInt = false;
  let sawExt = false;
  for (const s of strips) {
    const v = s.intExt.toUpperCase();
    if (v.includes("INT")) sawInt = true;
    if (v.includes("EXT")) sawExt = true;
  }
  if (sawInt && sawExt) return "MIX";
  if (sawExt) return "EXT";
  return "INT";
};

export const computeDayKpis = (
  strips: ReadonlyArray<DayKpiInput>,
): DayKpis => {
  if (strips.length === 0) {
    return {
      sceneCount: 0,
      totalPages: 0,
      totalHours: 0,
      locationCount: 0,
      castCount: 0,
      primaryLocation: null,
      intExtMix: "INT",
    };
  }

  const locations = new Set<string>();
  const cast = new Set<string>();
  let totalPages = 0;
  let totalHours = 0;

  for (const s of strips) {
    const loc = normalizeLocation(s.location);
    if (loc) locations.add(loc);
    if (s.castIds) for (const id of s.castIds) cast.add(id);
    totalPages += s.pageCount;
    totalHours += s.resolvedHours;
  }

  return {
    sceneCount: strips.length,
    totalPages,
    totalHours: Math.round(totalHours * 100) / 100,
    locationCount: locations.size,
    castCount: cast.size,
    primaryLocation: pickPrimaryLocation(strips),
    intExtMix: resolveIntExtMix(strips),
  };
};

/** Format total hours as "9h 30m" or "9h" when minutes are zero. */
export const formatDayHours = (hours: number): string => {
  if (hours <= 0) return "0h";
  const whole = Math.floor(hours);
  const minutes = Math.round((hours - whole) * 60);
  if (minutes === 0) return `${whole}h`;
  return `${whole}h ${minutes}m`;
};
