/**
 * Pure heuristic estimator for shooting-day difficulty + success probability.
 *
 * Side-effect free, runtime-agnostic. No DB, no React, no neverthrow. Both the
 * web app and the future mobile companion consume the same function.
 *
 * The output drives the badge above each strip-board day:
 *   GIORNATA 3 — 15 lug 2026
 *   Difficoltà: ●●●○○ (3/5)
 *   Riuscita: 72% → 48%   (weather penalty)
 *   ⚠ 3 cambi location, esterno notturno con pioggia 60%
 */

export type IntExtKind = "INT" | "EXT" | "INT/EXT";

export type WeatherConditions =
  | "clear"
  | "cloudy"
  | "rain"
  | "storm"
  | "snow"
  | "unknown";

export interface DayInputStrip {
  readonly sceneNumber: number;
  readonly intExt: IntExtKind;
  readonly timeOfDay: string | null;
  readonly castCount: number;
  readonly hasVfx: boolean;
  readonly hasSfx: boolean;
  readonly locationName: string;
}

export interface DayInput {
  readonly strips: ReadonlyArray<DayInputStrip>;
  readonly estimatedHours: number;
}

export interface WeatherFactor {
  readonly rainProbability: number; // 0..100
  readonly windKmh: number;
  readonly tempMin: number; // celsius
  readonly tempMax: number; // celsius
  readonly conditions: WeatherConditions;
}

export type DifficultyLevel = 1 | 2 | 3 | 4 | 5;

