/**
 * Algorithmic Cesare suggestions over a generated schedule.
 *
 * Pure, side-effect-free. Runs in the browser on every render of the
 * schedule page — no server call, no AI. The four rules below model the
 * "controllore garbato" pattern: surface actionable hints inline, never
 * block the user, never open a chat sidebar.
 *
 * Input is intentionally structural (not tied to the web `ScheduleView`
 * type) so the future mobile companion can call this with its own DTO
 * shape.
 */

const HEAVY_DAY_THRESHOLD_HOURS = 10;
const EMPTY_DAY_NEIGHBOR_THRESHOLD = 4;
const CONSOLIDATE_MIN_SCENES = 2;

export interface SuggestionStripInput {
  readonly id: string;
  readonly sceneNumber: number;
  readonly location: string | null;
  readonly resolvedHours: number;
  readonly timeOfDay: string | null;
  readonly sceneHeading: string | null;
}

export interface SuggestionDayInput {
  readonly id: string;
  readonly dayNumber: number;
  readonly strips: ReadonlyArray<SuggestionStripInput>;
}

export interface SuggestionScheduleInput {
  readonly shootingDays: ReadonlyArray<SuggestionDayInput>;
}

export type SuggestionKind =
  | "consolidate-location"
  | "heavy-day"
  | "empty-day-redistribute"
  | "magic-hour";

export interface SuggestionPayload {
  readonly stripId?: string;
  readonly sourceDayId?: string;
  readonly targetDayId?: string;
  readonly hint?: string;
}

export interface Suggestion {
  readonly id: string;
  readonly kind: SuggestionKind;
  readonly message: string;
  readonly applyLabel: string;
  readonly payload: SuggestionPayload;
}

const normalizeLocation = (loc: string | null): string | null => {
  if (!loc) return null;
  const trimmed = loc.trim();
  return trimmed.length === 0 ? null : trimmed.toUpperCase();
};

const padDay = (n: number): string => String(n).padStart(2, "0");

const dayHours = (day: SuggestionDayInput): number =>
  day.strips.reduce((sum, s) => sum + (s.resolvedHours ?? 0), 0);

const MAGIC_HOUR_PATTERNS = [
  /magic\s*hour/i,
  /\balba\b/i,
  /\btramonto\b/i,
  /\bgolden\s*hour\b/i,
];

const matchesMagicHour = (strip: SuggestionStripInput): boolean => {
  const haystack = `${strip.timeOfDay ?? ""} ${strip.sceneHeading ?? ""}`;
  return MAGIC_HOUR_PATTERNS.some((re) => re.test(haystack));
};

interface LocationOccurrence {
  readonly dayId: string;
  readonly dayNumber: number;
  readonly sceneCount: number;
  readonly stripsHere: ReadonlyArray<SuggestionStripInput>;
}

const consolidateLocationSuggestions = (
  schedule: SuggestionScheduleInput,
): Suggestion[] => {
  const byLocation = new Map<string, LocationOccurrence[]>();

  for (const day of schedule.shootingDays) {
    const grouped = new Map<string, SuggestionStripInput[]>();
    for (const strip of day.strips) {
      const key = normalizeLocation(strip.location);
      if (!key) continue;
      const arr = grouped.get(key) ?? [];
      arr.push(strip);
      grouped.set(key, arr);
    }
    for (const [key, stripsHere] of grouped) {
      const list = byLocation.get(key) ?? [];
      list.push({
        dayId: day.id,
        dayNumber: day.dayNumber,
        sceneCount: stripsHere.length,
        stripsHere,
      });
      byLocation.set(key, list);
    }
  }

  const out: Suggestion[] = [];
  for (const [location, occurrences] of byLocation) {
    if (occurrences.length < 2) continue;

    const sparse = occurrences.filter(
      (o) => o.sceneCount <= CONSOLIDATE_MIN_SCENES,
    );
    if (sparse.length === 0) continue;

    const target = [...occurrences].sort(
      (a, b) => b.sceneCount - a.sceneCount,
    )[0]!;

    for (const source of sparse) {
      if (source.dayId === target.dayId) continue;
      const movingStrip = source.stripsHere[0];
      if (!movingStrip) continue;
      out.push({
        id: `consolidate-${location}-${movingStrip.id}`,
        kind: "consolidate-location",
        message: `Sposta SC ${movingStrip.sceneNumber} al giorno ${padDay(target.dayNumber)} per consolidare la location ${location.toLowerCase()}.`,
        applyLabel: `Sposta SC ${movingStrip.sceneNumber} a giorno ${padDay(target.dayNumber)}`,
        payload: {
          stripId: movingStrip.id,
          sourceDayId: source.dayId,
          targetDayId: target.dayId,
        },
      });
    }
  }
  return out;
};

