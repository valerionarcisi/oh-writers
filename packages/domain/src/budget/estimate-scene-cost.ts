/**
 * Scene cost estimate — pure heuristics that give a per-scene daily cost
 * breakdown based on what the breakdown already knows about the scene
 * (cast count, props, SFX/VFX flags) and a small set of production rates.
 *
 * The function is deliberately framework-agnostic and has no DB or React
 * dependency, so it can be reused on the mobile companion or invoked from
 * a server function. Numbers are heuristic — they exist to inform a
 * line-producer-style conversation, not to lock a contract.
 */

// ─── Inputs ──────────────────────────────────────────────────────────────────

export interface SceneCostInput {
  sceneNumber: number;
  intExt: "INT" | "EXT" | "INT/EXT";
  /** Free-form, e.g. "NOTTE", "GIORNO", "ALBA". Null when unknown. */
  timeOfDay: string | null;
  /** Character names appearing in the scene. First 1-2 are treated as leads. */
  characters: ReadonlyArray<string>;
  /**
   * Breakdown elements grouped by category. Keys are
   * `BreakdownCategory` strings (cast, props, sfx, vfx, extras, ...);
   * values are the element names. We only look at counts and the presence
   * of specific categories — names are kept for future use.
   */
  elementsByCategory: Readonly<Record<string, ReadonlyArray<string>>>;
  /** Estimated shoot hours for the scene. Defaults to 8 (one shoot day). */
  estimatedShootHours: number;
  /** True when the scene shares its location with an adjacent scene. */
  isLocationReused?: boolean;
}

export interface ProductionRates {
  castLeadDay: number;
  castSupportingDay: number;
  crewDopDay: number;
  crewBaseDay: number;
  /** Cost of one catering meal per crew member. */
  catering: number;
  locationSetupExt: number;
  locationSetupInt: number;
  equipmentBaseDay: number;
  sfxBaseDay: number;
  vfxBasePerShot: number;
}

export const DEFAULT_PRODUCTION_RATES: ProductionRates = {
  castLeadDay: 800,
  castSupportingDay: 400,
  crewDopDay: 600,
  crewBaseDay: 200,
  catering: 20,
  locationSetupExt: 800,
  locationSetupInt: 300,
  equipmentBaseDay: 400,
  sfxBaseDay: 1500,
  vfxBasePerShot: 800,
};

// ─── Outputs ─────────────────────────────────────────────────────────────────

export interface SceneCostLine {
  category: string;
  description: string;
  amount: number;
}

