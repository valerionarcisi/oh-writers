import type { LocaleDict } from "./types.js";

/** documents feature keys. Filled by the i18n bulk extraction (Spec 18b PR-5+). */
export const documentsKeys = {
  en: {},
  it: {},
} as const satisfies LocaleDict;
