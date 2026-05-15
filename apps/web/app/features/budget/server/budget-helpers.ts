import type { GeneratedLine } from "@oh-writers/domain";

// ─── Overview aggregation ────────────────────────────────────────────────────
//
// `getBudgetOverview` aggregates a budget into the executive view shape:
// total spend, per-category totals, deltas, sparkline data per category.
// Kept as a pure transformer so it can be unit-tested without a DB and
// reused by the mobile companion when it lands.

export const BUDGET_CATEGORY_KEYS = [
  "cast",
  "crew",
  "locations",
  "scenografia",
  "costumi",
  "fotografia",
  "suono",
  "vfx",
  "comparse",
  "vehicles",
] as const;

export type BudgetCategoryKey = (typeof BUDGET_CATEGORY_KEYS)[number];

export const CATEGORY_LABELS: Record<BudgetCategoryKey, string> = {
  cast: "Cast",
  crew: "Troupe",
  locations: "Locations",
  scenografia: "Scenografia",
  costumi: "Costumi",
  fotografia: "Fotografia",
  suono: "Suono",
  vfx: "VFX",
  comparse: "Comparse",
  vehicles: "Veicoli",
};

export const CATEGORY_COLOR_VARS: Record<BudgetCategoryKey, string> = {
  cast: "--ds-cat-cast",
  crew: "--ds-cat-crew",
  locations: "--ds-cat-locations",
  scenografia: "--ds-cat-scenografia",
  costumi: "--ds-cat-costumi",
  fotografia: "--ds-cat-fotografia",
  suono: "--ds-cat-suono",
  vfx: "--ds-cat-vfx",
  comparse: "--ds-cat-comparse",
  vehicles: "--ds-cat-vehicles",
};

const LINKED_CATEGORY_TO_KEY: Record<string, BudgetCategoryKey> = {
  locations: "locations",
  props: "scenografia",
  set_dress: "scenografia",
  wardrobe: "costumi",
  makeup: "costumi",
  equipment: "fotografia",
  sound: "suono",
  vfx: "vfx",
  sfx: "vfx",
  extras: "comparse",
  atmosphere: "comparse",
  vehicles: "vehicles",
};

export type OverviewCategoryStatus = "ok" | "warn" | "missing" | "locked";

export interface OverviewCategory {
  readonly id: BudgetCategoryKey;
  readonly label: string;
  readonly colorVar: string;
  readonly total: number;
  readonly percent: number;
  readonly resourceCount: number;
  readonly status: OverviewCategoryStatus;
  readonly statusReason: string | null;
  readonly sparkline: ReadonlyArray<number>;
}

export interface OverviewLineInput {
  readonly topSheet: string | null;
  readonly linkedCategory: string | null;
  readonly rate: number | null;
  readonly quantity: number | null;
  readonly actual: number | null;
}

export interface OverviewResourceTotals {
  readonly castTotal: number;
  readonly castCount: number;
  readonly castMissingRates: number;
  readonly crewTotal: number;
  readonly crewEnabledCount: number;
}

export interface BudgetOverviewInput {
  readonly lines: ReadonlyArray<OverviewLineInput>;
  readonly resources: OverviewResourceTotals;
  readonly contingencyPercent: number;
  readonly shootingDays: number | null;
  readonly sceneCount: number;
  readonly status: "draft" | "estimated" | "locked";
  readonly previousTotal: number | null;
}

export interface BudgetOverview {
  readonly grandTotal: number;
  readonly contingencyAmount: number;
  readonly castTotal: number;
  readonly crewTotal: number;
  readonly productionTotal: number;
  readonly previousTotal: number | null;
  readonly deltaPercent: number | null;
  readonly shootingDays: number | null;
  readonly sceneCount: number;
  readonly perDay: number | null;
  readonly perScene: number | null;
  readonly status: "draft" | "estimated" | "locked";
  readonly categories: ReadonlyArray<OverviewCategory>;
  readonly lockedCategoryCount: number;
  readonly missingRatesCount: number;
}

const lineEffective = (l: OverviewLineInput): number => {
  if (l.actual !== null) return l.actual;
  const rate = l.rate ?? 0;
  const qty = l.quantity ?? 1;
  return rate * qty;
};