const heavyDaySuggestions = (
  schedule: SuggestionScheduleInput,
): Suggestion[] => {
  const out: Suggestion[] = [];
  for (const day of schedule.shootingDays) {
    const total = dayHours(day);
    if (total <= HEAVY_DAY_THRESHOLD_HOURS) continue;
    if (day.strips.length === 0) continue;

    const candidate = [...day.strips].sort(
      (a, b) => (b.resolvedHours ?? 0) - (a.resolvedHours ?? 0),
    )[0]!;

    const lightest = [...schedule.shootingDays]
      .filter((d) => d.id !== day.id)
      .sort((a, b) => dayHours(a) - dayHours(b))[0];

    const hoursLabel = `${Math.round(total)}h`;
    const targetLabel = lightest
      ? ` al giorno ${padDay(lightest.dayNumber)}`
      : "";
    out.push({
      id: `heavy-day-${day.id}`,
      kind: "heavy-day",
      message: `Giornata ${padDay(day.dayNumber)} sovraccarica (${hoursLabel}): considera spostare SC ${candidate.sceneNumber}${targetLabel}.`,
      applyLabel: lightest
        ? `Sposta SC ${candidate.sceneNumber} a giorno ${padDay(lightest.dayNumber)}`
        : `Rivedi giorno ${padDay(day.dayNumber)}`,
      payload: {
        stripId: candidate.id,
        sourceDayId: day.id,
        targetDayId: lightest?.id,
      },
    });
  }
  return out;
};

const emptyDayRedistributeSuggestions = (
  schedule: SuggestionScheduleInput,
): Suggestion[] => {
  const days = schedule.shootingDays;
  const out: Suggestion[] = [];

  for (let i = 0; i < days.length; i++) {
    const day = days[i]!;
    if (day.strips.length > 0) continue;

    const prev = i > 0 ? days[i - 1] : undefined;
    const next = i < days.length - 1 ? days[i + 1] : undefined;
    const neighbour = [prev, next]
      .filter((d): d is SuggestionDayInput => d != null)
      .find((d) => d.strips.length > EMPTY_DAY_NEIGHBOR_THRESHOLD);
    if (!neighbour) continue;

    const candidate = [...neighbour.strips].sort(
      (a, b) => (b.resolvedHours ?? 0) - (a.resolvedHours ?? 0),
    )[0]!;

    out.push({
      id: `empty-day-${day.id}`,
      kind: "empty-day-redistribute",
      message: `Giornata ${padDay(day.dayNumber)} vuota tra giornate piene: sposta SC ${candidate.sceneNumber} dal giorno ${padDay(neighbour.dayNumber)} per ribilanciare.`,
      applyLabel: `Sposta SC ${candidate.sceneNumber} a giorno ${padDay(day.dayNumber)}`,
      payload: {
        stripId: candidate.id,
        sourceDayId: neighbour.id,
        targetDayId: day.id,
      },
    });
  }
  return out;
};

const magicHourSuggestions = (
  schedule: SuggestionScheduleInput,
): Suggestion[] => {
  const out: Suggestion[] = [];
  for (const day of schedule.shootingDays) {
    for (const strip of day.strips) {
      if (!matchesMagicHour(strip)) continue;
      out.push({
        id: `magic-hour-${strip.id}`,
        kind: "magic-hour",
        message: `SC ${strip.sceneNumber} è annotata magic hour: la finestra ottimale è 20:30 → 21:10, pianifica la giornata ${padDay(day.dayNumber)} a partire dalle 18:30.`,
        applyLabel: "Pianifica magic hour",
        payload: {
          stripId: strip.id,
          sourceDayId: day.id,
          hint: "magic-hour",
        },
      });
    }
  }
  return out;
};

export const analyzeSchedule = (
  schedule: SuggestionScheduleInput,
): Suggestion[] => [
  ...consolidateLocationSuggestions(schedule),
  ...heavyDaySuggestions(schedule),
  ...emptyDayRedistributeSuggestions(schedule),
  ...magicHourSuggestions(schedule),
];
