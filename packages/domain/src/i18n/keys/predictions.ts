import type { LocaleDict } from "./types.js";

/** predictions feature keys. Filled by the i18n bulk extraction (Spec 18b PR-5+). */
export const predictionsKeys = {
  en: {},
  it: {},
} as const satisfies LocaleDict;
