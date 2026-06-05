import type { Locale } from "../constants.js";

/** Locale-aware short date, e.g. "Apr 13" (en) / "13 apr" (it). */
export const formatDate = (date: Date, locale: Locale): string =>
  new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(
    date,
  );

/** Locale-aware clock time, e.g. "14:05" (it) / "2:05 PM" (en). */
export const formatTime = (date: Date, locale: Locale): string =>
  new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);

/** Locale-aware short date + time, e.g. "13 apr, 14:05" / "Apr 13, 2:05 PM". */
export const formatDateTime = (date: Date, locale: Locale): string =>
  new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);

/** Locale-aware number formatting. */
export const formatNumber = (value: number, locale: Locale): string =>
  new Intl.NumberFormat(locale).format(value);

/** Locale-aware integer (rounded, grouped), e.g. "1.234" (it) / "1,234" (en). */
export const formatInteger = (value: number, locale: Locale): string =>
  new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(
    Math.round(value),
  );

/** Locale-aware euro amount, e.g. "1.234 €" (it) / "€1,234" (en). */
export const formatCurrencyEUR = (value: number, locale: Locale): string =>
  new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(Math.round(value));
