import type { LocaleDict } from "./types.js";

/** documents feature UI-chrome keys (Spec 18b PR-5+). */
export const documentsKeys = {
  en: {
    // AI assistant panel (placeholder, Spec 07)
    "documents.aiPanel.title": "AI assistant",
    "documents.aiPanel.badge": "Spec 07",
    "documents.aiPanel.notice":
      "AI assistance will arrive with Spec 07. The actions below will become active once integrated.",
    "documents.aiPanel.actionTooltip": "Coming with Spec 07",
    "documents.aiPanel.suggestionPlaceholder":
      "Suggestions will appear here after running an action.",
    "documents.aiPanel.action.generateAlternatives": "Generate 3 alternatives",
    "documents.aiPanel.action.makeConcise": "Make more concise",
    "documents.aiPanel.action.strengthenConflict": "Strengthen the conflict",
    "documents.aiPanel.action.expandParagraph": "Expand a paragraph",
    "documents.aiPanel.action.tightenPremise": "Tighten the premise",
    "documents.aiPanel.action.clarifyTheme": "Clarify the theme",
    "documents.aiPanel.action.suggestSceneToAdd": "Suggest a scene to add",
    "documents.aiPanel.action.checkThreeAct": "Check the three-act structure",
    "documents.aiPanel.action.suggestScene": "Suggest a scene",
    "documents.aiPanel.action.findPacingIssues": "Find pacing issues",
    "documents.aiPanel.action.suggestAlternative": "Suggest an alternative",
    "documents.aiPanel.action.expandSection": "Expand a section",
    "documents.aiPanel.action.suggestDialogue": "Suggest dialogue",

    // Loading / status
    "documents.loading.document": "Loading document",
    "documents.loading.notes": "Loading notes",
    "documents.loading.suggestions": "Loading suggestions",

    // Draft banner
    "documents.draftBanner.ariaLabel": "Cesare drafts",
    "documents.draftBanner.readyOne": "✦ Cesare has 1 draft ready",
    "documents.draftBanner.readyMany": "✦ Cesare has {count} drafts ready",
    "documents.draftBanner.hint":
      "Compare, promote to active version, or discard.",
    "documents.draftBanner.hideCompare": "Hide comparison",
    "documents.draftBanner.compare": "Compare",
    "documents.draftBanner.promote": "Promote to active",
    "documents.draftBanner.discard": "Discard",
    "documents.draftBanner.draftFallback": "Draft #{number}",
    "documents.draftBanner.currentVersion": "Current version",
    "documents.draftBanner.cesareDraft": "Cesare draft",
    "documents.draftBanner.noActs": "No acts.",
    "documents.draftBanner.actFallback": "Act {number}",
    "documents.draftBanner.outlineCurrent": "Current",
    "documents.draftBanner.outlineDraft": "Cesare draft",

    // Export PDF modal
    "documents.exportPdf.titleDocument": "Export document",
    "documents.exportPdf.titleFormat": "Export {format}",
    "documents.exportPdf.cancel": "Cancel",
    "documents.exportPdf.generating": "Generating…",
    "documents.exportPdf.generate": "Generate",
    "documents.exportPdf.formatLegend": "Format",
    "documents.exportPdf.includeTitlePage": "Include title page",
    "documents.exportPdf.titlePageHint":
      "Fill in the project title page to enable this option.",

    // Export SIAE modal
    "documents.siae.heading": "Export PDF for SIAE deposit",
    "documents.siae.titleLabel": "Title",
    "documents.siae.genreLabel": "Declared genre",
    "documents.siae.durationLabel": "Estimated duration (minutes)",
    "documents.siae.dateLabel": "Compilation date",
    "documents.siae.notesLabel": "Deposit notes (optional)",
    "documents.siae.notesPlaceholder": "Notes included in the cover page…",
    "documents.siae.authorsHeading": "Authors",
    "documents.siae.addAuthor": "+ Add author",
    "documents.siae.removeAuthor": "Remove",
    "documents.siae.fullNamePlaceholder": "Full name",
    "documents.siae.taxCodePlaceholder": "Tax code (optional)",
    "documents.siae.submit": "Generate PDF",
    "documents.siae.submitting": "Generating…",
    "documents.siae.cancel": "Cancel",
    "documents.siae.genericError": "Something went wrong. Try again.",
    "documents.siae.error.subjectNotFound":
      "Subject not ready: write some content before exporting.",
    "documents.siae.error.forbidden":
      "You do not have permission to export this project.",
    "documents.siae.error.validation": "The SIAE form contains invalid values.",

    // Free narrative editor
    "documents.freeNarrative.placeholder":
      "Write your subject. Use ## to structure it into sections (e.g. ## Premise).",
    "documents.freeNarrative.cartellaOne": "page",
    "documents.freeNarrative.cartellaOther": "pages",
    "documents.freeNarrative.characters": "characters",

    // Logline pill
    "documents.logline.placeholder": "Add a logline to frame the project.",
    "documents.logline.empty": "No logline",
    "documents.logline.openAria": "Open logline",
    "documents.logline.loglineAria": "Logline: {logline}",
    "documents.logline.heading": "Logline",

    // Margin notes column
    "documents.marginNotes.empty": "Start writing to get notes from Cesare.",
    "documents.marginNotes.error": "Could not load notes. Try again later.",
    "documents.marginNotes.none": "No notes right now.",
    "documents.marginNotes.ariaLabel": "Cesare notes",

    // Narrative Cesare panel
    "documents.cesarePanel.empty":
      "Start writing to get suggestions from Cesare.",
    "documents.cesarePanel.error":
      "Could not load suggestions. Try again later.",
    "documents.cesarePanel.ariaLabel": "Cesare notes",
    "documents.cesarePanel.statusAnalyzing": "Analyzing…",
    "documents.cesarePanel.statusError": "Error",
    "documents.cesarePanel.statusNotes": "{count} notes",
    "documents.cesarePanel.statusNoNotes": "No notes",
    "documents.cesarePanel.statusNone": "–",
    "documents.cesarePanel.footerAnalysis": "AI analysis",

    // Narrative docs shell
    "documents.shell.openVersions": "Open Versions →",

    // Narrative editor
    "documents.editor.placeholder.logline":
      "A protagonist who wants a goal, opposed by an antagonist.",
    "documents.editor.placeholder.soggetto": "Start your subject here…",
    "documents.editor.placeholder.synopsis": "Start your synopsis here…",
    "documents.editor.placeholder.treatment": "Start your treatment here…",
    "documents.editor.bulletListAria": "Bullet list",
    "documents.editor.loglineError": "Logline is limited to {max} characters.",
    "documents.editor.readOnly": "Read only",
    "documents.editor.versionFallback": "Version {number}",
    "documents.editor.openVersions": "Open Versions →",
    "documents.editor.exporting": "Exporting…",
    "documents.editor.exportingMenu": "Exporting…",
    "documents.editor.exportPdf": "Export PDF",
    "documents.editor.exportDocx": "Export DOCX",
    "documents.editor.exportingDocx": "Exporting…",
    "documents.editor.exportSiae": "Export SIAE",
    "documents.editor.versions": "Versions",
    "documents.editor.import": "Import",
    "documents.editor.titlePage": "Title page",

    // Outline editor
    "documents.outline.removeCharacterAria": "Remove {character}",
    "documents.outline.charactersPlaceholder": "Characters…",
    "documents.outline.addCharacterAria": "Add character",
    "documents.outline.dragToReorder": "Drag to reorder",
    "documents.outline.sceneHeadingPlaceholder": "INT. PLACE - DAY",
    "documents.outline.sceneHeadingAria": "Scene heading",
    "documents.outline.sceneDescriptionPlaceholder": "Scene description…",
    "documents.outline.sceneDescriptionAria": "Scene description",
    "documents.outline.pagesShort": "pp.",
    "documents.outline.estimatedPagesAria": "Estimated pages",
    "documents.outline.deleteSceneAria": "Delete scene",
    "documents.outline.dragSequence": "Drag sequence",
    "documents.outline.sequenceTitlePlaceholder": "Sequence title…",
    "documents.outline.deleteSequenceAria": "Delete sequence",
    "documents.outline.addScene": "+ Add scene",
    "documents.outline.dragAct": "Drag act",
    "documents.outline.expandAct": "Expand act",
    "documents.outline.collapseAct": "Collapse act",
    "documents.outline.doubleClickToRename": "Double-click to rename",
    "documents.outline.deleteActAria": "Delete act",
    "documents.outline.sequencesScenes":
      "{sequences} sequences · {scenes} scenes",
    "documents.outline.addSequence": "+ Add sequence",
    "documents.outline.empty":
      "No acts. Add the first act to start the outline.",
    "documents.outline.addAct": "+ Add act",

    // Treatment table of contents
    "documents.toc.ariaLabel": "Treatment table of contents",
    "documents.toc.label": "Contents",
    "documents.toc.empty": "Add chapters (H2/H3) to see them here.",

    // Version compare modal
    "documents.versionCompare.close": "Close",

    // Scene drawer (shared close affordance)
    "documents.close": "Close",
  },
  it: {
    "documents.aiPanel.title": "Assistente AI",
    "documents.aiPanel.badge": "Spec 07",
    "documents.aiPanel.notice":
      "L'assistenza AI arriverà con la Spec 07. Le azioni qui sotto saranno attive una volta integrate.",
    "documents.aiPanel.actionTooltip": "In arrivo con la Spec 07",
    "documents.aiPanel.suggestionPlaceholder":
      "I suggerimenti compariranno qui dopo aver eseguito un'azione.",
    "documents.aiPanel.action.generateAlternatives": "Genera 3 alternative",
    "documents.aiPanel.action.makeConcise": "Rendi più conciso",
    "documents.aiPanel.action.strengthenConflict": "Rafforza il conflitto",
    "documents.aiPanel.action.expandParagraph": "Espandi un paragrafo",
    "documents.aiPanel.action.tightenPremise": "Stringi la premessa",
    "documents.aiPanel.action.clarifyTheme": "Chiarisci il tema",
    "documents.aiPanel.action.suggestSceneToAdd":
      "Suggerisci una scena da aggiungere",
    "documents.aiPanel.action.checkThreeAct":
      "Verifica la struttura in tre atti",
    "documents.aiPanel.action.suggestScene": "Suggerisci una scena",
    "documents.aiPanel.action.findPacingIssues": "Individua problemi di ritmo",
    "documents.aiPanel.action.suggestAlternative": "Suggerisci un'alternativa",
    "documents.aiPanel.action.expandSection": "Espandi una sezione",
    "documents.aiPanel.action.suggestDialogue": "Suggerisci dialoghi",

    "documents.loading.document": "Caricamento documento",
    "documents.loading.notes": "Caricamento note",
    "documents.loading.suggestions": "Caricamento suggerimenti",

    "documents.draftBanner.ariaLabel": "Bozze di Cesare",
    "documents.draftBanner.readyOne": "✦ Cesare ha pronto un draft",
    "documents.draftBanner.readyMany": "✦ Cesare ha pronto {count} draft",
    "documents.draftBanner.hint":
      "Confronta, promuovi a versione attiva o scarta.",
    "documents.draftBanner.hideCompare": "Nascondi confronto",
    "documents.draftBanner.compare": "Confronta",
    "documents.draftBanner.promote": "Promuovi a attiva",
    "documents.draftBanner.discard": "Scarta",
    "documents.draftBanner.draftFallback": "Bozza #{number}",
    "documents.draftBanner.currentVersion": "Versione corrente",
    "documents.draftBanner.cesareDraft": "Bozza di Cesare",
    "documents.draftBanner.noActs": "Nessun atto.",
    "documents.draftBanner.actFallback": "Atto {number}",
    "documents.draftBanner.outlineCurrent": "Attuale",
    "documents.draftBanner.outlineDraft": "Bozza Cesare",

    "documents.exportPdf.titleDocument": "Esporta documento",
    "documents.exportPdf.titleFormat": "Esporta {format}",
    "documents.exportPdf.cancel": "Annulla",
    "documents.exportPdf.generating": "Generazione…",
    "documents.exportPdf.generate": "Genera",
    "documents.exportPdf.formatLegend": "Formato",
    "documents.exportPdf.includeTitlePage": "Includi frontespizio",
    "documents.exportPdf.titlePageHint":
      "Compila il frontespizio del progetto per abilitare questa opzione.",

    "documents.siae.heading": "Esporta PDF per deposito SIAE",
    "documents.siae.titleLabel": "Titolo",
    "documents.siae.genreLabel": "Genere dichiarato",
    "documents.siae.durationLabel": "Durata stimata (minuti)",
    "documents.siae.dateLabel": "Data di compilazione",
    "documents.siae.notesLabel": "Note di deposito (opzionale)",
    "documents.siae.notesPlaceholder": "Note incluse nella copertina…",
    "documents.siae.authorsHeading": "Autori",
    "documents.siae.addAuthor": "+ Aggiungi autore",
    "documents.siae.removeAuthor": "Rimuovi",
    "documents.siae.fullNamePlaceholder": "Nome completo",
    "documents.siae.taxCodePlaceholder": "Codice fiscale (opzionale)",
    "documents.siae.submit": "Genera PDF",
    "documents.siae.submitting": "Generazione…",
    "documents.siae.cancel": "Annulla",
    "documents.siae.genericError": "Qualcosa è andato storto. Riprova.",
    "documents.siae.error.subjectNotFound":
      "Soggetto non pronto: scrivi del contenuto prima di esportare.",
    "documents.siae.error.forbidden":
      "Non hai i permessi per esportare questo progetto.",
    "documents.siae.error.validation":
      "Il modulo SIAE contiene valori non validi.",

    "documents.freeNarrative.placeholder":
      "Scrivi il tuo soggetto. Usa ## per strutturarlo in sezioni (es. ## Premessa).",
    "documents.freeNarrative.cartellaOne": "cartella",
    "documents.freeNarrative.cartellaOther": "cartelle",
    "documents.freeNarrative.characters": "caratteri",

    "documents.logline.placeholder":
      "Aggiungi una logline per inquadrare il progetto.",
    "documents.logline.empty": "Nessuna logline",
    "documents.logline.openAria": "Apri logline",
    "documents.logline.loglineAria": "Logline: {logline}",
    "documents.logline.heading": "Logline",

    "documents.marginNotes.empty":
      "Inizia a scrivere per ricevere note da Cesare.",
    "documents.marginNotes.error":
      "Impossibile caricare le note. Riprova più tardi.",
    "documents.marginNotes.none": "Nessuna nota in questo momento.",
    "documents.marginNotes.ariaLabel": "Note di Cesare",

    "documents.cesarePanel.empty":
      "Inizia a scrivere per ricevere suggerimenti da Cesare.",
    "documents.cesarePanel.error":
      "Impossibile caricare i suggerimenti. Riprova più tardi.",
    "documents.cesarePanel.ariaLabel": "Note di Cesare",
    "documents.cesarePanel.statusAnalyzing": "Analisi…",
    "documents.cesarePanel.statusError": "Errore",
    "documents.cesarePanel.statusNotes": "{count} note",
    "documents.cesarePanel.statusNoNotes": "Nessuna nota",
    "documents.cesarePanel.statusNone": "–",
    "documents.cesarePanel.footerAnalysis": "Analisi AI",

    "documents.shell.openVersions": "Apri Versioni →",

    "documents.editor.placeholder.logline":
      "Un protagonista che vuole un obiettivo, ostacolato da un antagonista.",
    "documents.editor.placeholder.soggetto": "Inizia il tuo soggetto qui…",
    "documents.editor.placeholder.synopsis": "Inizia la tua sinossi qui…",
    "documents.editor.placeholder.treatment": "Inizia il tuo trattamento qui…",
    "documents.editor.bulletListAria": "Elenco puntato",
    "documents.editor.loglineError": "Logline is limited to {max} characters.",
    "documents.editor.readOnly": "Read only",
    "documents.editor.versionFallback": "Versione {number}",
    "documents.editor.openVersions": "Apri Versioni →",
    "documents.editor.exporting": "Esportando…",
    "documents.editor.exportingMenu": "Esportazione…",
    "documents.editor.exportPdf": "Esporta PDF",
    "documents.editor.exportDocx": "Esporta DOCX",
    "documents.editor.exportingDocx": "Esportazione…",
    "documents.editor.exportSiae": "Esporta SIAE",
    "documents.editor.versions": "Versioni",
    "documents.editor.import": "Importa",
    "documents.editor.titlePage": "Frontespizio",

    "documents.outline.removeCharacterAria": "Rimuovi {character}",
    "documents.outline.charactersPlaceholder": "Personaggi…",
    "documents.outline.addCharacterAria": "Aggiungi personaggio",
    "documents.outline.dragToReorder": "Trascina per riordinare",
    "documents.outline.sceneHeadingPlaceholder": "INT. LUOGO - GIORNO",
    "documents.outline.sceneHeadingAria": "Intestazione scena",
    "documents.outline.sceneDescriptionPlaceholder": "Descrizione della scena…",
    "documents.outline.sceneDescriptionAria": "Descrizione scena",
    "documents.outline.pagesShort": "pp.",
    "documents.outline.estimatedPagesAria": "Pagine stimate",
    "documents.outline.deleteSceneAria": "Elimina scena",
    "documents.outline.dragSequence": "Trascina sequenza",
    "documents.outline.sequenceTitlePlaceholder": "Titolo sequenza…",
    "documents.outline.deleteSequenceAria": "Elimina sequenza",
    "documents.outline.addScene": "+ Aggiungi scena",
    "documents.outline.dragAct": "Trascina atto",
    "documents.outline.expandAct": "Espandi atto",
    "documents.outline.collapseAct": "Collassa atto",
    "documents.outline.doubleClickToRename": "Doppio click per rinominare",
    "documents.outline.deleteActAria": "Elimina atto",
    "documents.outline.sequencesScenes":
      "{sequences} sequenze · {scenes} scene",
    "documents.outline.addSequence": "+ Aggiungi sequenza",
    "documents.outline.empty":
      "Nessun atto. Aggiungi il primo atto per iniziare la scaletta.",
    "documents.outline.addAct": "+ Aggiungi atto",

    "documents.toc.ariaLabel": "Indice del trattamento",
    "documents.toc.label": "Indice",
    "documents.toc.empty": "Aggiungi capitoli (H2/H3) per vederli qui.",

    "documents.versionCompare.close": "Chiudi",

    "documents.close": "Chiudi",
  },
} as const satisfies LocaleDict;