export interface SceneCostBreakdown {
  total: number;
  lines: SceneCostLine[];
  difficulty: 1 | 2 | 3 | 4 | 5;
  notes: string[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const isNight = (timeOfDay: string | null): boolean => {
  if (!timeOfDay) return false;
  return /notte|night|tramonto|alba|sera/i.test(timeOfDay);
};

const countOf = (
  elementsByCategory: Readonly<Record<string, ReadonlyArray<string>>>,
  category: string,
): number => elementsByCategory[category]?.length ?? 0;

const round = (n: number): number => Math.round(n);

const clampDifficulty = (n: number): 1 | 2 | 3 | 4 | 5 => {
  if (n <= 1) return 1;
  if (n >= 5) return 5;
  return n as 1 | 2 | 3 | 4 | 5;
};

// ─── Core ────────────────────────────────────────────────────────────────────

const LEAD_COUNT_MAX = 2;
const CREW_BASE_HEADCOUNT = 8;
const CREW_BOOST_HEADCOUNT = 12;
const LARGE_CAST_THRESHOLD = 5;
const LARGE_EXTRAS_THRESHOLD = 15;
const SHOOT_HOURS_PER_DAY = 8;

export function estimateSceneCost(
  input: SceneCostInput,
  rates: ProductionRates,
): SceneCostBreakdown {
  const lines: SceneCostLine[] = [];
  const notes: string[] = [];

  // Scene day fraction: at most 1, scales linearly with shoot hours.
  const dayFraction = Math.min(
    1,
    Math.max(0.25, input.estimatedShootHours / SHOOT_HOURS_PER_DAY),
  );

  const sfxCount = countOf(input.elementsByCategory, "sfx");
  const vfxCount = countOf(input.elementsByCategory, "vfx");
  const stuntsCount = countOf(input.elementsByCategory, "stunts");
  const extrasCount = countOf(input.elementsByCategory, "extras");
  const hasHeavyTech = sfxCount > 0 || vfxCount > 0 || stuntsCount > 0;

  // ─── Cast ───────────────────────────────────────────────────────────────
  const characters = input.characters.filter((c) => c.trim().length > 0);
  const leadCount = Math.min(LEAD_COUNT_MAX, characters.length);
  const supportingCount = Math.max(0, characters.length - leadCount);

  if (leadCount > 0) {
    const amount = round(leadCount * rates.castLeadDay * dayFraction);
    lines.push({
      category: "cast",
      description: `Cast principale (${leadCount} attori × ${dayFraction.toFixed(2)}g)`,
      amount,
    });
  }
  if (supportingCount > 0) {
    const amount = round(supportingCount * rates.castSupportingDay * dayFraction);
    lines.push({
      category: "cast",
      description: `Cast secondario (${supportingCount} attori × ${dayFraction.toFixed(2)}g)`,
      amount,
    });
  }

  // ─── Crew ───────────────────────────────────────────────────────────────
  const crewHead = hasHeavyTech ? CREW_BOOST_HEADCOUNT : CREW_BASE_HEADCOUNT;
  const crewBaseAmount = round(
    (rates.crewDopDay + (crewHead - 1) * rates.crewBaseDay) * dayFraction,
  );
  lines.push({
    category: "crew",
    description: `Crew (${crewHead} persone × ${dayFraction.toFixed(2)}g)`,
    amount: crewBaseAmount,
  });

  // ─── Location ────────────────────────────────────────────────────────────
  if (input.isLocationReused) {
    lines.push({
      category: "locations",
      description: "Location (riuso da scena adiacente)",
      amount: 0,
    });
    notes.push("Girabile in continuità con scena adiacente.");
  } else {
    const isExt = input.intExt === "EXT" || input.intExt === "INT/EXT";
    const setupAmount = isExt ? rates.locationSetupExt : rates.locationSetupInt;
    lines.push({
      category: "locations",
      description: isExt ? "Location esterna (setup)" : "Location interna (setup)",
      amount: round(setupAmount * dayFraction),
    });
  }

  // ─── Equipment + props ──────────────────────────────────────────────────
  const equipmentBoost = hasHeavyTech ? 1.5 : 1;
  const equipmentAmount = round(
    rates.equipmentBaseDay * dayFraction * equipmentBoost,
  );
  lines.push({
    category: "equipment",
    description: "Attrezzatura + scenografia",
    amount: equipmentAmount,
  });

  // ─── SFX / VFX ──────────────────────────────────────────────────────────
  if (sfxCount > 0) {
    lines.push({
      category: "sfx",
      description: `Effetti speciali (${sfxCount})`,
      amount: round(rates.sfxBaseDay * dayFraction),
    });
  }
  if (vfxCount > 0) {
    lines.push({
      category: "vfx",
      description: `VFX (${vfxCount} shot)`,
      amount: round(rates.vfxBasePerShot * vfxCount),
    });
  }

  // ─── Catering ───────────────────────────────────────────────────────────
  const headcount = crewHead + leadCount + supportingCount + extrasCount;
  const cateringAmount = round(headcount * rates.catering);
  lines.push({
    category: "catering",
    description: `Catering (${headcount} pasti)`,
    amount: cateringAmount,
  });

  // ─── Difficulty ─────────────────────────────────────────────────────────
  let difficulty = 1;
  if (sfxCount > 0 || stuntsCount > 0) difficulty += 2;
  if (vfxCount > 0) difficulty += 1;
  if (isNight(input.timeOfDay) && (input.intExt === "EXT" || input.intExt === "INT/EXT")) {
    difficulty += 1;
    notes.push("Esterno notte: setup luci pesante, considera generatori.");
  }
  if (characters.length >= LARGE_CAST_THRESHOLD) {
    difficulty += 1;
    notes.push(`Cast numeroso (${characters.length}): rallenta i tempi di set.`);
  }
  if (extrasCount >= LARGE_EXTRAS_THRESHOLD) {
    difficulty += 1;
    notes.push(`Comparse (${extrasCount}): logistica catering e gestione massa.`);
  }
  if (!hasHeavyTech && characters.length <= 3 && input.intExt === "INT") {
    notes.push("Dialogo statico, no SFX, no esterni.");
  }

  const total = lines.reduce((sum, l) => sum + l.amount, 0);

  return {
    total,
    lines,
    difficulty: clampDifficulty(difficulty),
    notes,
  };
}
