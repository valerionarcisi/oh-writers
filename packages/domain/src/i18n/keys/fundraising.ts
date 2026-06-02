import type { LocaleDict } from "./types.js";

/**
 * fundraising feature keys (Spec 18b PR-5+). The fundraising/bandi area is an
 * Italy-only market feature (hidden on the EN market), but its copy is still
 * extracted so the IT rendering flows through the dictionary. EN values are
 * provided for completeness-test parity.
 *
 * Interpolated strings keep a `{value}` placeholder the call site fills via
 * String.replace — the `t` translator returns plain strings (no param support).
 */
export const fundraisingKeys = {
  en: {
    // Filter rail
    "fundraising.filter.heading": "Filters",
    "fundraising.filter.kind": "Type",
    "fundraising.filter.status": "Status",
    "fundraising.filter.deadline": "Deadline",
    // Filter — status options
    "fundraising.status.active": "Active",
    "fundraising.status.expired": "Expired",
    "fundraising.status.all": "All",
    // Filter — deadline options
    "fundraising.deadline.30d": "Next 30 days",
    "fundraising.deadline.90d": "Next 90 days",
    "fundraising.deadline.any": "All",
    // Opportunity kinds (display labels)
    "fundraising.kind.all": "All",
    "fundraising.kind.bando_pubblico": "Public grant",
    "fundraising.kind.call_festival": "Festival",
    "fundraising.kind.residenza": "Residency",
    "fundraising.kind.grant_privato": "Grant",
    "fundraising.kind.workshop": "Workshop",
    "fundraising.kind.pitch_forum": "Pitch forum",
    "fundraising.kind.other": "Other",
    // List
    "fundraising.list.title": "Funding opportunities",
    "fundraising.list.empty.title": "No opportunities found",
    "fundraising.list.empty.subtitle":
      "Try changing the filters or come back later.",
    "fundraising.list.loading": "Loading opportunities",
    // Deadline labels
    "fundraising.deadlineLabel.none": "Deadline not specified",
    "fundraising.deadlineLabel.expiredDaysAgo": "Expired {value} days ago",
    "fundraising.deadlineLabel.inDays": "in {value} days",
    "fundraising.deadlineLabel.expiredOn": "Expired on {value}",
    "fundraising.deadlineLabel.dueOn": "Due on {value}",
    // Amount labels
    "fundraising.amount.upTo": "Up to {value}",
    // Save actions
    "fundraising.action.save": "Save",
    "fundraising.action.dismiss": "Dismiss",
    "fundraising.action.applied": "Applied",
    "fundraising.action.saveAria": "Save opportunity",
    "fundraising.action.dismissAria": "Dismiss opportunity",
    "fundraising.action.appliedAria": "Applied",
    // Drawer
    "fundraising.drawer.closeAria": "Close detail",
    "fundraising.drawer.status": "Status",
    "fundraising.drawer.deadline": "Deadline",
    "fundraising.drawer.amount": "Amount",
    "fundraising.drawer.description": "Description",
    "fundraising.drawer.requirements": "Requirements",
    "fundraising.drawer.eligibility": "Eligibility",
    "fundraising.drawer.notes": "Notes",
    "fundraising.drawer.openSite": "Open on website",
    "fundraising.drawer.notesPlaceholder": "Add personal notes…",
  },
  it: {
    // Filter rail
    "fundraising.filter.heading": "Filtri",
    "fundraising.filter.kind": "Tipo",
    "fundraising.filter.status": "Stato",
    "fundraising.filter.deadline": "Scadenza",
    // Filter — status options
    "fundraising.status.active": "Attivi",
    "fundraising.status.expired": "Scaduti",
    "fundraising.status.all": "Tutti",
    // Filter — deadline options
    "fundraising.deadline.30d": "Prossimi 30gg",
    "fundraising.deadline.90d": "Prossimi 90gg",
    "fundraising.deadline.any": "Tutti",
    // Opportunity kinds (display labels)
    "fundraising.kind.all": "Tutti",
    "fundraising.kind.bando_pubblico": "Bando pubblico",
    "fundraising.kind.call_festival": "Festival",
    "fundraising.kind.residenza": "Residenza",
    "fundraising.kind.grant_privato": "Grant",
    "fundraising.kind.workshop": "Workshop",
    "fundraising.kind.pitch_forum": "Pitch forum",
    "fundraising.kind.other": "Altro",
    // List
    "fundraising.list.title": "Opportunità di finanziamento",
    "fundraising.list.empty.title": "Nessuna opportunità trovata",
    "fundraising.list.empty.subtitle":
      "Prova a cambiare i filtri o torna più tardi.",
    "fundraising.list.loading": "Caricamento opportunità",
    // Deadline labels
    "fundraising.deadlineLabel.none": "Scadenza non indicata",
    "fundraising.deadlineLabel.expiredDaysAgo": "Scaduto {value} giorni fa",
    "fundraising.deadlineLabel.inDays": "tra {value} giorni",
    "fundraising.deadlineLabel.expiredOn": "Scaduto il {value}",
    "fundraising.deadlineLabel.dueOn": "Scade il {value}",
    // Amount labels
    "fundraising.amount.upTo": "Fino a {value}",
    // Save actions
    "fundraising.action.save": "Salva",
    "fundraising.action.dismiss": "Ignora",
    "fundraising.action.applied": "Applicato",
    "fundraising.action.saveAria": "Salva opportunità",
    "fundraising.action.dismissAria": "Ignora opportunità",
    "fundraising.action.appliedAria": "Applicato",
    // Drawer
    "fundraising.drawer.closeAria": "Chiudi dettaglio",
    "fundraising.drawer.status": "Stato",
    "fundraising.drawer.deadline": "Scadenza",
    "fundraising.drawer.amount": "Importo",
    "fundraising.drawer.description": "Descrizione",
    "fundraising.drawer.requirements": "Requisiti",
    "fundraising.drawer.eligibility": "Eleggibilità",
    "fundraising.drawer.notes": "Note",
    "fundraising.drawer.openSite": "Apri sul sito",
    "fundraising.drawer.notesPlaceholder": "Aggiungi note personali…",
  },
} as const satisfies LocaleDict;
