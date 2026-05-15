/**
 * AD analyze — pure heuristics that emulate a 1st AD reviewing a breakdown.
 *
 * The goal is NOT to suggest writing edits, but to surface production-side
 * concerns: continuity conflicts, feasibility risks, breakdown coverage gaps,
 * and location consolidation hints.
 *
 * All rules are heuristic; severity reflects how loudly a real AD would flag
 * the item, not statistical confidence. Inputs are deliberately minimal so
 * the function stays portable across runtimes (web / mobile companion).
 */

import type { BreakdownCategory } from "./categories.js";

// ─── Inputs ──────────────────────────────────────────────────────────────────

export interface AdAnalyzeScene {
  id: string;
  /** Display number (used in suggestion titles). */
  number: number;
  intExt: "INT" | "EXT" | "INT/EXT";
  /** Raw location label as written in the heading, e.g. "BAR ROMA". */
  location: string;
  /** Free-form time-of-day token, e.g. "NOTTE", "GIORNO", "ALBA", or null. */
  timeOfDay: string | null;
  /** Approximate page count of the scene (eighths counted as 0.125). */
  pageCount: number;
  /**
   * Story-day grouping. Two scenes that share the same `storyDay` are meant
   * to take place in the same diegetic day. Optional — leave null/undefined
   * if the parser hasn't resolved it.
   */
  storyDay?: number | null;
}

export interface AdAnalyzeOccurrence {
  elementId: string;
  elementName: string;
  category: BreakdownCategory;
  sceneId: string;
  quantity: number;
}

export interface AdAnalyzeInput {
  scenes: ReadonlyArray<AdAnalyzeScene>;
  occurrences: ReadonlyArray<AdAnalyzeOccurrence>;
  /**
   * Optional full screenplay text. When present, coverage-gap rules look for
   * production-sensitive keywords inside the text that aren't matched by any
   * breakdown element in the same scene.
   *
   * The text is treated as a single string; per-scene splitting is naive and
   * relies on a fountain-style scene-heading regex.
   */
  screenplayText?: string;
}

// ─── Outputs ─────────────────────────────────────────────────────────────────

export type AdSuggestionKind =
  | "continuity"
  | "risk-flag"
  | "coverage-gap"
  | "location-consolidate";

export type AdSuggestionSeverity = "info" | "warn" | "critical";

export interface AdSuggestion {
  id: string;
  kind: AdSuggestionKind;
  severity: AdSuggestionSeverity;
  /** Scene number this alert is anchored to, or null for project-wide. */
  sceneNumber: number | null;
  /** Stable id of the anchored scene, when available — drives "Apri scena". */
  sceneId: string | null;
  title: string;
  body: string;
  /**
   * Action label exposed to the UI as the primary CTA, e.g.
   * "Spogliare arma", "Consolida location". Null when no concrete action.
   */
  suggestedAction: string | null;
  /**
   * Optional category hint — when the suggested action would add or
   * recategorise an element, the UI uses this to pre-fill the picker.
   */
  category: BreakdownCategory | null;
}

// ─── Rule catalogue ──────────────────────────────────────────────────────────

/**
 * Production-sensitive keywords (lowercase Italian, no diacritics where
 * possible). Each entry tells the coverage-gap rule which category should
 * own the element if the AD adds it.
 *
 * The list is intentionally short — broad-net keyword matching is the job of
 * the LLM auto-spoglio, not of this lightweight checker. Here we only catch
 * items that carry significant production weight (cost, permits, safety).
 */
