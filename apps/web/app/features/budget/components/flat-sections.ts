import {
  resourceTotal,
  type FiscalRegime,
  type BudgetLine,
  type TranslationKey,
} from "@oh-writers/domain";
import type { BudgetCast, BudgetCrew } from "@oh-writers/db/schema";

export const SectionIds = {
  CAST: "cast",
  CREW: "crew",
  LOCATIONS: "locations",
  SCENOGRAFIA: "scenografia",
  COSTUMI: "costumi",
  FOTOGRAFIA: "fotografia",
  SUONO: "suono",
  VFX: "vfx",
  COMPARSE: "comparse",
  VEHICLES: "vehicles",
  POST: "post",
  CONTINGENCY: "contingency",
  OTHER: "other",
} as const;
export type SectionId = (typeof SectionIds)[keyof typeof SectionIds];

export const SECTION_LABEL_KEY: Record<SectionId, TranslationKey> = {
  cast: "budget.section.label.cast",
  crew: "budget.section.label.crew",
  locations: "budget.section.label.locations",
  scenografia: "budget.section.label.scenografia",
  costumi: "budget.section.label.costumi",
  fotografia: "budget.section.label.fotografia",
  suono: "budget.section.label.suono",
  vfx: "budget.section.label.vfx",
  comparse: "budget.section.label.comparse",
  vehicles: "budget.section.label.vehicles",
  post: "budget.section.label.post",
  contingency: "budget.section.label.contingency",
  other: "budget.section.label.other",
};

export const SECTION_TOKEN: Record<SectionId, string> = {
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
  post: "--ds-cat-post",
  contingency: "--ds-cat-contingency",
  other: "--ds-cat-other",
};

const LINKED_TO_SECTION: Record<string, SectionId> = {
  locations: SectionIds.LOCATIONS,
  props: SectionIds.SCENOGRAFIA,
  wardrobe: SectionIds.COSTUMI,
  equipment: SectionIds.FOTOGRAFIA,
  sound: SectionIds.SUONO,
  vfx: SectionIds.VFX,
  extras: SectionIds.COMPARSE,
  vehicles: SectionIds.VEHICLES,
};

const num = (v: string | number | null | undefined): number => {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

export type CastFlatRow = {
  readonly kind: "cast";
  readonly id: string;
  readonly name: string;
  readonly quantity: number;
  readonly rate: number;
  readonly total: number;
  readonly raw: BudgetCast;
};

export type CrewFlatRow = {
  readonly kind: "crew";
  readonly id: string;
  readonly name: string;
  readonly department: string;
  readonly quantity: number;
  readonly rate: number;
  readonly total: number;
  readonly enabled: boolean;
  readonly raw: BudgetCrew;
};

export type LineFlatRow = {
  readonly kind: "line";
  readonly id: string;
  readonly name: string;
  readonly quantity: number;
  readonly rate: number;
  readonly actual: number | null;
  readonly total: number;
  readonly raw: BudgetLine;
};

export type FlatRow = CastFlatRow | CrewFlatRow | LineFlatRow;

export type FlatSection = {
  readonly id: SectionId;
  readonly labelKey: TranslationKey;
  readonly tokenVar: string;
  readonly rows: ReadonlyArray<FlatRow>;
  readonly total: number;
};

const toCastRow = (c: BudgetCast): CastFlatRow => {
  const days = num(c.days);
  const dayRate = num(c.dayRate);
  const total = resourceTotal({
    days,
    dayRate,
    fiscalRegime: c.fiscalRegime as FiscalRegime,
    mealAllowance: num(c.mealAllowance),
    accommodation: num(c.accommodation),
  });
  return {
    kind: "cast",
    id: c.id,
    name: c.name,
    quantity: days,
    rate: dayRate,
    total,
    raw: c,
  };
};

const toCrewRow = (c: BudgetCrew): CrewFlatRow => {
  const days = num(c.days);
  const dayRate = num(c.dayRate);
  const total = c.enabled
    ? resourceTotal({
        days,
        dayRate,
        fiscalRegime: c.fiscalRegime as FiscalRegime,
        mealAllowance: num(c.mealAllowance),
        accommodation: num(c.accommodation),
      })
    : 0;
  return {
    kind: "crew",
    id: c.id,
    name: c.name,
    department: c.department,
    quantity: days,
    rate: dayRate,
    total,
    enabled: c.enabled,
    raw: c,
  };
};

const toLineRow = (l: BudgetLine): LineFlatRow => {
  const qty = num(l.quantity) || 1;
  const rate = num(l.rate);
  const actual = l.actual === null || l.actual === undefined ? null : num(l.actual);
  const total = actual !== null ? actual : rate * qty;
  return {
    kind: "line",
    id: l.id,
    name: l.name,
    quantity: qty,
    rate,
    actual,
    total,
    raw: l as BudgetLine,
  };
};

const lineSection = (l: BudgetLine): SectionId => {
  if (l.topSheet === "post_production") return SectionIds.POST;
  if (l.topSheet === "contingency") return SectionIds.CONTINGENCY;
  if (l.topSheet === "production") {
    const mapped = l.linkedCategory ? LINKED_TO_SECTION[l.linkedCategory] : undefined;
    return mapped ?? SectionIds.OTHER;
  }
  return SectionIds.OTHER;
};

const sumRows = (rows: ReadonlyArray<FlatRow>): number =>
  rows.reduce((s, r) => s + r.total, 0);

// Order in which sections appear in the table.
const SECTION_ORDER: ReadonlyArray<SectionId> = [
  SectionIds.CAST,
  SectionIds.CREW,
  SectionIds.LOCATIONS,
  SectionIds.FOTOGRAFIA,
  SectionIds.SUONO,
  SectionIds.SCENOGRAFIA,
  SectionIds.COSTUMI,
  SectionIds.VEHICLES,
  SectionIds.COMPARSE,
  SectionIds.VFX,
  SectionIds.POST,
  SectionIds.CONTINGENCY,
  SectionIds.OTHER,
];

const ALWAYS_VISIBLE: ReadonlySet<SectionId> = new Set([
  SectionIds.CAST,
  SectionIds.CREW,
]);

export const buildFlatSections = (input: {
  readonly lines: ReadonlyArray<BudgetLine>;
  readonly cast: ReadonlyArray<BudgetCast>;
  readonly crew: ReadonlyArray<BudgetCrew>;
}): FlatSection[] => {
  const rowsBySection = new Map<SectionId, FlatRow[]>();
  for (const id of SECTION_ORDER) rowsBySection.set(id, []);

  rowsBySection.get(SectionIds.CAST)!.push(...input.cast.map(toCastRow));
  rowsBySection.get(SectionIds.CREW)!.push(...input.crew.map(toCrewRow));

  for (const line of input.lines) {
    const id = lineSection(line);
    const bucket = rowsBySection.get(id);
    if (!bucket) continue;
    bucket.push(toLineRow(line));
  }

  const result: FlatSection[] = [];
  for (const id of SECTION_ORDER) {
    const rows = rowsBySection.get(id) ?? [];
    if (rows.length === 0 && !ALWAYS_VISIBLE.has(id)) continue;
    result.push({
      id,
      labelKey: SECTION_LABEL_KEY[id],
      tokenVar: SECTION_TOKEN[id],
      rows,
      total: sumRows(rows),
    });
  }
  return result;
};

export const grandTotalOf = (sections: ReadonlyArray<FlatSection>): number =>
  sections.reduce((s, sec) => s + sec.total, 0);
