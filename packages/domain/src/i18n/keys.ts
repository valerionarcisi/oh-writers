import type { Locale } from "../constants.js";
import { commonKeys } from "./keys/common.js";
import { budgetKeys } from "./keys/budget.js";
import { breakdownKeys } from "./keys/breakdown.js";
import { projectsKeys } from "./keys/projects.js";
import { documentsKeys } from "./keys/documents.js";
import { shootingPlanKeys } from "./keys/shootingPlan.js";
import { screenplayKeys } from "./keys/screenplay.js";
import { scheduleKeys } from "./keys/schedule.js";
import { locationsKeys } from "./keys/locations.js";
import { appShellKeys } from "./keys/appShell.js";
import { fundraisingKeys } from "./keys/fundraising.js";
import { predictionsKeys } from "./keys/predictions.js";
import { teamsKeys } from "./keys/teams.js";
import { authKeys } from "./keys/auth.js";
import { userSettingsKeys } from "./keys/userSettings.js";
import { versionsKeys } from "./keys/versions.js";
import { dashboardKeys } from "./keys/dashboard.js";

/**
 * UI translation dictionary, composed from per-feature-area key modules under
 * `./keys/`. Values are user-facing copy (IT + EN); keys + everything else stay
 * English. A completeness test (keys.test.ts) enforces EN key set == IT.
 *
 * Each area lives in its own module so the i18n bulk extraction (Spec 18b PR-5+)
 * can run as a fleet without merge conflicts on a single file.
 */
const AREA_DICTS = [
  commonKeys,
  budgetKeys,
  breakdownKeys,
  projectsKeys,
  documentsKeys,
  shootingPlanKeys,
  screenplayKeys,
  scheduleKeys,
  locationsKeys,
  appShellKeys,
  fundraisingKeys,
  predictionsKeys,
  teamsKeys,
  authKeys,
  userSettingsKeys,
  versionsKeys,
  dashboardKeys,
] as const;

const mergeLocale = (locale: Locale): Record<string, string> =>
  Object.assign({}, ...AREA_DICTS.map((d) => d[locale]));

export const translations: Record<Locale, Record<string, string>> = {
  en: mergeLocale("en"),
  it: mergeLocale("it"),
};

// Strict key union: the keys of every area module's `en` side combined.
// Intersecting the en OBJECT types yields the UNION of their keys, so adding a
// key to any area module immediately makes `t("…")` typecheck-valid and a typo
// a compile error — the typed-dict guarantee survives the per-area split.
type AllEnKeys = (typeof commonKeys)["en"] &
  (typeof budgetKeys)["en"] &
  (typeof breakdownKeys)["en"] &
  (typeof projectsKeys)["en"] &
  (typeof documentsKeys)["en"] &
  (typeof shootingPlanKeys)["en"] &
  (typeof screenplayKeys)["en"] &
  (typeof scheduleKeys)["en"] &
  (typeof locationsKeys)["en"] &
  (typeof appShellKeys)["en"] &
  (typeof fundraisingKeys)["en"] &
  (typeof predictionsKeys)["en"] &
  (typeof teamsKeys)["en"] &
  (typeof authKeys)["en"] &
  (typeof userSettingsKeys)["en"] &
  (typeof versionsKeys)["en"] &
  (typeof dashboardKeys)["en"];

export type TranslationKey = keyof AllEnKeys;

export const translate = (locale: Locale, key: TranslationKey): string =>
  translations[locale][key as string] ?? (key as string);
