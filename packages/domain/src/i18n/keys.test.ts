import { describe, expect, it } from "vitest";
import { translations, translate } from "./keys.js";
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

const AREAS = {
  common: commonKeys,
  budget: budgetKeys,
  breakdown: breakdownKeys,
  projects: projectsKeys,
  documents: documentsKeys,
  shootingPlan: shootingPlanKeys,
  screenplay: screenplayKeys,
  schedule: scheduleKeys,
  locations: locationsKeys,
  appShell: appShellKeys,
  fundraising: fundraisingKeys,
  predictions: predictionsKeys,
  teams: teamsKeys,
  auth: authKeys,
  userSettings: userSettingsKeys,
  versions: versionsKeys,
  dashboard: dashboardKeys,
} as const;

describe("translations dictionary", () => {
  it("carries the exact same key set in every locale", () => {
    const en = Object.keys(translations.en).sort();
    const itKeys = Object.keys(translations.it).sort();
    expect(itKeys).toEqual(en);
  });

  it("has no empty or whitespace-only values", () => {
    for (const locale of ["en", "it"] as const) {
      for (const [key, value] of Object.entries(translations[locale])) {
        expect(value.trim().length, `${locale}.${key}`).toBeGreaterThan(0);
      }
    }
  });

  it("resolves a key to its locale value", () => {
    expect(translate("it", "nav.screenplay")).toBe("Sceneggiatura");
    expect(translate("en", "nav.screenplay")).toBe("Screenplay");
  });

  it("each area module has matching en/it key sets", () => {
    for (const [area, dict] of Object.entries(AREAS)) {
      const en = Object.keys(dict.en).sort();
      const itKeys = Object.keys(dict.it).sort();
      expect(itKeys, `${area} en/it mismatch`).toEqual(en);
    }
  });

  it("no key is declared in two different area modules", () => {
    const seen = new Map<string, string>();
    for (const [area, dict] of Object.entries(AREAS)) {
      for (const key of Object.keys(dict.en)) {
        const prev = seen.get(key);
        expect(prev, `key "${key}" duplicated in ${area} and ${prev}`).toBe(
          undefined,
        );
        seen.set(key, area);
      }
    }
  });
});