export const computeBudgetOverview = (
  input: BudgetOverviewInput,
): BudgetOverview => {
  const productionLines = input.lines.filter(
    (l) => l.topSheet === "production",
  );

  const totalsByCategory = new Map<BudgetCategoryKey, number>();
  for (const line of productionLines) {
    if (!line.linkedCategory) continue;
    const key = LINKED_CATEGORY_TO_KEY[line.linkedCategory];
    if (!key) continue;
    totalsByCategory.set(
      key,
      (totalsByCategory.get(key) ?? 0) + lineEffective(line),
    );
  }
  totalsByCategory.set("cast", input.resources.castTotal);
  totalsByCategory.set("crew", input.resources.crewTotal);

  const productionTotal = Array.from(totalsByCategory.entries())
    .filter(([k]) => k !== "cast" && k !== "crew")
    .reduce((sum, [, v]) => sum + v, 0);

  const subtotal =
    input.resources.castTotal + input.resources.crewTotal + productionTotal;
  const contingencyAmount = subtotal * (input.contingencyPercent / 100);
  const grandTotal = subtotal + contingencyAmount;

  const deltaPercent =
    input.previousTotal !== null && input.previousTotal > 0
      ? ((grandTotal - input.previousTotal) / input.previousTotal) * 100
      : null;

  const buildSparkline = (key: BudgetCategoryKey, total: number) => {
    // TODO(spec-overview): replace with real historic snapshots once
    // `getPreviousBudgetSnapshot` lands. For now generate a deterministic
    // ramp so the UI is not empty on day-zero — same total in last bucket.
    if (total <= 0) return [0, 0, 0, 0, 0, 0];
    return [0.3, 0.45, 0.55, 0.7, 0.85, 1].map((r) => total * r);
  };

  const categories: OverviewCategory[] = [];
  for (const key of BUDGET_CATEGORY_KEYS) {
    const total = totalsByCategory.get(key) ?? 0;
    const isCore = key === "cast" || key === "crew";
    if (!isCore && total <= 0) continue;
    const percent = grandTotal > 0 ? (total / grandTotal) * 100 : 0;

    let resourceCount = 0;
    if (key === "cast") resourceCount = input.resources.castCount;
    else if (key === "crew") resourceCount = input.resources.crewEnabledCount;
    else
      resourceCount = productionLines.filter(
        (l) =>
          l.linkedCategory && LINKED_CATEGORY_TO_KEY[l.linkedCategory] === key,
      ).length;

    let status: OverviewCategoryStatus = "ok";
    let statusReason: string | null = null;
    if (input.status === "locked") status = "locked";
    else if (key === "cast" && input.resources.castMissingRates > 0) {
      status = "warn";
      statusReason = `${input.resources.castMissingRates} rate mancanti`;
    } else if (total <= 0) {
      status = "missing";
      statusReason = "Senza tariffa";
    }

    categories.push({
      id: key,
      label: CATEGORY_LABELS[key],
      colorVar: CATEGORY_COLOR_VARS[key],
      total,
      percent,
      resourceCount,
      status,
      statusReason,
      sparkline: buildSparkline(key, total),
    });
  }

  categories.sort((a, b) => b.total - a.total);

  const perDay =
    input.shootingDays && input.shootingDays > 0
      ? grandTotal / input.shootingDays
      : null;
  const perScene = input.sceneCount > 0 ? grandTotal / input.sceneCount : null;

  return {
    grandTotal,
    contingencyAmount,
    castTotal: input.resources.castTotal,
    crewTotal: input.resources.crewTotal,
    productionTotal,
    previousTotal: input.previousTotal,
    deltaPercent,
    shootingDays: input.shootingDays,
    sceneCount: input.sceneCount,
    perDay,
    perScene,
    status: input.status,
    categories,
    lockedCategoryCount: input.status === "locked" ? categories.length : 0,
    missingRatesCount: input.resources.castMissingRates,
  };
};


export const PER_ELEMENT_CATEGORIES = new Set(["locations", "vehicles"]);

const AGGREGATE_CATEGORY_LABELS: Record<string, string> = {
  equipment: "Fotografia",
  sound: "Suono",
  props: "Scenografia",
  set_dress: "Scenografia",
  wardrobe: "Costumi & Make-up",
  makeup: "Costumi & Make-up",
  vfx: "VFX / SFX",
  sfx: "VFX / SFX",
  stunts: "Stunt",
  extras: "Comparse",
  atmosphere: "Comparse",
  animals: "Animali",
};

// Canonical key used to collapse related sub-categories into one aggregate line
const AGGREGATE_CATEGORY_KEY: Record<string, string> = {
  equipment: "equipment",
  sound: "sound",
  props: "props",
  set_dress: "props",
  wardrobe: "wardrobe",
  makeup: "wardrobe",
  vfx: "vfx",
  sfx: "vfx",
  stunts: "stunts",
  extras: "extras",
  atmosphere: "extras",
  animals: "animals",
};

