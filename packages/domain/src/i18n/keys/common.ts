import type { LocaleDict } from "./types.js";

/** Shared nav / shell / status / action keys (Spec 18b PR-2). */
export const commonKeys = {
  en: {
    // Navigation — shell
    "nav.home": "Home",
    // Navigation — document types
    "nav.soggetto": "Soggetto",
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
    // Navigation — shell
    "nav.home": "Home",
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
} as const satisfies LocaleDict;
