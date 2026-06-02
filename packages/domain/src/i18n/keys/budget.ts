import type { LocaleDict } from "./types.js";

/** budget feature keys (Spec 18b PR-5+ bulk extraction). */
export const budgetKeys = {
  en: {
    // View switcher (Viewbar SegmentedControl)
    "budget.view.overview": "Overview",
    "budget.view.category": "By category",
    "budget.view.day": "By day",
    "budget.view.weekly": "Weeks",
    "budget.view.ariaLabel": "Budget view",

    // Viewbar setting chips + version trigger
    "budget.viewbar.daysLabel": "Days",
    "budget.viewbar.contingencyLabel": "Cont.",
    "budget.viewbar.versionFallback": "Version",
    "budget.viewbar.openVersions": "Open Versions →",

    // Section headers / metadata (category, day, weekly)
    "budget.section.allLines": "All lines",
    "budget.section.allLinesMeta":
      "Direct edit · ⌘K to search · Tab to jump field",
    "budget.section.detailView": "Detailed view",
    "budget.section.byDay": "By day",
    "budget.section.byDayMeta": "{count} days",
    "budget.section.byWeek": "By week",
    "budget.section.byWeekMeta":
      "Breakdown of production costs per shooting week",
    "budget.section.byCategory": "By category",
    "budget.section.departments": "Departments",
    "budget.section.departmentsMeta": "{count} categories · click for detail",
    "budget.section.repartiMeta": "{count} departments · click for detail",
    "budget.section.close": "Close ✕",

    // Empty states
    "budget.empty.configureRatesPrefix": "Set the rates, then press",
    "budget.empty.configureRatesRegenerate": "Regenerate",
    "budget.empty.configureRatesSuffix": "to generate the budget.",
    "budget.empty.castDrillNoBudget": "Generate the budget to manage the cast.",
    "budget.empty.crewDrillEmpty": "No crew roles — run Generate to populate.",
    "budget.empty.categoryNoBudget":
      "No budget generated — run Generate to populate the category.",
    "budget.empty.weekly":
      "Generate the schedule and the budget to see the weekly breakdown.",
    "budget.empty.day": "Schedule the days to see the cost per day.",
    "budget.empty.chart": "No data available for the chart.",
    "budget.empty.perElement": "No elements found in the breakdown.",

    // Back link
    "budget.back.toCategories": "← Back to all categories",

    // FloatingDock actions
    "budget.action.regenerate": "Regenerate",
    "budget.action.regenerating": "Generating…",
    "budget.action.export": "Export",
    "budget.action.estimatedTotal": "Estimated total",
    "budget.action.totalChip": "total",

    // Category card footer
    "budget.category.lines": "lines",

    // Budget cap bar
    "budget.cap.label": "Budget cap",
    "budget.cap.placeholder": "set cap",
    "budget.cap.inputAriaLabel": "Budget cap in euros",
    "budget.cap.progressAriaLabel": "Estimated spend vs cap",
    "budget.cap.over": "over by {amount}",
    "budget.cap.remaining": "{amount} remaining",

    // Flat table
    "budget.flat.search": "Search line…",
    "budget.flat.colLine": "Line",
    "budget.flat.colQty": "Qty",
    "budget.flat.colRate": "Rate",
    "budget.flat.colTotal": "Total",
    "budget.flat.colStatus": "Status",
    "budget.flat.colActions": "Actions",
    "budget.flat.detailLink": "Detailed view →",
    "budget.flat.noLinesIn": "No lines in {section}",
    "budget.flat.statusOk": "OK",
    "budget.flat.removeRow": "Remove {name}",
    "budget.flat.confirmRemove": 'Remove "{name}"? Total: {total}',
    "budget.flat.addRolePlaceholder": "New line — role name",
    "budget.flat.addLine": "+ Add line",
    "budget.flat.searchDialogAriaLabel": "Search budget line",
    "budget.flat.searchPlaceholder": "Search by name…",
    "budget.flat.noResults": "No results",

    // Flat-table section labels
    "budget.section.label.cast": "Cast",
    "budget.section.label.crew": "Crew",
    "budget.section.label.locations": "Locations",
    "budget.section.label.scenografia": "Set design",
    "budget.section.label.costumi": "Costumes",
    "budget.section.label.fotografia": "Cinematography",
    "budget.section.label.suono": "Sound",
    "budget.section.label.vfx": "VFX",
    "budget.section.label.comparse": "Extras",
    "budget.section.label.vehicles": "Vehicles",
    "budget.section.label.post": "Post-production",
    "budget.section.label.contingency": "Contingency",
    "budget.section.label.other": "Other",

    // Rate card
    "budget.rateCard.title": "Rates",
    "budget.rateCard.add": "+ Add",
    "budget.rateCard.colName": "Name",
    "budget.rateCard.colRole": "Role",
    "budget.rateCard.colUnit": "Unit",
    "budget.rateCard.colRate": "€ / unit",
    "budget.rateCard.colMeal": "Per diem",
    "budget.rateCard.colAccommodation": "Accommodation",
    "budget.rateCard.colRegime": "Regime",
    "budget.rateCard.edit": "Edit",
    "budget.rateCard.delete": "Delete",
    "budget.rateCard.empty":
      "Add the rates before generating the budget to pre-fill cast and crew with the correct values.",
    "budget.rateCard.namePlaceholder": "Name *",
    "budget.rateCard.rolePlaceholder": "Role",

    // Resource row
    "budget.resource.toggleAriaLabel": "Enable/disable",
    "budget.resource.removeAriaLabel": "Remove",
    "budget.resource.daysUnit": "d",
    "budget.resource.titleMeals": " + meals/lodging",
    "budget.resource.privateMultiplier": " ×1.20",
    "budget.resource.scenePortion": " × {percent}% (scene)",

    // Cast widget
    "budget.cast.title": "Cast",
    "budget.cast.empty":
      "Generate the budget to populate the cast from the breakdown.",
    "budget.cast.actorNamePlaceholder": "Actor name",
    "budget.cast.addActor": "+ Add actor",
    "budget.cast.sceneNote": "Sc.{scene} · proportional cost",
    "budget.cast.colActor": "Actor",
    "budget.cast.colDays": "D",
    "budget.cast.colDayRate": "€/d",
    "budget.cast.colRegime": "Regime",
    "budget.cast.colMeal": "Meal",
    "budget.cast.colAccommodation": "Lodging",
    "budget.cast.colTotal": "Total",

    // Crew widget
    "budget.crew.title": "Crew",
    "budget.crew.colActive": "Active",
    "budget.crew.colRole": "Role",
    "budget.crew.colDays": "D",
    "budget.crew.colDayRate": "€/d",
    "budget.crew.colRegime": "Regime",
    "budget.crew.colMeal": "Meal",
    "budget.crew.colAccommodation": "Lodging",
    "budget.crew.colTotal": "Total",
    "budget.crew.customRoles": "Custom roles",
    "budget.crew.roleNamePlaceholder": "Role name",
    "budget.crew.customOption": "Custom",
    "budget.crew.addRole": "+ Add role",

    // Shared add/cancel buttons in widgets
    "budget.form.add": "Add",
    "budget.form.cancel": "Cancel",

    // Day view
    "budget.day.dayPrefix": "D {number}",
    "budget.day.cast": "Cast",
    "budget.day.crew": "Crew",
    "budget.day.locations": "Locations",
    "budget.day.vehicles": "Vehicles",
    "budget.day.other": "Other (allocated)",
    "budget.day.contingency": "Contingency",
    "budget.day.total": "Day total",

    // Weekly view
    "budget.weekly.timelineAriaLabel": "Production weeks timeline",
    "budget.weekly.weekTitle": "Week {number} · {days} days",
    "budget.weekly.weekBarAriaLabel": "Cost breakdown week {number}",
    "budget.weekly.scenes": "{count} scenes",
    "budget.weekly.colWeek": "Week",
    "budget.weekly.colTotal": "Total",
    "budget.weekly.rowTotal": "Total",

    // Weekly category labels
    "budget.weekly.cat.cast": "Cast",
    "budget.weekly.cat.crew": "Crew",
    "budget.weekly.cat.locations": "Location",
    "budget.weekly.cat.vehicles": "Vehicles",
    "budget.weekly.cat.other": "Other",
    "budget.weekly.cat.contingency": "Contingency",

    // Production drill-down
    "budget.production.subnavAriaLabel": "Production sub-categories",
    "budget.production.subnavOptionAriaLabel": "Production sub-category",
    "budget.production.eyebrow": "Production category",
    "budget.production.linesTotal": "{count} lines · total {total}",
    "budget.production.missingRates": " · {count} without rate",
    "budget.production.empty":
      "No lines for {category}. Generate the budget to populate it from the breakdown.",
    "budget.production.colLine": "Line",
    "budget.production.colQty": "Qty",
    "budget.production.colUnitRate": "€/u",
    "budget.production.colTotal": "Total",
    "budget.production.colStatus": "Status",
    "budget.production.colActions": "Actions",
    "budget.production.removeLine": "Remove {name}",
    "budget.production.total": "Total",
    "budget.production.linePlaceholder": "Line",
    "budget.production.qtyPlaceholder": "Qty",
    "budget.production.unitRatePlaceholder": "€/u",
    "budget.production.addConfirm": "Add",
    "budget.production.addCancel": "Cancel",
    "budget.production.addLineTo": "+ Add line to {category}",
    "budget.production.statusOk": "Confirmed",
    "budget.production.statusWarn": "Modified",
    "budget.production.statusMissing": "No rate",

    // Production tab labels
    "budget.production.tab.locations": "Location",
    "budget.production.tab.fotografia": "Cinematography",
    "budget.production.tab.suono": "Sound",
    "budget.production.tab.scenografia": "Set design",
    "budget.production.tab.costumi": "Costumes & Make-up",
    "budget.production.tab.vehicles": "Vehicles",
    "budget.production.tab.comparse": "Extras",
    "budget.production.tab.vfx": "VFX / SFX",
    "budget.production.tab.stunts": "Stunts",

    // Overview KPIs + cards
    "budget.overview.estimatedTotal": "Estimated total",
    "budget.overview.deltaVsEstimate": "{delta} vs estimate",
    "budget.overview.contingencyIncluded": "contingency {percent}% included",
    "budget.overview.days": " · {days} days",
    "budget.overview.perDayInline": " · {amount}/day",
    "budget.overview.categoriesCount": "{count} categories",
    "budget.overview.kpiCast": "Cast",
    "budget.overview.kpiCrew": "Crew",
    "budget.overview.kpiProduction": "Production",
    "budget.overview.kpiContingency": "Contingency",
    "budget.overview.kpiPerDay": "Cost / day",
    "budget.overview.kpiPerScene": "Cost / scene",
    "budget.overview.roles": "roles",
    "budget.overview.repartiCount": "departments",
    "budget.overview.contingencyShort": "cont.",
    "budget.overview.daysShort": "{days} d",
    "budget.overview.notAvailable": "n/a",
    "budget.overview.sceneAverage": "average {count} scenes",
    "budget.overview.spendDistribution": "Spend distribution",
    "budget.overview.top5": "top 5 departments",
    "budget.overview.budgetStatus": "Budget status",
    "budget.overview.warnings": "{count} warnings",
    "budget.overview.missingRatesTag": "Missing rates",
    "budget.overview.actorsNoDayRate": "{count} actors without day-rate",
    "budget.overview.setRatesToAvoidZero":
      " — set the rates to avoid a zero estimate.",
    "budget.overview.noRateTag": "No rate",
    "budget.overview.categoryInBreakdown":
      " — category present in the breakdown but not yet estimated.",
    "budget.overview.readyTag": "Ready",
    "budget.overview.allCovered": "All categories are covered",
    "budget.overview.readyForLock": " — the budget is ready for lock.",
    "budget.overview.departments": "Departments",
    "budget.overview.openDetail": "Open detail {category}",
    "budget.overview.trend": "Trend {category}",
    "budget.overview.rolesCount": "roles",
    "budget.overview.linesCount": "lines",
    "budget.overview.statusComplete": "Complete",
    "budget.overview.statusToConfirm": "To confirm",
    "budget.overview.statusNoRate": "No rate",
    "budget.overview.statusLocked": "Locked",
    "budget.overview.statusBadgeAriaLabel": "Category status: {label}",
    "budget.overview.generateToEstimate": "Generate to estimate",

    // Export modal
    "budget.export.title": "Export budget",
    "budget.export.cancel": "Cancel",
    "budget.export.generating": "Generating…",
    "budget.export.generate": "Generate",
    "budget.export.formatLabel": "Format",

    // Total widget
    "budget.total.title": "Project total",
    "budget.total.cast": "Cast",
    "budget.total.crew": "Crew",
    "budget.total.production": "Production",
    "budget.total.misc": "Misc",
    "budget.total.subtotal": "Subtotal",
    "budget.total.contingency": "Contingency {percent}%",
    "budget.total.total": "Total",
    "budget.total.cat.locations": "Locations",
    "budget.total.cat.vehicles": "Vehicles",
    "budget.total.cat.equipment": "Cinematography",
    "budget.total.cat.sound": "Sound",
    "budget.total.cat.props": "Set design",
    "budget.total.cat.wardrobe": "Costumes",
    "budget.total.cat.extras": "Extras",
    "budget.total.cat.vfx": "VFX / SFX",
    "budget.total.cat.stunts": "Stunts",
    "budget.total.cat.animals": "Animals",

    // Category line widget
    "budget.line.elements": "{count} elements",
    "budget.line.empty": "Generate the budget to populate this section.",
    "budget.line.elementSingular": "element",
    "budget.line.elementPlural": "elements",
    "budget.line.fromBreakdown": "from the breakdown",
    "budget.line.rate": "Rate",
    "budget.line.actual": "Actual",

    // Per-element widget (locations / vehicles)
    "budget.perElement.colName": "Name",
    "budget.perElement.colDays": "Days",
    "budget.perElement.colDayRate": "€/day",
    "budget.perElement.colActual": "Actual",
    "budget.perElement.colTotal": "Total",
    "budget.perElement.removedFromBreakdown": "⚠ removed from breakdown",
    "budget.perElement.locationsTitle": "Location",
    "budget.perElement.vehiclesTitle": "Vehicles",

    // Misc widget
    "budget.misc.title": "Sundry & incidentals",

    // Department labels (crew)
    "budget.dept.regia": "Directing",
    "budget.dept.fotografia": "Cinematography",
    "budget.dept.suono": "Sound",
    "budget.dept.arte": "Art",
    "budget.dept.costumi": "Costumes",
    "budget.dept.trucco": "Make-up",
    "budget.dept.produzione": "Production",

    // Fiscal regime labels (resource row select)
    "budget.regime.piva": "VAT no.",
    "budget.regime.privato": "Private",
    "budget.regime.none": "Net",

    // Rate card fiscal labels
    "budget.fiscal.piva": "VAT no.",
    "budget.fiscal.privato": "Private",
    "budget.fiscal.none": "—",

    // Rate card unit labels
    "budget.unit.giornata": "Day",
    "budget.unit.posa": "Session",
    "budget.unit.forfait": "Flat fee",
  },
  it: {
    // View switcher (Viewbar SegmentedControl)
    "budget.view.overview": "Panoramica",
    "budget.view.category": "Per categoria",
    "budget.view.day": "Per giornata",
    "budget.view.weekly": "Settimane",
    "budget.view.ariaLabel": "Vista budget",

    // Viewbar setting chips + version trigger
    "budget.viewbar.daysLabel": "Giorni",
    "budget.viewbar.contingencyLabel": "Cont.",
    "budget.viewbar.versionFallback": "Versione",
    "budget.viewbar.openVersions": "Apri Versioni →",

    // Section headers / metadata (category, day, weekly)
    "budget.section.allLines": "Tutte le voci",
    "budget.section.allLinesMeta":
      "Modifica diretta · ⌘K per cercare · Tab per saltare campo",
    "budget.section.detailView": "Vista dettagliata",
    "budget.section.byDay": "Per giornata",
    "budget.section.byDayMeta": "{count} giornate",
    "budget.section.byWeek": "Per settimana",
    "budget.section.byWeekMeta":
      "Ripartizione costi della produzione per settimana di ripresa",
    "budget.section.byCategory": "Per categoria",
    "budget.section.departments": "Reparti",
    "budget.section.departmentsMeta":
      "{count} categorie · clicca per dettaglio",
    "budget.section.repartiMeta": "{count} reparti · clicca per dettaglio",
    "budget.section.close": "Chiudi ✕",

    // Empty states
    "budget.empty.configureRatesPrefix": "Configura le tariffe, poi premi",
    "budget.empty.configureRatesRegenerate": "Rigenera",
    "budget.empty.configureRatesSuffix": "per generare il budget.",
    "budget.empty.castDrillNoBudget":
      "Genera il budget per poter gestire il cast.",
    "budget.empty.crewDrillEmpty":
      "Nessun ruolo di troupe — esegui Genera per popolare.",
    "budget.empty.categoryNoBudget":
      "Nessun budget generato — esegui Genera per popolare la categoria.",
    "budget.empty.weekly":
      "Genera lo schedule e il budget per vedere la ripartizione settimanale.",
    "budget.empty.day":
      "Pianifica le giornate nello schedule per vedere il costo per giornata.",
    "budget.empty.chart": "Nessun dato disponibile per il grafico.",
    "budget.empty.perElement": "Nessun elemento trovato nel breakdown.",

    // Back link
    "budget.back.toCategories": "← Torna a tutte le categorie",

    // FloatingDock actions
    "budget.action.regenerate": "Rigenera",
    "budget.action.regenerating": "Generando…",
    "budget.action.export": "Esporta",
    "budget.action.estimatedTotal": "Totale stimato",
    "budget.action.totalChip": "totale",

    // Category card footer
    "budget.category.lines": "voci",

    // Budget cap bar
    "budget.cap.label": "Tetto budget",
    "budget.cap.placeholder": "imposta tetto",
    "budget.cap.inputAriaLabel": "Tetto budget in euro",
    "budget.cap.progressAriaLabel": "Spesa stimata vs tetto",
    "budget.cap.over": "sopra di {amount}",
    "budget.cap.remaining": "restano {amount}",

    // Flat table
    "budget.flat.search": "Cerca voce…",
    "budget.flat.colLine": "Voce",
    "budget.flat.colQty": "Q.tà",
    "budget.flat.colRate": "Tariffa",
    "budget.flat.colTotal": "Totale",
    "budget.flat.colStatus": "Stato",
    "budget.flat.colActions": "Azioni",
    "budget.flat.detailLink": "Vista dettagliata →",
    "budget.flat.noLinesIn": "Nessuna voce in {section}",
    "budget.flat.statusOk": "OK",
    "budget.flat.removeRow": "Rimuovi {name}",
    "budget.flat.confirmRemove": 'Rimuovere "{name}"? Totale: {total}',
    "budget.flat.addRolePlaceholder": "Nuova voce — nome ruolo",
    "budget.flat.addLine": "+ Aggiungi voce",
    "budget.flat.searchDialogAriaLabel": "Cerca voce budget",
    "budget.flat.searchPlaceholder": "Cerca per nome…",
    "budget.flat.noResults": "Nessun risultato",

    // Flat-table section labels
    "budget.section.label.cast": "Cast",
    "budget.section.label.crew": "Troupe",
    "budget.section.label.locations": "Locations",
    "budget.section.label.scenografia": "Scenografia",
    "budget.section.label.costumi": "Costumi",
    "budget.section.label.fotografia": "Fotografia",
    "budget.section.label.suono": "Suono",
    "budget.section.label.vfx": "VFX",
    "budget.section.label.comparse": "Comparse",
    "budget.section.label.vehicles": "Veicoli",
    "budget.section.label.post": "Post-produzione",
    "budget.section.label.contingency": "Contingency",
    "budget.section.label.other": "Altro",

    // Rate card
    "budget.rateCard.title": "Tariffe",
    "budget.rateCard.add": "+ Aggiungi",
    "budget.rateCard.colName": "Nome",
    "budget.rateCard.colRole": "Ruolo",
    "budget.rateCard.colUnit": "Unità",
    "budget.rateCard.colRate": "€ / unità",
    "budget.rateCard.colMeal": "Diaria",
    "budget.rateCard.colAccommodation": "Alloggio",
    "budget.rateCard.colRegime": "Regime",
    "budget.rateCard.edit": "Modifica",
    "budget.rateCard.delete": "Elimina",
    "budget.rateCard.empty":
      "Aggiungi le tariffe prima di generare il budget per pre-popolare cast e troupe con i valori corretti.",
    "budget.rateCard.namePlaceholder": "Nome *",
    "budget.rateCard.rolePlaceholder": "Ruolo",

    // Resource row
    "budget.resource.toggleAriaLabel": "Attiva/disattiva",
    "budget.resource.removeAriaLabel": "Rimuovi",
    "budget.resource.daysUnit": "g",
    "budget.resource.titleMeals": " + vitto/pernotto",
    "budget.resource.privateMultiplier": " ×1.20",
    "budget.resource.scenePortion": " × {percent}% (scena)",

    // Cast widget
    "budget.cast.title": "Cast",
    "budget.cast.empty": "Genera il budget per popolare il cast dal breakdown.",
    "budget.cast.actorNamePlaceholder": "Nome attore",
    "budget.cast.addActor": "+ Aggiungi attore",
    "budget.cast.sceneNote": "Sc.{scene} · costo proporzionale",
    "budget.cast.colActor": "Attore",
    "budget.cast.colDays": "Gg",
    "budget.cast.colDayRate": "€/g",
    "budget.cast.colRegime": "Regime",
    "budget.cast.colMeal": "Vitto",
    "budget.cast.colAccommodation": "Pernotto",
    "budget.cast.colTotal": "Totale",

    // Crew widget
    "budget.crew.title": "Troupe",
    "budget.crew.colActive": "Attivo",
    "budget.crew.colRole": "Ruolo",
    "budget.crew.colDays": "Gg",
    "budget.crew.colDayRate": "€/g",
    "budget.crew.colRegime": "Regime",
    "budget.crew.colMeal": "Vitto",
    "budget.crew.colAccommodation": "Pernotto",
    "budget.crew.colTotal": "Totale",
    "budget.crew.customRoles": "Ruoli custom",
    "budget.crew.roleNamePlaceholder": "Nome ruolo",
    "budget.crew.customOption": "Custom",
    "budget.crew.addRole": "+ Aggiungi ruolo",

    // Shared add/cancel buttons in widgets
    "budget.form.add": "Aggiungi",
    "budget.form.cancel": "Annulla",

    // Day view
    "budget.day.dayPrefix": "Gg {number}",
    "budget.day.cast": "Cast",
    "budget.day.crew": "Crew",
    "budget.day.locations": "Locations",
    "budget.day.vehicles": "Veicoli",
    "budget.day.other": "Altro (ripartito)",
    "budget.day.contingency": "Contingenza",
    "budget.day.total": "Totale giornata",

    // Weekly view
    "budget.weekly.timelineAriaLabel": "Timeline settimane di produzione",
    "budget.weekly.weekTitle": "Settimana {number} · {days} giornate",
    "budget.weekly.weekBarAriaLabel": "Ripartizione costi settimana {number}",
    "budget.weekly.scenes": "{count} scene",
    "budget.weekly.colWeek": "Settimana",
    "budget.weekly.colTotal": "Totale",
    "budget.weekly.rowTotal": "Totale",

    // Weekly category labels
    "budget.weekly.cat.cast": "Cast",
    "budget.weekly.cat.crew": "Troupe",
    "budget.weekly.cat.locations": "Location",
    "budget.weekly.cat.vehicles": "Veicoli",
    "budget.weekly.cat.other": "Altro",
    "budget.weekly.cat.contingency": "Imprevisti",

    // Production drill-down
    "budget.production.subnavAriaLabel": "Sotto-categorie produzione",
    "budget.production.subnavOptionAriaLabel": "Sotto-categoria produzione",
    "budget.production.eyebrow": "Categoria produzione",
    "budget.production.linesTotal": "{count} voci · totale {total}",
    "budget.production.missingRates": " · {count} senza tariffa",
    "budget.production.empty":
      "Nessuna voce per {category}. Genera il budget per popolarla dal breakdown.",
    "budget.production.colLine": "Voce",
    "budget.production.colQty": "Q.tà",
    "budget.production.colUnitRate": "€/u",
    "budget.production.colTotal": "Totale",
    "budget.production.colStatus": "Stato",
    "budget.production.colActions": "Azioni",
    "budget.production.removeLine": "Rimuovi {name}",
    "budget.production.total": "Totale",
    "budget.production.linePlaceholder": "Voce",
    "budget.production.qtyPlaceholder": "Q.tà",
    "budget.production.unitRatePlaceholder": "€/u",
    "budget.production.addConfirm": "Aggiungi",
    "budget.production.addCancel": "Annulla",
    "budget.production.addLineTo": "+ Aggiungi voce a {category}",
    "budget.production.statusOk": "Confermata",
    "budget.production.statusWarn": "Modificata",
    "budget.production.statusMissing": "Senza tariffa",

    // Production tab labels
    "budget.production.tab.locations": "Location",
    "budget.production.tab.fotografia": "Fotografia",
    "budget.production.tab.suono": "Suono",
    "budget.production.tab.scenografia": "Scenografia",
    "budget.production.tab.costumi": "Costumi & Trucco",
    "budget.production.tab.vehicles": "Veicoli",
    "budget.production.tab.comparse": "Comparse",
    "budget.production.tab.vfx": "VFX / SFX",
    "budget.production.tab.stunts": "Stunt",

    // Overview KPIs + cards
    "budget.overview.estimatedTotal": "Totale stimato",
    "budget.overview.deltaVsEstimate": "{delta} vs preventivo",
    "budget.overview.contingencyIncluded": "imprevisti {percent}% inclusa",
    "budget.overview.days": " · {days} giornate",
    "budget.overview.perDayInline": " · {amount}/giorno",
    "budget.overview.categoriesCount": "{count} categorie",
    "budget.overview.kpiCast": "Cast",
    "budget.overview.kpiCrew": "Troupe",
    "budget.overview.kpiProduction": "Produzione",
    "budget.overview.kpiContingency": "Imprevisti",
    "budget.overview.kpiPerDay": "Costo / giornata",
    "budget.overview.kpiPerScene": "Costo / scena",
    "budget.overview.roles": "ruoli",
    "budget.overview.repartiCount": "reparti",
    "budget.overview.contingencyShort": "imp.",
    "budget.overview.daysShort": "{days} gg",
    "budget.overview.notAvailable": "n/d",
    "budget.overview.sceneAverage": "media {count} scene",
    "budget.overview.spendDistribution": "Distribuzione spesa",
    "budget.overview.top5": "top 5 reparti",
    "budget.overview.budgetStatus": "Stato budget",
    "budget.overview.warnings": "{count} avvisi",
    "budget.overview.missingRatesTag": "Rate mancanti",
    "budget.overview.actorsNoDayRate": "{count} attori senza day-rate",
    "budget.overview.setRatesToAvoidZero":
      " — imposta le tariffe per evitare stima a zero.",
    "budget.overview.noRateTag": "Senza tariffa",
    "budget.overview.categoryInBreakdown":
      " — categoria presente nel breakdown ma non ancora stimata.",
    "budget.overview.readyTag": "Pronto",
    "budget.overview.allCovered": "Tutte le categorie sono coperte",
    "budget.overview.readyForLock": " — il budget è pronto per il lock.",
    "budget.overview.departments": "Reparti",
    "budget.overview.openDetail": "Apri dettaglio {category}",
    "budget.overview.trend": "Andamento {category}",
    "budget.overview.rolesCount": "ruoli",
    "budget.overview.linesCount": "voci",
    "budget.overview.statusComplete": "Completo",
    "budget.overview.statusToConfirm": "Da confermare",
    "budget.overview.statusNoRate": "Senza tariffa",
    "budget.overview.statusLocked": "Locked",
    "budget.overview.statusBadgeAriaLabel": "Stato categoria: {label}",
    "budget.overview.generateToEstimate": "Genera per stimare",

    // Export modal
    "budget.export.title": "Esporta budget",
    "budget.export.cancel": "Annulla",
    "budget.export.generating": "Generazione…",
    "budget.export.generate": "Genera",
    "budget.export.formatLabel": "Formato",

    // Total widget
    "budget.total.title": "Totale progetto",
    "budget.total.cast": "Cast",
    "budget.total.crew": "Troupe",
    "budget.total.production": "Produzione",
    "budget.total.misc": "Varie",
    "budget.total.subtotal": "Subtotale",
    "budget.total.contingency": "Contingenza {percent}%",
    "budget.total.total": "Totale",
    "budget.total.cat.locations": "Locations",
    "budget.total.cat.vehicles": "Veicoli",
    "budget.total.cat.equipment": "Fotografia",
    "budget.total.cat.sound": "Suono",
    "budget.total.cat.props": "Scenografia",
    "budget.total.cat.wardrobe": "Costumi",
    "budget.total.cat.extras": "Comparse",
    "budget.total.cat.vfx": "VFX / SFX",
    "budget.total.cat.stunts": "Stunt",
    "budget.total.cat.animals": "Animali",

    // Category line widget
    "budget.line.elements": "{count} elementi",
    "budget.line.empty": "Genera il budget per popolare questa sezione.",
    "budget.line.elementSingular": "elemento",
    "budget.line.elementPlural": "elementi",
    "budget.line.fromBreakdown": "dal breakdown",
    "budget.line.rate": "Tariffa",
    "budget.line.actual": "Effettivo",

    // Per-element widget (locations / vehicles)
    "budget.perElement.colName": "Nome",
    "budget.perElement.colDays": "Giorni",
    "budget.perElement.colDayRate": "€/giorno",
    "budget.perElement.colActual": "Effettivo",
    "budget.perElement.colTotal": "Totale",
    "budget.perElement.removedFromBreakdown": "⚠ rimosso dal breakdown",
    "budget.perElement.locationsTitle": "Location",
    "budget.perElement.vehiclesTitle": "Veicoli",

    // Misc widget
    "budget.misc.title": "Varie ed eventuali",

    // Department labels (crew)
    "budget.dept.regia": "Regia",
    "budget.dept.fotografia": "Fotografia",
    "budget.dept.suono": "Suono",
    "budget.dept.arte": "Arte",
    "budget.dept.costumi": "Costumi",
    "budget.dept.trucco": "Trucco",
    "budget.dept.produzione": "Produzione",

    // Fiscal regime labels (resource row select)
    "budget.regime.piva": "P.IVA",
    "budget.regime.privato": "Privato",
    "budget.regime.none": "Netto",

    // Rate card fiscal labels
    "budget.fiscal.piva": "P.IVA",
    "budget.fiscal.privato": "Privato",
    "budget.fiscal.none": "—",

    // Rate card unit labels
    "budget.unit.giornata": "Giornata",
    "budget.unit.posa": "Posa",
    "budget.unit.forfait": "Forfait",
  },
} as const satisfies LocaleDict;