export interface DayEstimate {
  readonly difficulty: DifficultyLevel;
  readonly successProbabilityClear: number; // 0..100, no weather impact
  readonly successProbabilityActual: number; // 0..100, with weather impact
  readonly riskFactors: ReadonlyArray<string>;
  readonly recommendations: ReadonlyArray<string>;
  readonly weatherImpactPct: number; // negative number when weather hurts
  readonly hasExterior: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const isNight = (timeOfDay: string | null): boolean => {
  if (!timeOfDay) return false;
  const t = timeOfDay.toUpperCase();
  return (
    t.includes("NOTTE") ||
    t.includes("NIGHT") ||
    t.includes("ALBA") ||
    t.includes("DAWN") ||
    t.includes("TRAMONTO") ||
    t.includes("DUSK")
  );
};

const isExterior = (intExt: IntExtKind): boolean =>
  intExt === "EXT" || intExt === "INT/EXT";

const normalizeLocation = (s: string): string => s.trim().toUpperCase();

const distinctLocations = (
  strips: ReadonlyArray<DayInputStrip>,
): ReadonlyArray<string> => {
  const set = new Set<string>();
  for (const s of strips) {
    const norm = normalizeLocation(s.locationName);
    if (norm.length > 0) set.add(norm);
  }
  return Array.from(set);
};

const clampDifficulty = (n: number): DifficultyLevel => {
  if (n <= 1) return 1;
  if (n >= 5) return 5;
  return Math.round(n) as DifficultyLevel;
};

const clampPct = (n: number): number => {
  if (n < 0) return 0;
  if (n > 100) return 100;
  return Math.round(n);
};

// ─── Difficulty computation ───────────────────────────────────────────────────

interface DifficultyBreakdown {
  readonly difficulty: DifficultyLevel;
  readonly nightCount: number;
  readonly exteriorCount: number;
  readonly hasSpecialEffects: boolean;
  readonly distinctLocationCount: number;
  readonly maxCastCount: number;
  readonly heavyDay: boolean;
}

const computeDifficulty = (day: DayInput): DifficultyBreakdown => {
  const { strips, estimatedHours } = day;
  if (strips.length === 0) {
    return {
      difficulty: 1,
      nightCount: 0,
      exteriorCount: 0,
      hasSpecialEffects: false,
      distinctLocationCount: 0,
      maxCastCount: 0,
      heavyDay: false,
    };
  }

  const exteriorCount = strips.filter((s) => isExterior(s.intExt)).length;
  const nightCount = strips.filter((s) => isNight(s.timeOfDay)).length;
  const hasSpecialEffects = strips.some((s) => s.hasVfx || s.hasSfx);
  const locations = distinctLocations(strips);
  const maxCastCount = strips.reduce(
    (max, s) => (s.castCount > max ? s.castCount : max),
    0,
  );
  const heavyDay = estimatedHours >= 11;

  // Base: 1 if all INT, else 2
  let score = exteriorCount === 0 ? 1 : 2;
  if (nightCount > 0) score += 1;
  if (hasSpecialEffects) score += 1;
  if (locations.length >= 3) score += 1;
  if (maxCastCount >= 6) score += 1;
  if (heavyDay) score += 1;

  return {
    difficulty: clampDifficulty(score),
    nightCount,
    exteriorCount,
    hasSpecialEffects,
    distinctLocationCount: locations.length,
    maxCastCount,
    heavyDay,
  };
};

// ─── Weather penalty ──────────────────────────────────────────────────────────

const weatherPenaltyForExterior = (weather: WeatherFactor): number => {
  if (weather.conditions === "storm") return 50;
  if (weather.conditions === "snow") return 40;
  if (weather.conditions === "rain") return 30;
  if (weather.rainProbability >= 70) return 35;
  if (weather.rainProbability >= 40) return 20;
  if (weather.windKmh >= 50) return 25;
  if (weather.tempMax >= 38 || weather.tempMin <= -2) return 15;
  return 0;
};

// ─── Risk factors ─────────────────────────────────────────────────────────────

const buildRiskFactors = (
  d: DifficultyBreakdown,
  day: DayInput,
  weather: WeatherFactor | null,
): ReadonlyArray<string> => {
  const out: string[] = [];

  if (d.distinctLocationCount >= 3) {
    out.push(`${d.distinctLocationCount} cambi location nello stesso giorno`);
  }
  if (d.nightCount > 0 && d.exteriorCount > 0) {
    out.push(`esterno notturno (${d.nightCount} scene)`);
  } else if (d.nightCount > 0) {
    out.push(`scene notturne (${d.nightCount})`);
  }
  if (d.hasSpecialEffects) {
    out.push("VFX/SFX presenti");
  }
  if (d.maxCastCount >= 6) {
    out.push(`scena con cast numeroso (${d.maxCastCount} attori)`);
  }
  if (d.heavyDay) {
    out.push(`giornata pesante (${day.estimatedHours.toFixed(1)}h previste)`);
  }
  if (weather && d.exteriorCount > 0) {
    if (weather.conditions === "storm") {
      out.push("temporale previsto sugli esterni");
    } else if (weather.conditions === "snow") {
      out.push("neve prevista sugli esterni");
    } else if (
      weather.conditions === "rain" ||
      weather.rainProbability >= 40
    ) {
      out.push(
        `esterni con probabilità pioggia ${Math.round(weather.rainProbability)}%`,
      );
    }
    if (weather.windKmh >= 50) {
      out.push(`vento forte previsto (${Math.round(weather.windKmh)} km/h)`);
    }
    if (weather.tempMax >= 38) {
      out.push(`caldo estremo (${Math.round(weather.tempMax)}°C max)`);
    }
    if (weather.tempMin <= -2) {
      out.push(`gelo (${Math.round(weather.tempMin)}°C min)`);
    }
  }
  return out;
};

// ─── Recommendations ──────────────────────────────────────────────────────────

const buildRecommendations = (
  d: DifficultyBreakdown,
  day: DayInput,
  weather: WeatherFactor | null,
): ReadonlyArray<string> => {
  const out: string[] = [];

  if (d.distinctLocationCount >= 3) {
    out.push(
      "Consolidare in massimo 2 location per giornata o spostare una scena altrove.",
    );
  }
  if (d.nightCount > 0 && d.exteriorCount > 0) {
    out.push(
      "Anticipare le scene esterne al pomeriggio per evitare di lavorare di notte all'aperto.",
    );
  }
  if (
    weather &&
    d.exteriorCount > 0 &&
    (weather.conditions === "rain" ||
      weather.conditions === "storm" ||
      weather.rainProbability >= 40)
  ) {
    out.push(
      "Preparare cover set interno o spostare gli esterni a una giornata con previsione migliore.",
    );
  }
  if (weather && d.exteriorCount > 0 && weather.windKmh >= 50) {
    out.push(
      "Verificare safety per gru/camera car: vento sopra 50 km/h previsto.",
    );
  }
  if (d.heavyDay) {
    out.push(
      `Considerare di spostare 1-2 scene su altra giornata (${day.estimatedHours.toFixed(1)}h è oltre la soglia 11h).`,
    );
  }
  if (d.hasSpecialEffects && d.exteriorCount === 0) {
    out.push("Prevedere prove SFX/VFX prima della prima ripresa.");
  }
  return out;
};

// ─── Public API ───────────────────────────────────────────────────────────────

export const estimateDayDifficulty = (
  day: DayInput,
  weather: WeatherFactor | null,
): DayEstimate => {
  const breakdown = computeDifficulty(day);
  const successClear = clampPct(95 - breakdown.difficulty * 8);

  const hasExterior = breakdown.exteriorCount > 0;
  const weatherPenalty =
    weather && hasExterior ? weatherPenaltyForExterior(weather) : 0;
  const successActual = clampPct(successClear - weatherPenalty);

  return {
    difficulty: breakdown.difficulty,
    successProbabilityClear: successClear,
    successProbabilityActual: successActual,
    riskFactors: buildRiskFactors(breakdown, day, weather),
    recommendations: buildRecommendations(breakdown, day, weather),
    weatherImpactPct: weatherPenalty === 0 ? 0 : -weatherPenalty,
    hasExterior,
  };
};
