import type { LocaleDict } from "./types.js";

/** locations feature keys. Filled by the i18n bulk extraction (Spec 18b PR-5+). */
export const locationsKeys = {
  en: {},
  it: {},
} as const satisfies LocaleDict;
