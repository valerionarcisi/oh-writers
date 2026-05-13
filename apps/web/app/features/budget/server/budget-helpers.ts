import type { GeneratedLine } from "@oh-writers/domain";

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
