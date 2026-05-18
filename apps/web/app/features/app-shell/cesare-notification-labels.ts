import type { CesarePage } from "~/features/predictions";

/**
 * In-progress action label for each Cesare-enabled page.
 * Used by the persistent pill while a tool loop is running.
 */
export const ACTION_LABEL_BY_PAGE: Record<CesarePage, string> = {
  soggetto: "Cesare sta lavorando sul soggetto…",
  synopsis: "Cesare sta lavorando sulla sinossi…",
  outline: "Cesare sta lavorando sulla scaletta…",
  treatment: "Cesare sta lavorando sul trattamento…",
  screenplay: "Cesare sta analizzando la scena…",
  breakdown: "Cesare sta aggiornando il breakdown…",
  budget: "Cesare sta aggiornando il budget…",
  schedule: "Cesare sta riorganizzando il piano…",
  "shooting-plan": "Cesare sta lavorando alle inquadrature…",
  locations: "Cesare sta cercando candidati…",
};

/**
 * Fallback completion label per page when the reply doesn't match any of the
 * heuristic keywords.
 */
export const DEFAULT_RESULT_BY_PAGE: Record<CesarePage, string> = {
  soggetto: "Cesare ha risposto sul soggetto",
  synopsis: "Cesare ha risposto sulla sinossi",
  outline: "Cesare ha risposto sulla scaletta",
  treatment: "Cesare ha risposto sul trattamento",
  screenplay: "Cesare ha risposto sulla scena",
  breakdown: "Cesare ha aggiornato il breakdown",
  budget: "Cesare ha risposto sul budget",
  schedule: "Cesare ha risposto sulla pianificazione",
  "shooting-plan": "Cesare ha risposto sulle inquadrature",
  locations: "Cesare ha aggiornato le location",
};

/**
 * Pages where Cesare runs agentic tool loops that can write data.
 * On the other pages the assistant is conversational only — we do not
 * raise persistent notifications (the loading bubble is enough).
 */
const AGENTIC_PAGES = new Set<CesarePage>([
  "locations",
  "breakdown",
  "budget",
  "schedule",
  "soggetto",
  "synopsis",
  "outline",
  "treatment",
]);

export const isAgenticPage = (page: CesarePage): boolean =>
  AGENTIC_PAGES.has(page);

/**
 * Parse the reply text and produce a short Italian result label.
 * Heuristic — looks for action verbs that the tool loops generate.
 */
export const deriveResultLabel = (
  page: CesarePage,
  reply: string,
): string => {
  const lc = reply.toLowerCase();

  if (page === "locations") {
    const countMatch = reply.match(/(\d+)\s+candidat/i);
    if (countMatch && (lc.includes("aggiunto") || lc.includes("trovat"))) {
      return `Aggiunti ${countMatch[1]} candidati`;
    }
    if (lc.includes("aggiunto") || lc.includes("candidat") || lc.includes("trovato")) {
      return "Aggiornate le location";
    }
  }

  if (page === "budget") {
    if (lc.includes("aggiunto") || lc.includes("aggiunti")) return "Aggiunte voci al budget";
    if (lc.includes("aggiornato") || lc.includes("modificato")) return "Aggiornato il budget";
    if (lc.includes("spostato") || lc.includes("ridistribuito")) return "Budget riorganizzato";
  }

  if (page === "breakdown") {
    if (lc.includes("aggiunto")) return "Aggiunti elementi al breakdown";
    if (lc.includes("rimosso") || lc.includes("cancellato")) return "Breakdown ripulito";
    if (lc.includes("aggiornato") || lc.includes("modificato")) return "Breakdown aggiornato";
  }

  if (page === "schedule") {
    if (lc.includes("spostato") || lc.includes("riordinato")) return "Pianificazione aggiornata";
    if (lc.includes("aggiunto")) return "Aggiunti elementi al piano";
  }

  if (
    page === "soggetto" ||
    page === "synopsis" ||
    page === "outline" ||
    page === "treatment"
  ) {
    if (lc.includes("espanso")) return "Documento espanso";
    if (lc.includes("compresso") || lc.includes("riassunto")) return "Documento riassunto";
    if (lc.includes("riscritto") || lc.includes("sostituito")) return "Documento riscritto";
    if (lc.includes("aggiornato") || lc.includes("modificato")) return "Documento aggiornato";
  }

  return DEFAULT_RESULT_BY_PAGE[page];
};