export type AggregatedLine = Omit<GeneratedLine, "linkedElementId"> & {
  linkedElementId: null;
  elementCount: number;
};

export type SplitLines = {
  perElement: GeneratedLine[];
  aggregate: AggregatedLine[];
};

export const aggregateProductionLines = (
  lines: GeneratedLine[],
): SplitLines => {
  const perElement: GeneratedLine[] = [];
  const byKey = new Map<string, AggregatedLine>();
  const rateAccumulator = new Map<string, number>();
  const countAccumulator = new Map<string, number>();

  for (const line of lines) {
    const cat = line.linkedCategory;
    if (!cat || cat === "cast") continue;

    if (PER_ELEMENT_CATEGORIES.has(cat)) {
      perElement.push(line);
      continue;
    }

    const key = AGGREGATE_CATEGORY_KEY[cat] ?? cat;
    if (!byKey.has(key)) {
      byKey.set(key, {
        ...line,
        linkedElementId: null,
        linkedCategory: key,
        name: AGGREGATE_CATEGORY_LABELS[cat] ?? cat,
        quantity: 1,
        elementCount: 1,
      });
      rateAccumulator.set(key, line.rate ?? 0);
      countAccumulator.set(key, 1);
    } else {
      rateAccumulator.set(
        key,
        (rateAccumulator.get(key) ?? 0) + (line.rate ?? 0),
      );
      countAccumulator.set(key, (countAccumulator.get(key) ?? 0) + 1);
    }
  }

  // quantity = number of distinct elements collapsed into this line
  const aggregate = Array.from(byKey.values()).map((l) => ({
    ...l,
    rate: rateAccumulator.get(l.linkedCategory!) ?? l.rate,
    quantity: countAccumulator.get(l.linkedCategory!) ?? 1,
    elementCount: countAccumulator.get(l.linkedCategory!) ?? 1,
  }));

  return { perElement, aggregate };
};

export type DayCostBreakdown = {
  cast: number;
  crew: number;
  locations: number;
  vehicles: number;
  other: number;
  contingency: number;
};

export type DayCost = {
  dayId: string;
  dayNumber: number;
  date: string | null;
  sceneIds: string[];
  breakdown: DayCostBreakdown;
  total: number;
};

export type PerElementLineCost = {
  linkedCategory: string;
  sceneIds: string[];
  effectiveTotal: number;
};

export type DayCostInput = {
  days: {
    id: string;
    dayNumber: number;
    date: string | null;
    sceneIds: string[];
  }[];
  totalShootingDays: number;
  contingencyPercent: number;
  castCostsByScene: Record<string, number>;
  totalCrewCost: number;
  perElementLineCosts: PerElementLineCost[];
  otherLinesTotalCost: number;
};

export const computeDayCosts = (input: DayCostInput): DayCost[] => {
  const {
    days,
    totalShootingDays,
    contingencyPercent,
    castCostsByScene,
    totalCrewCost,
    perElementLineCosts,
    otherLinesTotalCost,
  } = input;

  const crewPerDay =
    totalShootingDays > 0 ? totalCrewCost / totalShootingDays : 0;
  const otherPerDay =
    totalShootingDays > 0 ? otherLinesTotalCost / totalShootingDays : 0;

  return days.map((day) => {
    const sceneSet = new Set(day.sceneIds);

    const cast = day.sceneIds.reduce(
      (sum, sid) => sum + (castCostsByScene[sid] ?? 0),
      0,
    );

    const locations = perElementLineCosts
      .filter(
        (l) =>
          l.linkedCategory === "locations" &&
          l.sceneIds.some((sid) => sceneSet.has(sid)),
      )
      .reduce((sum, l) => sum + l.effectiveTotal, 0);

    const vehicles = perElementLineCosts
      .filter(
        (l) =>
          l.linkedCategory === "vehicles" &&
          l.sceneIds.some((sid) => sceneSet.has(sid)),
      )
      .reduce((sum, l) => sum + l.effectiveTotal, 0);

    const subtotal = cast + crewPerDay + locations + vehicles + otherPerDay;
    const contingency = subtotal * (contingencyPercent / 100);

    return {
      dayId: day.id,
      dayNumber: day.dayNumber,
      date: day.date,
      sceneIds: day.sceneIds,
      breakdown: {
        cast,
        crew: crewPerDay,
        locations,
        vehicles,
        other: otherPerDay,
        contingency,
      },
      total: subtotal + contingency,
    };
  });
};
