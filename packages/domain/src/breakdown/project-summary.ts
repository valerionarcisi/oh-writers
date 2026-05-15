import type { BreakdownCategory } from "./categories.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ProjectBreakdownInputRow {
  readonly elementId: string;
  readonly name: string;
  readonly category: BreakdownCategory;
  readonly description: string | null;
  readonly castTier: string | null;
  readonly totalQuantity: number;
  readonly sceneNumbers: readonly number[];
  readonly status: "accepted" | "pending" | "stale";
  readonly source: "regex" | "cesare" | "manual" | null;
}

export interface SceneRange {
  readonly first: number;
  readonly last: number;
}

export interface ProjectBreakdownSummary {
  readonly totalElements: number;
  readonly acceptedCount: number;
  readonly pendingCount: number;
  readonly staleCount: number;
  readonly categoriesUsed: number;
  readonly sceneRange: SceneRange | null;
}

export interface DuplicateCandidate {
  readonly category: BreakdownCategory;
  readonly elementIds: readonly string[];
  readonly names: readonly string[];
  readonly reason: "case" | "plural" | "levenshtein";
  readonly score: number;
}

export interface CategoryGroup {
  readonly category: BreakdownCategory;
  readonly rows: readonly ProjectBreakdownInputRow[];
  readonly pendingCount: number;
  readonly staleCount: number;
  readonly hasIssues: boolean;
}

// ─── Pure helpers ────────────────────────────────────────────────────────────

export const computeSceneRange = (
  sceneNumbers: readonly number[],
): SceneRange | null => {
  if (sceneNumbers.length === 0) return null;
  let first = sceneNumbers[0]!;
  let last = sceneNumbers[0]!;
  for (const n of sceneNumbers) {
    if (n < first) first = n;
    if (n > last) last = n;
  }
  return { first, last };
};

export const summarizeProjectBreakdown = (
  rows: readonly ProjectBreakdownInputRow[],
): ProjectBreakdownSummary => {
  let accepted = 0;
  let pending = 0;
  let stale = 0;
  const cats = new Set<BreakdownCategory>();
  const allScenes: number[] = [];
  for (const r of rows) {
    cats.add(r.category);
    if (r.status === "accepted") accepted += 1;
    else if (r.status === "pending") pending += 1;
    else if (r.status === "stale") stale += 1;
    for (const n of r.sceneNumbers) allScenes.push(n);
  }
  return {
    totalElements: rows.length,
    acceptedCount: accepted,
    pendingCount: pending,
    staleCount: stale,
    categoriesUsed: cats.size,
    sceneRange: computeSceneRange(allScenes),
  };
};

export const groupByCategory = (
  rows: readonly ProjectBreakdownInputRow[],
): readonly CategoryGroup[] => {
  const map = new Map<BreakdownCategory, ProjectBreakdownInputRow[]>();
  for (const r of rows) {
    const list = map.get(r.category);
    if (list) list.push(r);
    else map.set(r.category, [r]);
  }
  const out: CategoryGroup[] = [];
  for (const [category, list] of map) {
    const sorted = [...list].sort((a, b) => a.name.localeCompare(b.name, "it"));
    let pendingCount = 0;
    let staleCount = 0;
    for (const r of sorted) {
      if (r.status === "pending") pendingCount += 1;
      if (r.status === "stale") staleCount += 1;
    }
    out.push({
      category,
      rows: sorted,
      pendingCount,
      staleCount,
      hasIssues: pendingCount > 0 || staleCount > 0,
    });
  }
  return out;
};

// ─── Duplicate detection ─────────────────────────────────────────────────────

const normalizeName = (s: string): string =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const stripItalianPlural = (s: string): string => {
  if (s.length < 4) return s;
  const last = s.slice(-1);
  if (last === "i" || last === "e") return s.slice(0, -1) + "o";
  return s;
};

const levenshtein = (a: string, b: string): number => {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const prev = new Array<number>(b.length + 1);
  const curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) prev[j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        (curr[j - 1] ?? 0) + 1,
        (prev[j] ?? 0) + 1,
        (prev[j - 1] ?? 0) + cost,
      );
    }
    for (let j = 0; j <= b.length; j += 1) prev[j] = curr[j]!;
  }
  return prev[b.length] ?? 0;
};

export const findDuplicateElements = (
  rows: readonly ProjectBreakdownInputRow[],
): readonly DuplicateCandidate[] => {
  const byCategory = new Map<BreakdownCategory, ProjectBreakdownInputRow[]>();
  for (const r of rows) {
    const list = byCategory.get(r.category);
    if (list) list.push(r);
    else byCategory.set(r.category, [r]);
  }
  const out: DuplicateCandidate[] = [];
  for (const [category, list] of byCategory) {
    const seen = new Set<string>();
    for (let i = 0; i < list.length; i += 1) {
      const a = list[i]!;
      if (seen.has(a.elementId)) continue;
      const cluster: ProjectBreakdownInputRow[] = [a];
      let reason: DuplicateCandidate["reason"] = "case";
      let score = 1;
      const normA = normalizeName(a.name);
      const stemA = stripItalianPlural(normA);
      for (let j = i + 1; j < list.length; j += 1) {
        const b = list[j]!;
        if (seen.has(b.elementId)) continue;
        const normB = normalizeName(b.name);
        const stemB = stripItalianPlural(normB);
        if (normA === normB) {
          cluster.push(b);
          if (reason !== "case") reason = "case";
        } else if (stemA === stemB) {
          cluster.push(b);
          reason = reason === "case" ? "plural" : reason;
        } else if (
          Math.abs(normA.length - normB.length) <= 2 &&
          levenshtein(normA, normB) <= 2 &&
          Math.min(normA.length, normB.length) >= 4
        ) {
          cluster.push(b);
          score = 0.7;
          reason = "levenshtein";
        }
      }
      if (cluster.length > 1) {
        for (const m of cluster) seen.add(m.elementId);
        out.push({
          category,
          elementIds: cluster.map((m) => m.elementId),
          names: cluster.map((m) => m.name),
          reason,
          score,
        });
      }
    }
  }
  return out;
};

// ─── CSV export ──────────────────────────────────────────────────────────────

const csvEscape = (v: string | number | null): string => {
  if (v === null) return "";
  const s = String(v);
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

export const toBreakdownCsv = (
  rows: readonly ProjectBreakdownInputRow[],
): string => {
  const header = [
    "id",
    "categoria",
    "nome",
    "descrizione",
    "tier",
    "quantita_totale",
    "scene",
    "prima_scena",
    "ultima_scena",
    "stato",
    "origine",
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    const range = computeSceneRange(r.sceneNumbers);
    lines.push(
      [
        csvEscape(r.elementId),
        csvEscape(r.category),
        csvEscape(r.name),
        csvEscape(r.description),
        csvEscape(r.castTier),
        csvEscape(r.totalQuantity),
        csvEscape(r.sceneNumbers.join(" ")),
        csvEscape(range?.first ?? null),
        csvEscape(range?.last ?? null),
        csvEscape(r.status),
        csvEscape(r.source),
      ].join(","),
    );
  }
  return lines.join("\n");
};
