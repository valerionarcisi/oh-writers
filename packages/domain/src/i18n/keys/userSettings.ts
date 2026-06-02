import type { LocaleDict } from "./types.js";

/** userSettings feature keys. Filled by the i18n bulk extraction (Spec 18b PR-5+). */
export const userSettingsKeys = {
  en: {},
  it: {},
} as const satisfies LocaleDict;
