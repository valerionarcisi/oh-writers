import type { Locale } from "../constants.js";

/**
 * UI translation dictionary. Values are user-facing copy (IT + EN); keys and
 * everything else stay English. A completeness test (keys.test.ts) enforces
 * that the two locales carry the exact same key set, so a missing translation
 * is a test failure, not a runtime fallback.
 *
 * Seeded here with the nav/shell/status/action keys (the first extraction
 * targets, Spec 18b PR-2); the remaining ~250 keys are added incrementally as
 * each feature's strings are extracted, guarded by the same test.
 */
export const translations = {
  en: {
    // Navigation — document types
    "nav.soggetto": "Treatment outline",
    "nav.synopsis": "Synopsis",
    "nav.outline": "Outline",
    "nav.treatment": "Treatment",
    "nav.screenplay": "Screenplay",
    // Navigation — production
    "nav.breakdown": "Breakdown",
    "nav.budget": "Budget",
    "nav.schedule": "Schedule",
    "nav.locations": "Locations",
    "nav.shootingPlan": "Shots",
    "nav.opportunities": "Funding",
    // Navigation — groups
    "navGroup.development": "Development",
    "navGroup.production": "Production",
    // Common status
    "status.saved": "Saved",
    "status.saving": "Saving…",
    "status.soon": "soon",
    // Common actions
    "action.save": "Save",
    "action.export": "Export",
    "action.newProject": "New project",
    "action.cancel": "Cancel",
    "action.delete": "Delete",
    "action.settings": "Settings",
    "action.overview": "Overview",
    "action.signOut": "Sign out",
  },
  it: {
    // Navigation — document types
    "nav.soggetto": "Soggetto",
    "nav.synopsis": "Sinossi",
    "nav.outline": "Scaletta",
    "nav.treatment": "Trattamento",
    "nav.screenplay": "Sceneggiatura",
    // Navigation — production
    "nav.breakdown": "Breakdown",
    "nav.budget": "Budget",
    "nav.schedule": "Calendario",
    "nav.locations": "Location",
    "nav.shootingPlan": "Inquadrature",
    "nav.opportunities": "Opportunità",
    // Navigation — groups
    "navGroup.development": "Sviluppo",
    "navGroup.production": "Produzione",
    // Common status
    "status.saved": "Salvato",
    "status.saving": "Salvataggio…",
    "status.soon": "presto",
    // Common actions
    "action.save": "Salva",
    "action.export": "Esporta",
    "action.newProject": "Nuovo progetto",
    "action.cancel": "Annulla",
    "action.delete": "Elimina",
    "action.settings": "Impostazioni",
    "action.overview": "Panoramica",
    "action.signOut": "Esci",
  },
} as const;

export type TranslationKey = keyof (typeof translations)["en"];

export const translate = (locale: Locale, key: TranslationKey): string =>
  translations[locale][key];
