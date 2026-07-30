import type { LocaleDict } from "./types.js";

/** breakdown feature keys. Filled by the i18n bulk extraction (Spec 18b PR-5+). */
export const breakdownKeys = {
  en: {
    // Loading / skeleton
    "breakdown.loading": "Loading breakdown",
    "breakdown.loadingTable": "Loading breakdown table",
    "breakdown.loadingMatrix": "Loading breakdown matrix",

    // Page-level banners
    "breakdown.staleBanner":
      "The active screenplay version changed — regenerate the breakdown to realign it.",
    "breakdown.autoSpoglioBanner": "Auto-breakdown in progress…",
    "breakdown.noVersionAvailable": "No version available for this screenplay.",

    // Viewbar
    "breakdown.tab.perScene": "Per scene",
    "breakdown.tab.perProject": "Per project",
    "breakdown.tab.matrix": "Matrix",
    "breakdown.viewAriaLabel": "Breakdown view",
    "breakdown.scope.aria": "Scene scope",
    "breakdown.scope.single": "Single scene",
    "breakdown.scope.full": "Full script",
    "breakdown.underline": "Underline",
    "breakdown.underlineCategoriesAria": "Underlined categories",
    "breakdown.underlineShowPrefix": "Show underlines",
    "breakdown.searchScenePlaceholder": "Search scene or location…",
    "breakdown.searchSceneAria": "Search scene",
    "breakdown.noSceneFound": "No scene found.",

    // Underline chip labels
    "breakdown.chip.cast": "Cast",
    "breakdown.chip.locations": "Location",
    "breakdown.chip.props": "Props",
    "breakdown.chip.costumes": "Costumes",
    "breakdown.chip.photography": "Photography",
    "breakdown.chip.sound": "Sound",

    // Hover tooltip + context menu
    "breakdown.accept": "Accept",
    "breakdown.discard": "Discard",
    "breakdown.removeFromScene": "Remove from scene",
    "breakdown.selectSceneToRemove": "Select a scene to remove",
    "breakdown.element": "Element",
    "breakdown.elementActionsAria": "Element actions",
    "breakdown.confirmElement": "Confirm element",
    "breakdown.changeCategory": "Change category",
    "breakdown.editName": "Edit name",
    "breakdown.removeFromBreakdown": "Remove from breakdown",
    "breakdown.newElementNameAria": "New element name",

    // Action feedback (toasts)
    "breakdown.feedback.confirmedPrefix": "Confirmed «",
    "breakdown.feedback.confirmedSuffix": "»",
    "breakdown.feedback.discardedPrefix": "Discarded «",
    "breakdown.feedback.discardedSuffix": "»",
    "breakdown.feedback.removedPrefix": "Removed «",
    "breakdown.feedback.removedSuffix": "»",
    "breakdown.feedback.renamedPrefix": "Renamed «",
    "breakdown.feedback.renamedMid": "» → «",
    "breakdown.feedback.renamedSuffix": "»",
    "breakdown.feedback.recategorizedArrow": "» → ",
    "breakdown.feedback.recategorizedPrefix": "«",

    // FloatingDock
    "breakdown.respoglioWithAi": "Re-run breakdown with AI",
    "breakdown.respoglio.confirmTitle": "Re-run the AI breakdown?",
    "breakdown.respoglio.confirmMessage":
      "This regenerates the breakdown for every scene. Elements you confirmed manually are kept; the AI pass re-runs over the script.",
    "breakdown.respoglio.confirmAction": "Re-run",
    "breakdown.export": "Export",

    // Common actions
    "breakdown.cancel": "Cancel",
    "breakdown.save": "Save",
    "breakdown.saving": "Saving…",

    // ProjectBreakdownView — KPI strip
    "breakdown.summaryAria": "Breakdown summary",
    "breakdown.kpi.totalElements": "Total elements",
    "breakdown.kpi.confirmed": "Confirmed",
    "breakdown.kpi.pending": "Pending",
    "breakdown.kpi.toConfirm": "to confirm",
    "breakdown.kpi.stale": "Stale",
    "breakdown.kpi.changedScenes": "changed scenes",
    "breakdown.kpi.estimatedCost": "Estimated cost",
    "breakdown.kpi.rateNotLinked": "rate not linked",

    // Duplicates card
    "breakdown.dup.singularSuffix": " possible duplicate detected",
    "breakdown.dup.pluralSuffix": " possible duplicates detected",
    "breakdown.dup.ignore": "Ignore",
    "breakdown.dup.reviewAndMerge": "Review and merge",
    "breakdown.dup.mergeTitlePrefix": "Merge ",
    "breakdown.dup.mergeTitleSuffix": " variants?",
    "breakdown.dup.mergeMessageSuffix":
      " will be consolidated into a single element.",
    "breakdown.dup.mergeConfirm": "Merge",

    // Toolbar / filters
    "breakdown.searchElementPlaceholderShort": "Search element…",
    "breakdown.searchElementPlaceholder": "Search element, description… (⌘K)",
    "breakdown.categoryFiltersAria": "Category filters",
    "breakdown.statusLabel": "Status:",
    "breakdown.filterByStatusAria": "Filter by status",
    "breakdown.filter.all": "all",
    "breakdown.filter.confirmed": "confirmed",
    "breakdown.filter.pending": "pending",
    "breakdown.filter.stale": "stale",
    "breakdown.sourceLabel": "Source:",
    "breakdown.filterBySourceAria": "Filter by source",
    "breakdown.filter.allSources": "all",
    "breakdown.exportCsv": "↓ Export CSV",
    "breakdown.exportCsvPlain": "Export CSV",

    // Bulk bar
    "breakdown.bulk.selectedSingular": "selected",
    "breakdown.bulk.selectedPlural": "selected",
    "breakdown.bulk.confirm": "Confirm",
    "breakdown.bulk.rename": "Rename…",
    "breakdown.bulk.archive": "Archive",
    "breakdown.bulk.recategorizeLabel": "Recategorize:",
    "breakdown.bulk.recategorizeAria": "Recategorize to",
    "breakdown.bulk.choose": "choose…",
    "breakdown.bulk.renamePrompt": "New name for the selected elements",
    "breakdown.bulk.renameTitle": "Rename elements",
    "breakdown.bulk.renameConfirm": "Rename",
    "breakdown.bulk.archiveTitlePrefix": "Archive ",
    "breakdown.bulk.archiveTitleSingularSuffix": " element?",
    "breakdown.bulk.archiveTitlePluralSuffix": " elements?",
    "breakdown.bulk.archiveMessage":
      "Archived elements no longer appear in the breakdown.",
    "breakdown.bulk.archiveMessageTable":
      "Archived elements do not appear in the table.",
    "breakdown.bulk.archiveConfirm": "Archive",

    // Groups
    "breakdown.noElementFound": "No element found.",
    "breakdown.group.elementsSuffix": "elements",
    "breakdown.group.pendingSuffix": "pending",
    "breakdown.group.staleSuffix": "stale",
    "breakdown.footnote.elements": "elements",
    "breakdown.footnote.categories": "categories",
    "breakdown.footnote.hints": "J/K navigate · space selects · ⌘K search",

    // Category table headers
    "breakdown.table.tier": "Tier",
    "breakdown.table.type": "Type",
    "breakdown.table.description": "Description",
    "breakdown.table.selectionAria": "Selection",
    "breakdown.table.name": "Name",
    "breakdown.table.scenes": "Scenes",
    "breakdown.table.range": "Range",
    "breakdown.table.source": "Source",
    "breakdown.table.status": "Status",
    "breakdown.table.estimatedCost": "Est. cost",
    "breakdown.table.category": "Category",
    "breakdown.table.quantity": "Quantity",
    "breakdown.selectRowPrefix": "Select ",
    "breakdown.status.accepted": "accepted",
    "breakdown.status.pending": "pending",
    "breakdown.status.stale": "stale",

    // Source labels
    "breakdown.source.cesare": "Cesare",
    "breakdown.source.regex": "Regex",
    "breakdown.source.manual": "Manual",

    // ProjectBreakdownTable
    "breakdown.table.loading": "Loading breakdown table",
    "breakdown.table.searchElementPlaceholder": "Search element…",
    "breakdown.table.allStates": "All states",
    "breakdown.table.optAccepted": "✓ Accepted",
    "breakdown.table.optPending": "• Pending",
    "breakdown.table.optStale": "⚠ Stale",
    "breakdown.table.bulkSelected": "selected",
    "breakdown.table.recategorize": "Recategorize ▾",
    "breakdown.table.selectAllAria": "Select all",
    "breakdown.table.archive": "Archive",
    "breakdown.table.archiveElementTitle": "Archive element?",
    "breakdown.table.archiveElementMessage": "Archive this element?",
    "breakdown.table.archiveConfirm": "Archive",
    "breakdown.table.scenesChanged": "Some scenes changed",
    "breakdown.table.awaitingConfirmation": "Awaiting confirmation",
    "breakdown.table.accepted": "Accepted",

    // Matrix
    "breakdown.matrix.editPresenceAria": "Edit presence",
    "breakdown.matrix.quantity": "Quantity",
    "breakdown.matrix.remove": "Remove",
    "breakdown.matrix.cancel": "Cancel",
    "breakdown.matrix.update": "Update",
    "breakdown.matrix.add": "Add",
    "breakdown.matrix.empty":
      "No elements in the breakdown. Start the breakdown to populate the matrix.",
    "breakdown.matrix.heatmap": "Heatmap",
    "breakdown.matrix.compactView": "Compact view",

    // AddElementModal
    "breakdown.addElement.title": "Add element",
    "breakdown.addElement.cancel": "Cancel",
    "breakdown.addElement.saving": "Saving…",
    "breakdown.addElement.add": "Add",
    "breakdown.addElement.name": "Name",
    "breakdown.addElement.category": "Category",
    "breakdown.addElement.tier": "Tier",
    "breakdown.addElement.quantity": "Quantity",

    // ExportBreakdownModal
    "breakdown.exportModal.title": "Export breakdown",
    "breakdown.exportModal.cancel": "Cancel",
    "breakdown.exportModal.generating": "Generating…",
    "breakdown.exportModal.generate": "Generate",
    "breakdown.exportModal.format": "Format",

    // GhostPopover
    "breakdown.ghost.cesareSuggestionAria": "Cesare suggestion",
    "breakdown.ghost.cesareSuggestion": "Cesare suggestion",
    "breakdown.ghost.accept": "Accept",
    "breakdown.ghost.ignore": "Ignore",

    // CesareAdPanel
    "breakdown.ad.severity.critical": "Critical",
    "breakdown.ad.severity.warn": "Warning",
    "breakdown.ad.severity.info": "Info",
    "breakdown.ad.kind.continuity": "Continuity",
    "breakdown.ad.kind.riskFlag": "Production risk",
    "breakdown.ad.kind.coverageGap": "Coverage",
    "breakdown.ad.kind.locationConsolidate": "Location",
    "breakdown.ad.empty": "No production alerts on this view.",
    "breakdown.ad.openScenePrefix": "Open scene ",
    "breakdown.ad.ignore": "Ignore",

    // CesareSuggestionBanner
    "breakdown.suggestion.foundPrefix": "Cesare found ",
    "breakdown.suggestion.foundSingularSuffix": " element to confirm",
    "breakdown.suggestion.foundPluralSuffix": " elements to confirm",
    "breakdown.suggestion.acceptAll": "Accept all",
    "breakdown.suggestion.ignoreAll": "Ignore all",

    // BreakdownPanel
    "breakdown.panel.selectScene": "Select a scene.",
    "breakdown.panel.elementsScenePrefix": "Scene elements ",
    "breakdown.panel.cesareLoading": "Cesare…",
    "breakdown.panel.suggest": "Suggest",
    "breakdown.panel.add": "Add",
    "breakdown.panel.cesareUnavailable": "Cesare is not available right now.",
    "breakdown.panel.noElementYet": "No elements yet.",
    "breakdown.panel.staleTitle": "No longer found in the text",
    "breakdown.panel.unassigned": "Unassigned",

    // SceneCostPanel
    "breakdown.cost.calculating": "Calculating scene cost…",
    "breakdown.cost.estimated": "Estimated cost",
    "breakdown.cost.scenePrefix": "Sc. ",
    "breakdown.cost.perDay": "/ day",
    "breakdown.cost.difficulty": "Difficulty",
    "breakdown.cost.difficultyAriaPrefix": "Difficulty ",
    "breakdown.cost.difficulty.veryLow": "very low",
    "breakdown.cost.difficulty.low": "low",
    "breakdown.cost.difficulty.medium": "medium",
    "breakdown.cost.difficulty.high": "high",
    "breakdown.cost.difficulty.veryHigh": "very high",
    "breakdown.cost.askCesare": "Ask Cesare",
    "breakdown.cost.adding": "Adding…",
    "breakdown.cost.addToBudget": "Add to budget",
    "breakdown.cost.addError": "Error while adding to budget",
    "breakdown.cost.added": "Lines added to budget.",

    // SceneTOC
    "breakdown.toc.empty": "No scene in the screenplay.",

    // ScriptReader
    "breakdown.reader.empty": "No version available for this screenplay.",

    // SearchBar
    "breakdown.search.noResult": "No result",
    "breakdown.search.placeholder": "Search…",
    "breakdown.search.aria": "Search in the script",
    "breakdown.search.prevAria": "Previous result",
    "breakdown.search.prevTitle": "Previous (Shift+Enter)",
    "breakdown.search.nextAria": "Next result",
    "breakdown.search.nextTitle": "Next (Enter)",
    "breakdown.search.closeAria": "Close search",
    "breakdown.search.closeTitle": "Close (Esc)",

    // VersionImportBanner
    "breakdown.importBanner.sceneSingularSuffix":
      " scene contains elements that may no longer be present after the import.",
    "breakdown.importBanner.scenePluralSuffix":
      " scenes contain elements that may no longer be present after the import.",
  },
  it: {
    // Loading / skeleton
    "breakdown.loading": "Caricamento spoglio",
    "breakdown.loadingTable": "Caricamento tabella spoglio",
    "breakdown.loadingMatrix": "Caricamento matrice spoglio",

    // Page-level banners
    "breakdown.staleBanner":
      "La versione attiva della sceneggiatura è cambiata — rigenera il breakdown per allinearlo.",
    "breakdown.autoSpoglioBanner": "Auto-spoglio in corso…",
    "breakdown.noVersionAvailable":
      "Nessuna versione disponibile per questa sceneggiatura.",

    // Viewbar
    "breakdown.tab.perScene": "Per scena",
    "breakdown.tab.perProject": "Per progetto",
    "breakdown.tab.matrix": "Matrice",
    "breakdown.viewAriaLabel": "Vista breakdown",
    "breakdown.scope.aria": "Ambito scena",
    "breakdown.scope.single": "Scena singola",
    "breakdown.scope.full": "Copione intero",
    "breakdown.underline": "Sottolinea",
    "breakdown.underlineCategoriesAria": "Categorie sottolineate",
    "breakdown.underlineShowPrefix": "Mostra sottolineature",
    "breakdown.searchScenePlaceholder": "Cerca scena o luogo…",
    "breakdown.searchSceneAria": "Cerca scena",
    "breakdown.noSceneFound": "Nessuna scena trovata.",

    // Underline chip labels
    "breakdown.chip.cast": "Cast",
    "breakdown.chip.locations": "Location",
    "breakdown.chip.props": "Oggetti di scena",
    "breakdown.chip.costumes": "Costumi",
    "breakdown.chip.photography": "Fotografia",
    "breakdown.chip.sound": "Suono",

    // Hover tooltip + context menu
    "breakdown.accept": "Accetta",
    "breakdown.discard": "Scarta",
    "breakdown.removeFromScene": "Rimuovi dalla scena",
    "breakdown.selectSceneToRemove": "Seleziona una scena per rimuovere",
    "breakdown.element": "Elemento",
    "breakdown.elementActionsAria": "Azioni elemento",
    "breakdown.confirmElement": "Conferma elemento",
    "breakdown.changeCategory": "Cambia categoria",
    "breakdown.editName": "Modifica nome",
    "breakdown.removeFromBreakdown": "Rimuovi dallo spoglio",
    "breakdown.newElementNameAria": "Nuovo nome elemento",

    // Action feedback (toasts)
    "breakdown.feedback.confirmedPrefix": "Confermato «",
    "breakdown.feedback.confirmedSuffix": "»",
    "breakdown.feedback.discardedPrefix": "Scartato «",
    "breakdown.feedback.discardedSuffix": "»",
    "breakdown.feedback.removedPrefix": "Rimosso «",
    "breakdown.feedback.removedSuffix": "»",
    "breakdown.feedback.renamedPrefix": "Rinominato «",
    "breakdown.feedback.renamedMid": "» → «",
    "breakdown.feedback.renamedSuffix": "»",
    "breakdown.feedback.recategorizedArrow": "» → ",
    "breakdown.feedback.recategorizedPrefix": "«",

    // FloatingDock
    "breakdown.respoglioWithAi": "Ri-spogliare con AI",
    "breakdown.respoglio.confirmTitle": "Ri-eseguire lo spoglio con l'AI?",
    "breakdown.respoglio.confirmMessage":
      "Rigenera lo spoglio per tutte le scene. Gli elementi che hai confermato a mano restano; la passata AI viene rieseguita sullo script.",
    "breakdown.respoglio.confirmAction": "Ri-spoglia",
    "breakdown.export": "Esporta",

    // Common actions
    "breakdown.cancel": "Annulla",
    "breakdown.save": "Salva",
    "breakdown.saving": "Salvataggio…",

    // ProjectBreakdownView — KPI strip
    "breakdown.summaryAria": "Riepilogo spoglio",
    "breakdown.kpi.totalElements": "Elementi totali",
    "breakdown.kpi.confirmed": "Confermati",
    "breakdown.kpi.pending": "In sospeso",
    "breakdown.kpi.toConfirm": "da confermare",
    "breakdown.kpi.stale": "Obsoleti",
    "breakdown.kpi.changedScenes": "scene cambiate",
    "breakdown.kpi.estimatedCost": "Costo stimato",
    "breakdown.kpi.rateNotLinked": "tariffa non collegata",

    // Duplicates card
    "breakdown.dup.singularSuffix": " possibile duplicato rilevato",
    "breakdown.dup.pluralSuffix": " possibili duplicati rilevati",
    "breakdown.dup.ignore": "Ignora",
    "breakdown.dup.reviewAndMerge": "Rivedi e unifica",
    "breakdown.dup.mergeTitlePrefix": "Unificare ",
    "breakdown.dup.mergeTitleSuffix": " varianti?",
    "breakdown.dup.mergeMessageSuffix":
      " verranno consolidate in un unico elemento.",
    "breakdown.dup.mergeConfirm": "Unifica",

    // Toolbar / filters
    "breakdown.searchElementPlaceholderShort": "Cerca elemento…",
    "breakdown.searchElementPlaceholder": "Cerca elemento, descrizione… (⌘K)",
    "breakdown.categoryFiltersAria": "Filtri categoria",
    "breakdown.statusLabel": "Stato:",
    "breakdown.filterByStatusAria": "Filtra per stato",
    "breakdown.filter.all": "tutti",
    "breakdown.filter.confirmed": "confermati",
    "breakdown.filter.pending": "in sospeso",
    "breakdown.filter.stale": "obsoleti",
    "breakdown.sourceLabel": "Origine:",
    "breakdown.filterBySourceAria": "Filtra per origine",
    "breakdown.filter.allSources": "tutte",
    "breakdown.exportCsv": "↓ Esporta CSV",
    "breakdown.exportCsvPlain": "Esporta CSV",

    // Bulk bar
    "breakdown.bulk.selectedSingular": "selezionato",
    "breakdown.bulk.selectedPlural": "selezionati",
    "breakdown.bulk.confirm": "Conferma",
    "breakdown.bulk.rename": "Rinomina…",
    "breakdown.bulk.archive": "Archivia",
    "breakdown.bulk.recategorizeLabel": "Ricategorizza:",
    "breakdown.bulk.recategorizeAria": "Ricategorizza in",
    "breakdown.bulk.choose": "scegli…",
    "breakdown.bulk.renamePrompt": "Nuovo nome per gli elementi selezionati",
    "breakdown.bulk.renameTitle": "Rinomina elementi",
    "breakdown.bulk.renameConfirm": "Rinomina",
    "breakdown.bulk.archiveTitlePrefix": "Archiviare ",
    "breakdown.bulk.archiveTitleSingularSuffix": " elemento?",
    "breakdown.bulk.archiveTitlePluralSuffix": " elementi?",
    "breakdown.bulk.archiveMessage":
      "Gli elementi archiviati non appaiono più nello spoglio.",
    "breakdown.bulk.archiveMessageTable":
      "Gli elementi archiviati non appaiono nella tabella.",
    "breakdown.bulk.archiveConfirm": "Archivia",

    // Groups
    "breakdown.noElementFound": "Nessun elemento trovato.",
    "breakdown.group.elementsSuffix": "elementi",
    "breakdown.group.pendingSuffix": "pending",
    "breakdown.group.staleSuffix": "obsoleti",
    "breakdown.footnote.elements": "elementi",
    "breakdown.footnote.categories": "categorie",
    "breakdown.footnote.hints": "J/K naviga · spazio seleziona · ⌘K cerca",

    // Category table headers
    "breakdown.table.tier": "Tier",
    "breakdown.table.type": "Tipo",
    "breakdown.table.description": "Descrizione",
    "breakdown.table.selectionAria": "Selezione",
    "breakdown.table.name": "Nome",
    "breakdown.table.scenes": "Scene",
    "breakdown.table.range": "Range",
    "breakdown.table.source": "Origine",
    "breakdown.table.status": "Stato",
    "breakdown.table.estimatedCost": "Costo stim.",
    "breakdown.table.category": "Categoria",
    "breakdown.table.quantity": "Quantità",
    "breakdown.selectRowPrefix": "Seleziona ",
    "breakdown.status.accepted": "accepted",
    "breakdown.status.pending": "pending",
    "breakdown.status.stale": "obsoleto",

    // Source labels
    "breakdown.source.cesare": "Cesare",
    "breakdown.source.regex": "Regex",
    "breakdown.source.manual": "Manuale",

    // ProjectBreakdownTable
    "breakdown.table.loading": "Caricamento tabella spoglio",
    "breakdown.table.searchElementPlaceholder": "Cerca elemento…",
    "breakdown.table.allStates": "Tutti gli stati",
    "breakdown.table.optAccepted": "✓ Accepted",
    "breakdown.table.optPending": "• Pending",
    "breakdown.table.optStale": "⚠ Obsoleti",
    "breakdown.table.bulkSelected": "selezionati",
    "breakdown.table.recategorize": "Ricategorizza ▾",
    "breakdown.table.selectAllAria": "Seleziona tutti",
    "breakdown.table.archive": "Archivia",
    "breakdown.table.archiveElementTitle": "Archiviare elemento?",
    "breakdown.table.archiveElementMessage": "Archiviare questo elemento?",
    "breakdown.table.archiveConfirm": "Archivia",
    "breakdown.table.scenesChanged": "Alcune scene sono cambiate",
    "breakdown.table.awaitingConfirmation": "In attesa di conferma",
    "breakdown.table.accepted": "Accettato",

    // Matrix
    "breakdown.matrix.editPresenceAria": "Modifica presenza",
    "breakdown.matrix.quantity": "Quantità",
    "breakdown.matrix.remove": "Rimuovi",
    "breakdown.matrix.cancel": "Annulla",
    "breakdown.matrix.update": "Aggiorna",
    "breakdown.matrix.add": "Aggiungi",
    "breakdown.matrix.empty":
      "Nessun elemento nel breakdown. Avvia lo spoglio per popolare la matrice.",
    "breakdown.matrix.heatmap": "Heatmap",
    "breakdown.matrix.compactView": "Vista compatta",

    // AddElementModal
    "breakdown.addElement.title": "Aggiungi elemento",
    "breakdown.addElement.cancel": "Annulla",
    "breakdown.addElement.saving": "Salvataggio…",
    "breakdown.addElement.add": "Aggiungi",
    "breakdown.addElement.name": "Nome",
    "breakdown.addElement.category": "Categoria",
    "breakdown.addElement.tier": "Tier",
    "breakdown.addElement.quantity": "Quantità",

    // ExportBreakdownModal
    "breakdown.exportModal.title": "Esporta breakdown",
    "breakdown.exportModal.cancel": "Annulla",
    "breakdown.exportModal.generating": "Generazione…",
    "breakdown.exportModal.generate": "Genera",
    "breakdown.exportModal.format": "Formato",

    // GhostPopover
    "breakdown.ghost.cesareSuggestionAria": "Suggerimento Cesare",
    "breakdown.ghost.cesareSuggestion": "Suggerimento Cesare",
    "breakdown.ghost.accept": "Accetta",
    "breakdown.ghost.ignore": "Ignora",

    // CesareAdPanel
    "breakdown.ad.severity.critical": "Critico",
    "breakdown.ad.severity.warn": "Attenzione",
    "breakdown.ad.severity.info": "Info",
    "breakdown.ad.kind.continuity": "Continuity",
    "breakdown.ad.kind.riskFlag": "Rischio produzione",
    "breakdown.ad.kind.coverageGap": "Copertura",
    "breakdown.ad.kind.locationConsolidate": "Location",
    "breakdown.ad.empty": "Nessun alert di produzione su questa vista.",
    "breakdown.ad.openScenePrefix": "Apri scena ",
    "breakdown.ad.ignore": "Ignora",

    // CesareSuggestionBanner
    "breakdown.suggestion.foundPrefix": "Cesare ha trovato ",
    "breakdown.suggestion.foundSingularSuffix": " elemento da confermare",
    "breakdown.suggestion.foundPluralSuffix": " elementi da confermare",
    "breakdown.suggestion.acceptAll": "Accetta tutti",
    "breakdown.suggestion.ignoreAll": "Ignora tutti",

    // BreakdownPanel
    "breakdown.panel.selectScene": "Seleziona una scena.",
    "breakdown.panel.elementsScenePrefix": "Elementi scena ",
    "breakdown.panel.cesareLoading": "Cesare…",
    "breakdown.panel.suggest": "Suggerisci",
    "breakdown.panel.add": "Aggiungi",
    "breakdown.panel.cesareUnavailable":
      "Cesare non è disponibile in questo momento.",
    "breakdown.panel.noElementYet": "Nessun elemento ancora.",
    "breakdown.panel.staleTitle": "Non più trovato nel testo",
    "breakdown.panel.unassigned": "Non assegnato",

    // SceneCostPanel
    "breakdown.cost.calculating": "Calcolo costo scena…",
    "breakdown.cost.estimated": "Costo stimato",
    "breakdown.cost.scenePrefix": "Sc. ",
    "breakdown.cost.perDay": "/ giornata",
    "breakdown.cost.difficulty": "Difficoltà",
    "breakdown.cost.difficultyAriaPrefix": "Difficoltà ",
    "breakdown.cost.difficulty.veryLow": "molto bassa",
    "breakdown.cost.difficulty.low": "bassa",
    "breakdown.cost.difficulty.medium": "media",
    "breakdown.cost.difficulty.high": "alta",
    "breakdown.cost.difficulty.veryHigh": "molto alta",
    "breakdown.cost.askCesare": "Chiedi a Cesare",
    "breakdown.cost.adding": "Aggiungo…",
    "breakdown.cost.addToBudget": "Aggiungi al budget",
    "breakdown.cost.addError": "Errore durante l'aggiunta al budget",
    "breakdown.cost.added": "Righe aggiunte al budget.",

    // SceneTOC
    "breakdown.toc.empty": "Nessuna scena nella sceneggiatura.",

    // ScriptReader
    "breakdown.reader.empty":
      "Nessuna versione disponibile per questa sceneggiatura.",

    // SearchBar
    "breakdown.search.noResult": "Nessun risultato",
    "breakdown.search.placeholder": "Cerca…",
    "breakdown.search.aria": "Cerca nello script",
    "breakdown.search.prevAria": "Risultato precedente",
    "breakdown.search.prevTitle": "Precedente (Shift+Enter)",
    "breakdown.search.nextAria": "Risultato successivo",
    "breakdown.search.nextTitle": "Successivo (Enter)",
    "breakdown.search.closeAria": "Chiudi ricerca",
    "breakdown.search.closeTitle": "Chiudi (Esc)",

    // VersionImportBanner
    "breakdown.importBanner.sceneSingularSuffix":
      " scena contengono elementi che potrebbero non essere più presenti dopo l'import.",
    "breakdown.importBanner.scenePluralSuffix":
      " scene contengono elementi che potrebbero non essere più presenti dopo l'import.",
  },
} as const satisfies LocaleDict;
