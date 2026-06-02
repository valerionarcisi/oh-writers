import type { CesarePage } from "~/features/predictions";
import type { TranslationKey } from "@oh-writers/domain";

/** A translator — `useTranslation().t`. Passed in so this module stays free of
 *  React-hook imports (it is imported by both components and plain helpers). */
type Translate = (key: TranslationKey) => string;

/**
 * In-progress action label key for each Cesare-enabled page.
 * Used by the persistent pill while a tool loop is running.
 */
export const ACTION_LABEL_KEY_BY_PAGE: Record<CesarePage, TranslationKey> = {
  soggetto: "shell.action.soggetto",
  synopsis: "shell.action.synopsis",
  outline: "shell.action.outline",
  treatment: "shell.action.treatment",
  screenplay: "shell.action.screenplay",
  breakdown: "shell.action.breakdown",
  budget: "shell.action.budget",
  schedule: "shell.action.schedule",
  "shooting-plan": "shell.action.shootingPlan",
  locations: "shell.action.locations",
};

/**
 * Fallback completion label key per page when the reply doesn't match any of
 * the heuristic keywords.
 */
export const DEFAULT_RESULT_KEY_BY_PAGE: Record<CesarePage, TranslationKey> = {
  soggetto: "shell.result.soggetto",
  synopsis: "shell.result.synopsis",
  outline: "shell.result.outline",
  treatment: "shell.result.treatment",
  screenplay: "shell.result.screenplay",
  breakdown: "shell.result.breakdown",
  budget: "shell.result.budget",
  schedule: "shell.result.schedule",
  "shooting-plan": "shell.result.shootingPlan",
  locations: "shell.result.locations",
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
  "screenplay",
]);

export const isAgenticPage = (page: CesarePage): boolean =>
  AGENTIC_PAGES.has(page);

/**
 * Parse the reply text and produce a short localised result label.
 * Heuristic — looks for action verbs that the tool loops generate. The reply
 * keywords matched here are the Italian verbs the model emits, NOT UI copy.
 */
export const deriveResultLabel = (
  page: CesarePage,
  reply: string,
  t: Translate,
): string => {
  const lc = reply.toLowerCase();

  if (page === "locations") {
    const countMatch = reply.match(/(\d+)\s+candidat/i);
    if (countMatch && (lc.includes("aggiunto") || lc.includes("trovat"))) {
      return `${t("shell.derived.locationsCandidatesPrefix")} ${countMatch[1]} ${t("shell.derived.locationsCandidatesSuffix")}`;
    }
    if (
      lc.includes("aggiunto") ||
      lc.includes("candidat") ||
      lc.includes("trovato")
    ) {
      return t("shell.derived.locationsUpdated");
    }
  }

  if (page === "budget") {
    if (lc.includes("aggiunto") || lc.includes("aggiunti"))
      return t("shell.derived.budgetAdded");
    if (lc.includes("aggiornato") || lc.includes("modificato"))
      return t("shell.derived.budgetUpdated");
    if (lc.includes("spostato") || lc.includes("ridistribuito"))
      return t("shell.derived.budgetReorganised");
  }

  if (page === "breakdown") {
    if (lc.includes("aggiunto")) return t("shell.derived.breakdownAdded");
    if (lc.includes("rimosso") || lc.includes("cancellato"))
      return t("shell.derived.breakdownCleaned");
    if (lc.includes("aggiornato") || lc.includes("modificato"))
      return t("shell.derived.breakdownUpdated");
  }

  if (page === "schedule") {
    if (lc.includes("spostato") || lc.includes("riordinato"))
      return t("shell.derived.scheduleUpdated");
    if (lc.includes("aggiunto")) return t("shell.derived.scheduleAdded");
  }

  if (
    page === "soggetto" ||
    page === "synopsis" ||
    page === "outline" ||
    page === "treatment"
  ) {
    if (lc.includes("espanso")) return t("shell.derived.docExpanded");
    if (lc.includes("compresso") || lc.includes("riassunto"))
      return t("shell.derived.docSummarised");
    if (lc.includes("riscritto") || lc.includes("sostituito"))
      return t("shell.derived.docRewritten");
    if (lc.includes("aggiornato") || lc.includes("modificato"))
      return t("shell.derived.docUpdated");
  }

  if (page === "screenplay") {
    if (
      lc.includes("preparato") ||
      lc.includes("draft") ||
      lc.includes("versione")
    )
      return t("shell.derived.screenplayNewVersion");
    if (lc.includes("rinomina")) return t("shell.derived.screenplayRename");
    if (lc.includes("proposto") || lc.includes("propost"))
      return t("shell.derived.screenplayProposal");
  }

  return t(DEFAULT_RESULT_KEY_BY_PAGE[page]);
};
