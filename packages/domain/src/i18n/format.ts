import type { Locale } from "../constants.js";

/** Locale-aware short date, e.g. "Apr 13" (en) / "13 apr" (it). */
export const formatDate = (date: Date, locale: Locale): string =>
  new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(
    date,
  );

/** Locale-aware number formatting. */
export const formatNumber = (value: number, locale: Locale): string =>
  new Intl.NumberFormat(locale).format(value);
