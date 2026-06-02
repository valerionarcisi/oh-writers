import type { LocaleDict } from "./types.js";

/** versions feature keys. Filled by the i18n bulk extraction (Spec 18b PR-5+). */
export const versionsKeys = {
  en: {},
  it: {},
} as const satisfies LocaleDict;