const RISK_KEYWORDS: ReadonlyArray<{
  rx: RegExp;
  label: string;
  category: BreakdownCategory;
  severity: AdSuggestionSeverity;
  body: string;
}> = [
  {
    rx: /\b(pistola|fucile|arma|armi|sparo|spar[ao]|colpo di pistola)\b/i,
    label: "arma da fuoco",
    category: "props",
    severity: "critical",
    body: "Scena con armi da fuoco: serve permesso, armiere certificato e safety officer in set.",
  },
  {
    rx: /\b(esplosione|esplode|bomba|detonazione)\b/i,
    label: "esplosione",
    category: "sfx",
    severity: "critical",
    body: "Scena con esplosione: SFX dedicato, permessi pirotecnici e piano di sicurezza obbligatori.",
  },
  {
    rx: /\b(fumo|nebbia artificiale|fumogeno)\b/i,
    label: "fumo / nebbia",
    category: "sfx",
    severity: "warn",
    body: "Effetto fumo richiede macchina del fumo, ventilazione e nota agli attori asmatici.",
  },
  {
    rx: /\b(sangue|sanguinante|ferita aperta|emorragia)\b/i,
    label: "sangue / ferita",
    category: "makeup",
    severity: "warn",
    body: "Effetto sangue: protesi e make-up SFX, materiali a rischio macchia per costumi e set.",
  },
  {
    rx: /\b(bambin[oa]|bambini|ragazzin[oa]|minorenne|neonato)\b/i,
    label: "minorenne",
    category: "cast",
    severity: "critical",
    body: "Scena con minorenni: orari ridotti (max 8h), tutore in set, autorizzazione del tribunale per i minori.",
  },
  {
    rx: /\b(cane|gatto|cavall[oi]|animale|cani|gatti)\b/i,
    label: "animale",
    category: "animals",
    severity: "warn",
    body: "Animale in scena: serve animal handler, assicurazione dedicata e tempi di set rallentati.",
  },
  {
    rx: /\b(inseguimento|incidente|sbanda|cappott[ao]|investe|investito)\b/i,
    label: "stunt veicolare",
    category: "stunts",
    severity: "critical",
    body: "Stunt con veicolo: stunt coordinator, picture car coordinator e chiusura strada.",
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

const normalizeLocation = (raw: string): string =>
  raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const isNight = (timeOfDay: string | null): boolean => {
  if (!timeOfDay) return false;
  return /notte|night|sera|tramonto|alba/i.test(timeOfDay);
};

const sceneTextFor = (
  scene: AdAnalyzeScene,
  fullText: string | undefined,
): string => {
  if (!fullText) return "";
  // Naive split: every scene heading line begins a new scene. We rely on
  // INT./EXT. detection. If parsing fails, we return the whole text — false
  // positives on coverage gaps are preferable to silent misses.
  const escapedLoc = scene.location.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const headingRe = new RegExp(
    `(?:^|\\n)\\s*(?:${scene.intExt})\\.?\\s+${escapedLoc}[^\\n]*\\n`,
    "i",
  );
  const m = headingRe.exec(fullText);
  if (!m) return fullText;
  const start = m.index + m[0].length;
  // Next heading delimits the slice.
  const tail = fullText.slice(start);
  const nextHeading = /\n\s*(?:INT|EST|EXT|INT\/EXT)\.?\s+/i.exec(tail);
  return nextHeading ? tail.slice(0, nextHeading.index) : tail;
};

const groupBy = <T, K>(arr: ReadonlyArray<T>, key: (t: T) => K): Map<K, T[]> => {
  const map = new Map<K, T[]>();
  for (const item of arr) {
    const k = key(item);
    const list = map.get(k) ?? [];
    list.push(item);
    map.set(k, list);
  }
  return map;
};

// ─── Rule: continuity — same character, same story day, different location ───

const rule_sameDayLocationJump = (input: AdAnalyzeInput): AdSuggestion[] => {
  const out: AdSuggestion[] = [];
  const sceneById = new Map(input.scenes.map((s) => [s.id, s]));
  const castByElement = groupBy(
    input.occurrences.filter((o) => o.category === "cast"),
    (o) => o.elementId,
  );

  for (const [elementId, occs] of castByElement) {
    // Map sceneId → storyDay; group occurrences by storyDay.
    const byDay = new Map<number, { scene: AdAnalyzeScene; occ: AdAnalyzeOccurrence }[]>();
    for (const occ of occs) {
      const scene = sceneById.get(occ.sceneId);
      if (!scene || scene.storyDay == null) continue;
      const list = byDay.get(scene.storyDay) ?? [];
      list.push({ scene, occ });
      byDay.set(scene.storyDay, list);
    }
    for (const [day, items] of byDay) {
      if (items.length < 2) continue;
      const distinctLocations = new Set(
        items.map((i) => normalizeLocation(i.scene.location)),
      );
      if (distinctLocations.size < 2) continue;
      const charName = items[0]?.occ.elementName ?? "Personaggio";
      const sceneNumbers = items
        .map((i) => i.scene.number)
        .sort((a, b) => a - b);
      out.push({
        id: `continuity-day-jump-${elementId}-${day}`,
        kind: "continuity",
        severity: "warn",
        sceneNumber: sceneNumbers[0] ?? null,
        sceneId: items[0]?.scene.id ?? null,
        title: `${charName}: salto location in giornata diegetica ${day}`,
        body: `${charName} compare nelle scene ${sceneNumbers.join(", ")} marcate come stesso story-day ma in location diverse (${[...distinctLocations].join(" / ")}). Verifica i tempi di trasferimento o consolida le location.`,
        suggestedAction: null,
        category: "cast",
      });
    }
  }
  return out;
};

// ─── Rule: continuity — character disappears for many consecutive scenes ─────

const rule_characterDisappearance = (input: AdAnalyzeInput): AdSuggestion[] => {
  const out: AdSuggestion[] = [];
  const orderedScenes = [...input.scenes].sort((a, b) => a.number - b.number);
  if (orderedScenes.length < 6) return out;
  const cast = groupBy(
    input.occurrences.filter((o) => o.category === "cast"),
    (o) => o.elementId,
  );
  for (const [elementId, occs] of cast) {
    if (occs.length < 2) continue;
    const sceneIdxs = occs
      .map((o) => orderedScenes.findIndex((s) => s.id === o.sceneId))
      .filter((i) => i >= 0)
      .sort((a, b) => a - b);
    if (sceneIdxs.length < 2) continue;
    let maxGap = 0;
    let gapStart = -1;
    let gapEnd = -1;
    for (let i = 1; i < sceneIdxs.length; i++) {
      const gap = sceneIdxs[i]! - sceneIdxs[i - 1]! - 1;
      if (gap > maxGap) {
        maxGap = gap;
        gapStart = sceneIdxs[i - 1]!;
        gapEnd = sceneIdxs[i]!;
      }
    }
    if (maxGap < 15) continue;
    const charName = occs[0]?.elementName ?? "Personaggio";
    const fromScene = orderedScenes[gapStart];
    const toScene = orderedScenes[gapEnd];
    out.push({
      id: `continuity-disappearance-${elementId}`,
      kind: "continuity",
      severity: "info",
      sceneNumber: toScene?.number ?? null,
      sceneId: toScene?.id ?? null,
      title: `${charName} assente per ${maxGap} scene consecutive`,
      body: `${charName} appare in scena ${fromScene?.number} e poi torna solo in scena ${toScene?.number}. Verifica se è un'omissione di sceneggiatura o se è voluto.`,
      suggestedAction: null,
      category: "cast",
    });
  }
  return out;
};

// ─── Rule: risk flag — large extras count ────────────────────────────────────

const rule_largeExtras = (input: AdAnalyzeInput): AdSuggestion[] => {
  const out: AdSuggestion[] = [];
  const extrasByScene = new Map<string, number>();
  for (const o of input.occurrences) {
    if (o.category !== "extras") continue;
    extrasByScene.set(
      o.sceneId,
      (extrasByScene.get(o.sceneId) ?? 0) + o.quantity,
    );
  }
  for (const scene of input.scenes) {
    const count = extrasByScene.get(scene.id) ?? 0;
    if (count <= 20) continue;
    out.push({
      id: `risk-extras-${scene.id}`,
      kind: "risk-flag",
      severity: count > 50 ? "critical" : "warn",
      sceneNumber: scene.number,
      sceneId: scene.id,
      title: `Scena ${scene.number}: ${count} comparse`,
      body: `Logistica complessa: budget extras, permessi di assembramento, catering e gestione casting di massa.`,
      suggestedAction: null,
      category: "extras",
    });
  }
  return out;
};

// ─── Rule: risk flag — long exterior night ───────────────────────────────────

const rule_longExteriorNight = (input: AdAnalyzeInput): AdSuggestion[] => {
  const out: AdSuggestion[] = [];
  for (const scene of input.scenes) {
    const isExterior = scene.intExt === "EXT" || scene.intExt === "INT/EXT";
    if (!isExterior) continue;
    if (!isNight(scene.timeOfDay)) continue;
    if (scene.pageCount < 5) continue;
    out.push({
      id: `risk-night-ext-${scene.id}`,
      kind: "risk-flag",
      severity: "warn",
      sceneNumber: scene.number,
      sceneId: scene.id,
      title: `Scena ${scene.number}: ${scene.pageCount.toFixed(1)} pagine esterno notte`,
      body: `Setup luci pesante, generatori, possibile seconda unità. Valuta lo split su più nottate o l'uso di day-for-night.`,
      suggestedAction: null,
      category: null,
    });
  }
  return out;
};

// ─── Rule: coverage gap — keyword in text but no element in breakdown ────────

const rule_coverageGap = (input: AdAnalyzeInput): AdSuggestion[] => {
  if (!input.screenplayText) return [];
  const out: AdSuggestion[] = [];
  const occByScene = groupBy(input.occurrences, (o) => o.sceneId);
  for (const scene of input.scenes) {
    const text = sceneTextFor(scene, input.screenplayText);
    if (!text) continue;
    const sceneOccs = occByScene.get(scene.id) ?? [];
    for (const kw of RISK_KEYWORDS) {
      if (!kw.rx.test(text)) continue;
      const hasCategory = sceneOccs.some((o) => o.category === kw.category);
      if (hasCategory) continue;
      out.push({
        id: `coverage-${scene.id}-${kw.label.replace(/\s+/g, "-")}`,
        kind: "coverage-gap",
        severity: kw.severity,
        sceneNumber: scene.number,
        sceneId: scene.id,
        title: `Scena ${scene.number}: ${kw.label} non spogliata`,
        body: kw.body,
        suggestedAction: `Spogliare ${kw.label}`,
        category: kw.category,
      });
    }
  }
  return out;
};

// ─── Rule: location consolidation — rare locations + alias detection ─────────

const rule_locationConsolidation = (input: AdAnalyzeInput): AdSuggestion[] => {
  const out: AdSuggestion[] = [];
  const byNormalized = new Map<string, { scene: AdAnalyzeScene; raw: string }[]>();
  for (const scene of input.scenes) {
    const key = normalizeLocation(scene.location);
    const list = byNormalized.get(key) ?? [];
    list.push({ scene, raw: scene.location });
    byNormalized.set(key, list);
  }

  // 1) rare locations: <3 scenes → potential company-move waste.
  for (const [key, list] of byNormalized) {
    if (list.length >= 3) continue;
    if (key.length === 0) continue;
    const sceneNumbers = list.map((i) => i.scene.number);
    out.push({
      id: `loc-rare-${key}`,
      kind: "location-consolidate",
      severity: "info",
      sceneNumber: sceneNumbers[0] ?? null,
      sceneId: list[0]?.scene.id ?? null,
      title: `Location "${list[0]?.raw}" usata in ${list.length} scena/e`,
      body: `Solo ${list.length} scena/e in questa location (sc. ${sceneNumbers.join(", ")}). Valuta consolidamento con location simili per evitare company moves.`,
      suggestedAction: null,
      category: "locations",
    });
  }

  // 2) alias detection: locations whose normalized form shares a meaningful
  // prefix but the raw form differs (case, spaces, articles).
  const rawByNormalized = new Map<string, Set<string>>();
  for (const [key, list] of byNormalized) {
    const raws = new Set(list.map((i) => i.raw));
    if (raws.size > 1) rawByNormalized.set(key, raws);
  }
  for (const [key, raws] of rawByNormalized) {
    out.push({
      id: `loc-alias-${key}`,
      kind: "location-consolidate",
      severity: "warn",
      sceneNumber: null,
      sceneId: null,
      title: `Possibili alias location: ${[...raws].join(" / ")}`,
      body: `Queste varianti puntano probabilmente alla stessa location reale. Unificale per non gonfiare il conteggio location.`,
      suggestedAction: "Consolida location",
      category: "locations",
    });
  }

  return out;
};

// ─── Public entry point ──────────────────────────────────────────────────────

const RULES: ReadonlyArray<(i: AdAnalyzeInput) => AdSuggestion[]> = [
  rule_sameDayLocationJump,
  rule_characterDisappearance,
  rule_largeExtras,
  rule_longExteriorNight,
  rule_coverageGap,
  rule_locationConsolidation,
];

const SEVERITY_RANK: Record<AdSuggestionSeverity, number> = {
  critical: 0,
  warn: 1,
  info: 2,
};

export const adAnalyze = (input: AdAnalyzeInput): AdSuggestion[] => {
  const all = RULES.flatMap((rule) => rule(input));
  // Stable sort: severity desc, then scene number asc, then id.
  return all.sort((a, b) => {
    const s = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (s !== 0) return s;
    const an = a.sceneNumber ?? Number.POSITIVE_INFINITY;
    const bn = b.sceneNumber ?? Number.POSITIVE_INFINITY;
    if (an !== bn) return an - bn;
    return a.id.localeCompare(b.id);
  });
};
