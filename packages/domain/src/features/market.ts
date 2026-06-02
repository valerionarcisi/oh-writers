import type { Locale } from "../constants.js";

/**
 * The commercial market a session belongs to, derived from its locale. Italian
 * users get the Italy-specific surfaces (SIAE, bandi); everyone else gets the
 * international product with those detached.
 */
export type Market = "it" | "intl";

export const marketFromLocale = (locale: Locale): Market =>
  locale === "it" ? "it" : "intl";

export const isItalianMarket = (locale: Locale): boolean =>
  marketFromLocale(locale) === "it";
