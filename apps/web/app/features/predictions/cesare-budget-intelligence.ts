// Pure helpers for Cesare's budget-intelligence tools (Wave 3).
//
// Kept editor-agnostic so they can be unit-tested without a DB / LLM. The
// server-side Cesare tools at the bottom of `cesare-tools.ts` call into these
// after fetching the rows from Drizzle.

export interface IntelligenceLine {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  // Effective amount in euros (actual if present, else rate*quantity).
  readonly amountEuros: number;
}

export interface ExcessiveLineFlag {
  readonly lineId: string;
  readonly name: string;
  readonly category: string;
  readonly amount: number;
  readonly categoryMean: number;
  readonly ratio: number;
}

// Flag lines whose effective cost is at least `thresholdRatio` times the mean
// of their own category. Default threshold = 1.5 (i.e. 150% of category mean).
// Categories with fewer than 2 lines are skipped — a single-line category has
// no meaningful "mean" to compare against.
export const findExcessiveLines = (
  lines: ReadonlyArray<IntelligenceLine>,
  thresholdRatio = 1.5,
): ExcessiveLineFlag[] => {
  if (lines.length === 0) return [];

  const byCategory = new Map<string, IntelligenceLine[]>();
  for (const line of lines) {
    const arr = byCategory.get(line.category) ?? [];
    arr.push(line);
    byCategory.set(line.category, arr);
  }

  const flags: ExcessiveLineFlag[] = [];
  for (const [category, group] of byCategory) {
    if (group.length < 2) continue;
    const sum = group.reduce((acc, l) => acc + l.amountEuros, 0);
    const mean = sum / group.length;
    if (mean <= 0) continue;
    for (const line of group) {
      const ratio = line.amountEuros / mean;
      if (ratio >= thresholdRatio) {
        flags.push({
          lineId: line.id,
          name: line.name,
          category,
          amount: line.amountEuros,
          categoryMean: mean,
          ratio,
        });
      }
    }
  }
  return flags.sort((a, b) => b.ratio - a.ratio);
};

// ─── Cap evaluation ─────────────────────────────────────────────────────────

export interface CapInput {
  readonly topSheet: string | null;
  readonly amountCents: number;
}

export interface SpendByTopSheetInput {
  readonly topSheet: string;
  readonly usedCents: number;
}

export interface TopSheetEvaluation {
  readonly topSheet: string;
  readonly capCents: number;
  readonly usedCents: number;
  readonly residualCents: number;
}

export interface CapEvaluation {
  readonly globalCapCents: number | null;
  readonly globalUsedCents: number;
  readonly globalResidualCents: number | null;
  readonly byTopSheet: ReadonlyArray<TopSheetEvaluation>;
  readonly overspendingTopSheets: ReadonlyArray<string>;
  readonly isOverGlobal: boolean;
}

export const evaluateAgainstCap = (
  caps: ReadonlyArray<CapInput>,
  spendByTopSheet: ReadonlyArray<SpendByTopSheetInput>,
): CapEvaluation => {
  const globalCap = caps.find((c) => c.topSheet === null);
  const perTopSheetCaps = caps.filter((c) => c.topSheet !== null);

  const globalUsed = spendByTopSheet.reduce((acc, s) => acc + s.usedCents, 0);
  const globalResidual =
    globalCap !== undefined ? globalCap.amountCents - globalUsed : null;

  const usedByTs = new Map<string, number>();
  for (const entry of spendByTopSheet)
    usedByTs.set(entry.topSheet, entry.usedCents);

  const byTopSheet: TopSheetEvaluation[] = perTopSheetCaps.map((cap) => {
    const used = usedByTs.get(cap.topSheet!) ?? 0;
    return {
      topSheet: cap.topSheet!,
      capCents: cap.amountCents,
      usedCents: used,
      residualCents: cap.amountCents - used,
    };
  });

  const overspendingTopSheets = byTopSheet
    .filter((t) => t.residualCents < 0)
    .map((t) => t.topSheet);

  return {
    globalCapCents: globalCap !== undefined ? globalCap.amountCents : null,
    globalUsedCents: globalUsed,
    globalResidualCents: globalResidual,
    byTopSheet,
    overspendingTopSheets,
    isOverGlobal: globalResidual !== null && globalResidual < 0,
  };
};

// ─── Missing-lines proposal helper ──────────────────────────────────────────
//
// Given the set of breakdown categories that appear in the requested scenes
// and the list of categories that already have at least one budget line,
// return the categories with no coverage yet. Each gets a default name and
// a conservative estimate so the user can still see actionable suggestions.

export interface MissingLineProposal {
  readonly category: string;
  readonly suggestedName: string;
  readonly estimatedAmount: number;
  readonly rationale: string;
}

const SUGGESTED_NAME_BY_CATEGORY: Record<string, string> = {
  cast: "Cast aggiuntivo",
  props: "Oggetti di scena",
  set_dress: "Scenografia",
  wardrobe: "Costumi",
  makeup: "Trucco",
  equipment: "Attrezzatura fotografia",
  sound: "Suono in presa diretta",
  vfx: "VFX",
  sfx: "SFX",
  stunts: "Coordinamento stunt",
  extras: "Comparse",
  vehicles: "Veicoli scena",
  locations: "Affitto location",
  animals: "Wrangling animali",
};

const DEFAULT_ESTIMATE_BY_CATEGORY: Record<string, number> = {
  cast: 800,
  props: 250,
  set_dress: 400,
  wardrobe: 350,
  makeup: 200,
  equipment: 600,
  sound: 300,
  vfx: 1500,
  sfx: 500,
  stunts: 1200,
  extras: 400,
  vehicles: 500,
  locations: 1000,
  animals: 600,
};

export const proposeMissingLines = (
  categoriesInScenes: ReadonlyArray<string>,
  coveredCategories: ReadonlyArray<string>,
): MissingLineProposal[] => {
  const covered = new Set(coveredCategories);
  const seen = new Set<string>();
  const proposals: MissingLineProposal[] = [];
  for (const cat of categoriesInScenes) {
    if (covered.has(cat)) continue;
    if (seen.has(cat)) continue;
    seen.add(cat);
    proposals.push({
      category: cat,
      suggestedName: SUGGESTED_NAME_BY_CATEGORY[cat] ?? cat,
      estimatedAmount: DEFAULT_ESTIMATE_BY_CATEGORY[cat] ?? 300,
      rationale: `La categoria "${cat}" appare nelle scene richieste ma non ha voci di budget.`,
    });
  }
  return proposals;
};
