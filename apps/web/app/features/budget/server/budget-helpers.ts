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

  for (const line of lines) {
    const cat = line.linkedCategory;
    if (!cat || cat === "cast") continue;

    if (PER_ELEMENT_CATEGORIES.has(cat)) {
      perElement.push(line);
      continue;
    }

    const key = AGGREGATE_CATEGORY_KEY[cat] ?? cat;
    const existing = byKey.get(key);
    if (existing) {
      existing.rate = (existing.rate ?? 0) + (line.rate ?? 0);
      existing.elementCount += 1;
    } else {
      byKey.set(key, {
        ...line,
        linkedElementId: null,
        linkedCategory: key,
        name: AGGREGATE_CATEGORY_LABELS[cat] ?? cat,
        quantity: 1,
        elementCount: 1,
      });
    }
  }

  // quantity = number of distinct elements collapsed into this line
  const aggregate = Array.from(byKey.values()).map((l) => ({
    ...l,
    quantity: l.elementCount,
  }));

  return { perElement, aggregate };
};
