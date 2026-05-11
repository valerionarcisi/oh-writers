import type { BreakdownCategory } from "../breakdown/categories.js";
import type {
  ProjectBreakdownInput,
  GeneratedLine,
} from "./budget-generator.types.js";
import {
  DEFAULT_RATES,
  CATEGORY_RATE_MAP,
  type RateKey,
} from "./default-rates.js";
import type { TopSheet, CostType } from "./schemas.js";

// ─── Shooting days ────────────────────────────────────────────────────────────

export const estimateShootingDays = (
  sceneCount: number,
  format: string,
): number => {
  const ratio = format === "short" ? 0.5 : 0.8;
  return Math.max(1, Math.round(sceneCount * ratio));
};

// ─── Rate resolution ──────────────────────────────────────────────────────────

const resolveRate = (
  key: RateKey,
  overrides: Partial<Record<RateKey, number>>,
): number => overrides[key] ?? DEFAULT_RATES[key];

const castRateKey = (castTier: string | null): RateKey => {
  if (castTier === "supporting") return "cast_supporting_day";
  if (castTier === "day_player") return "cast_supporting_day";
  if (castTier === "featured_extra") return "extras_day";
  return "cast_principal_day";
};

const castRateMultiplier = (castTier: string | null): number => {
  if (castTier === "day_player") return 0.6;
  if (castTier === "featured_extra") return 1.5;
  return 1;
};

// ─── Quantity logic ───────────────────────────────────────────────────────────

const DAILY_CATEGORIES = new Set<BreakdownCategory>([
  "cast",
  "stunts",
  "vehicles",
  "makeup",
  "sound",
  "animals",
  "equipment",
  "locations",
]);

const UNIT_CATEGORIES = new Set<BreakdownCategory>(["props", "wardrobe"]);

const SCENE_CATEGORIES = new Set<BreakdownCategory>(["sfx", "vfx"]);

const FLAT_CATEGORIES = new Set<BreakdownCategory>(["set_dress"]);

// extras and atmosphere: per-person per-day
const PER_PERSON_DAY_CATEGORIES = new Set<BreakdownCategory>([
  "extras",
  "atmosphere",
]);

const costTypeFor = (cat: BreakdownCategory): CostType => {
  if (DAILY_CATEGORIES.has(cat)) return "daily";
  if (UNIT_CATEGORIES.has(cat)) return "unit";
  if (SCENE_CATEGORIES.has(cat)) return "unit";
  if (FLAT_CATEGORIES.has(cat)) return "flat";
  if (PER_PERSON_DAY_CATEGORIES.has(cat)) return "daily";
  return "daily";
};

const topSheetFor = (cat: BreakdownCategory): TopSheet => {
  if (cat === "cast" || cat === "stunts") return "above_the_line";
  return "production";
};

// ─── Generator ────────────────────────────────────────────────────────────────

export const generateBudgetLines = (
  input: ProjectBreakdownInput,
  rateOverrides: Partial<Record<RateKey, number>> = {},
): GeneratedLine[] => {
  const { rows, shootingDays } = input;
  const lines: GeneratedLine[] = [];
  let order = 0;

  for (const row of rows) {
    const cat = row.element.category as BreakdownCategory;
    const rateKey = CATEGORY_RATE_MAP[cat];
    if (!rateKey) continue;

    const costType = costTypeFor(cat);
    const topSheet = topSheetFor(cat);

    let rate: number;
    let quantity: number;

    if (cat === "cast") {
      const key = castRateKey(row.element.castTier);
      rate =
        resolveRate(key, rateOverrides) *
        castRateMultiplier(row.element.castTier);
      quantity = shootingDays;
    } else if (PER_PERSON_DAY_CATEGORIES.has(cat)) {
      rate = resolveRate(rateKey, rateOverrides);
      quantity = row.totalQuantity * shootingDays;
    } else if (SCENE_CATEGORIES.has(cat)) {
      rate = resolveRate(rateKey, rateOverrides);
      quantity = row.scenesPresent.length;
    } else if (FLAT_CATEGORIES.has(cat)) {
      rate = resolveRate(rateKey, rateOverrides);
      quantity = 1;
    } else if (UNIT_CATEGORIES.has(cat)) {
      rate = resolveRate(rateKey, rateOverrides);
      quantity = row.totalQuantity;
    } else {
      // daily
      rate = resolveRate(rateKey, rateOverrides);
      quantity = shootingDays;
    }

    lines.push({
      topSheet,
      name: row.element.name,
      costType,
      quantity,
      rate,
      actual: null,
      notes: null,
      linkedElementId: row.element.id,
      linkedCategory: cat,
      sortOrder: order++,
    });
  }

  return lines;
};

// ─── Summary ──────────────────────────────────────────────────────────────────

export const lineEffectiveTotal = (line: {
  costType: CostType;
  quantity: number | null;
  rate: number | null;
  actual: number | null;
}): number => {
  if (line.actual !== null) return line.actual;
  if (line.costType === "percentage") return 0;
  if (line.costType === "flat") return line.rate ?? 0;
  if (line.quantity !== null && line.rate !== null)
    return line.quantity * line.rate;
  return 0;
};

export const computeBudgetSummary = (
  lines: Array<{
    topSheet: TopSheet;
    costType: CostType;
    quantity: number | null;
    rate: number | null;
    actual: number | null;
  }>,
  contingencyPercent: number,
) => {
  const sum = (sheet: TopSheet) =>
    lines
      .filter((l) => l.topSheet === sheet && l.costType !== "percentage")
      .reduce((s, l) => s + lineEffectiveTotal(l), 0);

  const aboveTheLine = sum("above_the_line");
  const production = sum("production");
  const crew = sum("crew");
  const postProduction = sum("post_production");
  const subtotal = aboveTheLine + production + crew + postProduction;
  const contingency = subtotal * (contingencyPercent / 100);

  return {
    aboveTheLine,
    production,
    crew,
    postProduction,
    subtotal,
    contingency,
    grandTotal: subtotal + contingency,
  };
};
