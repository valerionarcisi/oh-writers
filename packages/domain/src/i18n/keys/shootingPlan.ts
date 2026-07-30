import type { LocaleDict } from "./types.js";

/**
 * shootingPlan feature keys (Spec 18b PR-5+).
 *
 * Interpolated strings keep `{value}` / `{name}` / `{count}` placeholders the
 * call site fills via String.replace — the `t` translator returns plain strings
 * (no param support). Date-locale data (day/month names) and unit abbreviations
 * (h/m) intentionally stay in their existing helpers and are NOT extracted.
 */
export const shootingPlanKeys = {
  en: {
    // Page header
    "shootingPlan.page.eyebrow": "Shooting plan",
    "shootingPlan.page.titleFallback": "Shooting",
    "shootingPlan.page.sceneSingular": "scene",
    "shootingPlan.page.scenePlural": "scenes",
    "shootingPlan.page.shotSingular": "shot",
    "shootingPlan.page.shotPlural": "shots",
    "shootingPlan.page.planned": "planned",
    "shootingPlan.page.plannedSceneSingular": "scene planned",
    "shootingPlan.page.plannedScenePlural": "scenes planned",
    "shootingPlan.page.candidatePlans": "candidate plans",
    "shootingPlan.page.sidebarScenes": "Project scenes",
    "shootingPlan.page.sidebarEmpty":
      "No scene found. Import a screenplay to get started.",
    "shootingPlan.page.sceneNotPlanned": "○ not planned",
    "shootingPlan.page.shotSummary": "shot",
    "shootingPlan.page.selectScene":
      "Select a scene from the list to start planning the shots.",
    "shootingPlan.page.loadingBlocking": "Loading blocking",
    // Toasts
    "shootingPlan.toast.generateError": "Error while generating the plan.",
    "shootingPlan.toast.allHavePlan": "All {count} scenes already have a plan.",
    "shootingPlan.toast.generated":
      "Plan generated: {created} scenes created{skipped}. Estimate: {days}.",
    "shootingPlan.toast.generatedSkipped": ", {count} already existing",
    "shootingPlan.toast.daysSingular": "{count} shooting day",
    "shootingPlan.toast.daysPlural": "{count} shooting days",
    // Dock
    "shootingPlan.dock.prefillAria": "Pre-fill the shots from the breakdown",
    "shootingPlan.dock.toolbarAria": "Plan actions",
    "shootingPlan.dock.label": "Plan",
    "shootingPlan.dock.generateTitle":
      "Generate the shooting plan from all scenes (⇧⌘G)",
    "shootingPlan.dock.generating": "Generating…",
    "shootingPlan.dock.generate": "Generate plan",
    "shootingPlan.dock.prefillTitle":
      "Pre-fill the shots from the breakdown (⇧⌘P)",
    "shootingPlan.dock.exportTitle": "Export the confirmed plan (⌘E)",
    "shootingPlan.dock.export": "Export",
    "shootingPlan.dock.printTitle": "Print for the crew (⌘P)",
    "shootingPlan.dock.print": "Print",
    "shootingPlan.dock.openCesare": "Open Cesare",
    // Calendar grid
    "shootingPlan.calendar.dayAria":
      "Day {day}: {scenes} scenes, {shots} shots",
    "shootingPlan.calendar.sceneAbbr": "sc",
    "shootingPlan.calendar.shotAbbr": "shots",
    "shootingPlan.calendar.openHint": "Open →",
    "shootingPlan.calendar.rest": "Rest",
    "shootingPlan.calendar.daySingular": "day",
    "shootingPlan.calendar.dayPlural": "days",
    "shootingPlan.calendar.scenes": "scenes",
    "shootingPlan.calendar.plannedDuration": "planned",
    "shootingPlan.calendar.week": "Week {value}",
    "shootingPlan.calendar.loading": "Loading calendar",
    "shootingPlan.calendar.noSchedule":
      "No shooting plan found. Generate a plan from the Schedule section.",
    "shootingPlan.calendar.noDays": "No shooting day planned yet.",
    "shootingPlan.calendar.weeks": "Weeks",
    "shootingPlan.calendar.projectTotal": "Project total",
    "shootingPlan.calendar.totalDays": "Days",
    "shootingPlan.calendar.totalScenes": "Scenes",
    "shootingPlan.calendar.totalShots": "Shots",
    "shootingPlan.calendar.totalPlanned": "Planned",
    // Blocking card
    "shootingPlan.blocking.cardAria": "Blocking — SC.{value}",
    "shootingPlan.blocking.previewLabel": "BLOCKING PREVIEW · SC.{value}",
    "shootingPlan.blocking.suggestedBadge": "SUGGESTED",
    "shootingPlan.blocking.comingSoon": "Coming soon",
    "shootingPlan.blocking.view3d": "⌘V 3D view",
    "shootingPlan.blocking.openEditorTitle": "Open blocking editor (⌘B)",
    "shootingPlan.blocking.editor": "⌘B Editor",
    "shootingPlan.blocking.actors": "Actors",
    "shootingPlan.blocking.furnitureTitle": "New furniture",
    "shootingPlan.blocking.furnitureLabel": "Furniture name",
    "shootingPlan.blocking.furnitureDefault": "Furniture",
    "shootingPlan.blocking.camera": "Camera",
    "shootingPlan.blocking.positionSingular": "position",
    "shootingPlan.blocking.positionPlural": "positions",
    "shootingPlan.blocking.legendAria": "Blocking legend",
    "shootingPlan.blocking.legendCamera": "Camera",
    "shootingPlan.blocking.legendCharacter": "Character",
    "shootingPlan.blocking.legendFurniture": "Furniture",
    // Blocking proposal panel
    "shootingPlan.proposal.regionAria": "Blocking proposals from Cesare",
    "shootingPlan.proposal.title": "Cesare suggestion",
    "shootingPlan.proposal.actorSingular": "actor",
    "shootingPlan.proposal.actorPlural": "actors",
    "shootingPlan.proposal.cameraSingular": "camera",
    "shootingPlan.proposal.cameraPlural": "cameras",
    "shootingPlan.proposal.acceptOneAria": "Accept {name}",
    "shootingPlan.proposal.rejectOneAria": "Reject {name}",
    "shootingPlan.proposal.rejectAll": "Reject all",
    "shootingPlan.proposal.applying": "Applying…",
    "shootingPlan.proposal.acceptAll": "Accept all",
    // Blocking canvas / pin
    "shootingPlan.canvas.proposalsAria":
      "Blocking proposals suggested by Cesare",
    "shootingPlan.pin.rotateTitle": "Drag to rotate the camera",
    // Shot detail panel
    "shootingPlan.shotDetail.size": "Size",
    "shootingPlan.shotDetail.movement": "Movement",
    "shootingPlan.shotDetail.camera": "Camera",
    "shootingPlan.shotDetail.minutes": "Minutes",
    "shootingPlan.shotDetail.autoHint": "auto: {value}m",
    "shootingPlan.shotDetail.autoPlaceholder": "{value} (auto)",
    "shootingPlan.shotDetail.resetAuto": "reset auto",
    "shootingPlan.shotDetail.notes": "Notes",
    "shootingPlan.shotDetail.deleteShot": "Delete shot",
    // Script panel
    "shootingPlan.scriptPanel.openAria": "Open screenplay panel",
    "shootingPlan.scriptPanel.collapsedLabel": "SCENE ▶",
    "shootingPlan.scriptPanel.regionAria": "Screenplay panel",
    "shootingPlan.scriptPanel.headerTitle": "Scene {value} — text",
    "shootingPlan.scriptPanel.openScreenplayTitle":
      "Open in the Screenplay editor",
    "shootingPlan.scriptPanel.closeAria": "Close panel",
    "shootingPlan.scriptPanel.notesPlaceholder": "Add scene notes…",
    "shootingPlan.scriptPanel.saving": "saving…",
    "shootingPlan.scriptPanel.notesFooter": "scene notes",
    // Scene fountain panel
    "shootingPlan.sceneFountain.label": "SCENE TEXT",
    "shootingPlan.sceneFountain.loading": "Loading scene text",
    // Plan picker
    "shootingPlan.picker.regionAria": "Visible plans selection",
    "shootingPlan.picker.show": "Show:",
    "shootingPlan.picker.addPlan": "+ plan",
    "shootingPlan.picker.createAs": "Create plan as:",
    "shootingPlan.picker.empty": "Empty",
    "shootingPlan.picker.copyActive": "Copy active plan",
    "shootingPlan.picker.fromPattern": "From pattern…",
    // Plan track
    "shootingPlan.track.active": "ACTIVE",
    "shootingPlan.track.makeActive": "MAKE ACTIVE",
    "shootingPlan.track.suggestedTitle":
      "Auto-generated pattern — edit to customise",
    "shootingPlan.track.suggested": "suggested",
    // Parallel plans editor
    "shootingPlan.editor.activeHidden": "The active plan is hidden —",
    "shootingPlan.editor.show": "show",
    "shootingPlan.editor.hours": "Hours",
    "shootingPlan.editor.endOfDay": "8h end of day",
    // Quick-add toolbar
    "shootingPlan.quickAdd.patternTitle":
      "Adds full coverage (e.g. shot/reverse-shot)",
    "shootingPlan.quickAdd.hint": "⌘D duplicate · ⌫ delete",
    // Pattern menu
    "shootingPlan.pattern.label": "Coverage pattern",
    "shootingPlan.pattern.recommended": "recommended",
    "shootingPlan.pattern.futureTitle": "Available in a future version",
    "shootingPlan.pattern.saveAsPattern": "+ Save current plan as pattern…",
    // Shot context menu
    "shootingPlan.shotMenu.duplicate": "📋 Duplicate",
    "shootingPlan.shotMenu.addReverseTitle":
      "Create the mirror of the shot for the opposite character",
    "shootingPlan.shotMenu.addReverseDisabledTitle":
      "Available only for OTS or MS in 2-character scenes",
    "shootingPlan.shotMenu.addReverse": "↔ Add reverse shot",
    "shootingPlan.shotMenu.moveTo": "→ Move to {name}",
    "shootingPlan.shotMenu.delete": "🗑 Delete",
    // Track context menu
    "shootingPlan.trackMenu.removeGaps": "Remove gaps",
    // Shot block
    "shootingPlan.shotBlock.resizeTitle": "Drag to change duration",
    // Cesare plan banner
    "shootingPlan.banner.regionAria": "Confirm plan",
    "shootingPlan.banner.title": "Which plan do you confirm for the scene?",
    "shootingPlan.banner.subtitle":
      "The {count} plans are mutually exclusive — only one will be executed. Click the number or select from the track.",
    "shootingPlan.banner.confirmTitle": "Confirm {name}",
    // Blocking editor toolbar
    "shootingPlan.editorToolbar.close": "← Close",
    "shootingPlan.editorToolbar.toolSelect": "↖ Select",
    "shootingPlan.editorToolbar.toolWall": "▬ Wall",
    "shootingPlan.editorToolbar.toolFurniture": "□ Furniture",
    "shootingPlan.editorToolbar.toolOpening": "↔ Opening",
    // Blocking editor page
    "shootingPlan.editorPage.layer": "Layer",
    "shootingPlan.editorPage.location": "Location",
    "shootingPlan.editorPage.actors": "Actors",
    "shootingPlan.editorPage.cameras": "Cameras",
  },
  it: {
    // Page header
    "shootingPlan.page.eyebrow": "Piano di ripresa",
    "shootingPlan.page.titleFallback": "Riprese",
    "shootingPlan.page.sceneSingular": "scena",
    "shootingPlan.page.scenePlural": "scene",
    "shootingPlan.page.shotSingular": "inquadratura",
    "shootingPlan.page.shotPlural": "inquadrature",
    "shootingPlan.page.planned": "pianificate",
    "shootingPlan.page.plannedSceneSingular": "scena pianificata",
    "shootingPlan.page.plannedScenePlural": "scene pianificate",
    "shootingPlan.page.candidatePlans": "piani candidati",
    "shootingPlan.page.sidebarScenes": "Scene del progetto",
    "shootingPlan.page.sidebarEmpty":
      "Nessuna scena trovata. Importa una sceneggiatura per iniziare.",
    "shootingPlan.page.sceneNotPlanned": "○ non pianificata",
    "shootingPlan.page.shotSummary": "shot",
    "shootingPlan.page.selectScene":
      "Seleziona una scena dalla lista per iniziare a pianificare le inquadrature.",
    "shootingPlan.page.loadingBlocking": "Caricamento blocking",
    // Toasts
    "shootingPlan.toast.generateError":
      "Errore durante la generazione del piano.",
    "shootingPlan.toast.allHavePlan":
      "Tutte le {count} scene hanno già un piano.",
    "shootingPlan.toast.generated":
      "Piano generato: {created} scene create{skipped}. Stima: {days} di riprese.",
    "shootingPlan.toast.generatedSkipped": ", {count} già esistenti",
    "shootingPlan.toast.daysSingular": "{count} giorno",
    "shootingPlan.toast.daysPlural": "{count} giorni",
    // Dock
    "shootingPlan.dock.prefillAria": "Pre-popola le inquadrature dal breakdown",
    "shootingPlan.dock.toolbarAria": "Azioni piano",
    "shootingPlan.dock.label": "Piano",
    "shootingPlan.dock.generateTitle":
      "Genera il piano di ripresa da tutte le scene (⇧⌘G)",
    "shootingPlan.dock.generating": "Generando…",
    "shootingPlan.dock.generate": "Genera piano",
    "shootingPlan.dock.prefillTitle":
      "Pre-popola le inquadrature dal breakdown (⇧⌘P)",
    "shootingPlan.dock.exportTitle": "Esporta il piano confermato (⌘E)",
    "shootingPlan.dock.export": "Esporta",
    "shootingPlan.dock.printTitle": "Stampa per la troupe (⌘P)",
    "shootingPlan.dock.print": "Stampa",
    "shootingPlan.dock.openCesare": "Apri Cesare",
    // Calendar grid
    "shootingPlan.calendar.dayAria":
      "Giorno {day}: {scenes} scene, {shots} inquadrature",
    "shootingPlan.calendar.sceneAbbr": "sc",
    "shootingPlan.calendar.shotAbbr": "inq",
    "shootingPlan.calendar.openHint": "Apri →",
    "shootingPlan.calendar.rest": "Riposo",
    "shootingPlan.calendar.daySingular": "giorno",
    "shootingPlan.calendar.dayPlural": "giorni",
    "shootingPlan.calendar.scenes": "scene",
    "shootingPlan.calendar.plannedDuration": "pianificate",
    "shootingPlan.calendar.week": "Settimana {value}",
    "shootingPlan.calendar.loading": "Caricamento calendario",
    "shootingPlan.calendar.noSchedule":
      "Nessun piano di lavorazione trovato. Genera un piano dalla sezione Schedule.",
    "shootingPlan.calendar.noDays":
      "Nessun giorno di ripresa pianificato ancora.",
    "shootingPlan.calendar.weeks": "Settimane",
    "shootingPlan.calendar.projectTotal": "Totale progetto",
    "shootingPlan.calendar.totalDays": "Giorni",
    "shootingPlan.calendar.totalScenes": "Scene",
    "shootingPlan.calendar.totalShots": "Inquadrature",
    "shootingPlan.calendar.totalPlanned": "Pianificate",
    // Blocking card
    "shootingPlan.blocking.cardAria": "Blocking — SC.{value}",
    "shootingPlan.blocking.previewLabel": "ANTEPRIMA BLOCKING · SC.{value}",
    "shootingPlan.blocking.suggestedBadge": "SUGGERITO",
    "shootingPlan.blocking.comingSoon": "Prossimamente",
    "shootingPlan.blocking.view3d": "⌘V Vista 3D",
    "shootingPlan.blocking.openEditorTitle": "Apri blocking editor (⌘B)",
    "shootingPlan.blocking.editor": "⌘B Editor",
    "shootingPlan.blocking.actors": "Attori",
    "shootingPlan.blocking.furnitureTitle": "Nuovo mobile",
    "shootingPlan.blocking.furnitureLabel": "Nome del mobile",
    "shootingPlan.blocking.furnitureDefault": "Mobile",
    "shootingPlan.blocking.camera": "Camera",
    "shootingPlan.blocking.positionSingular": "posizione",
    "shootingPlan.blocking.positionPlural": "posizioni",
    "shootingPlan.blocking.legendAria": "Legenda blocking",
    "shootingPlan.blocking.legendCamera": "Camera",
    "shootingPlan.blocking.legendCharacter": "Personaggio",
    "shootingPlan.blocking.legendFurniture": "Arredo",
    // Blocking proposal panel
    "shootingPlan.proposal.regionAria": "Proposte di blocking di Cesare",
    "shootingPlan.proposal.title": "Suggerimento Cesare",
    "shootingPlan.proposal.actorSingular": "attore",
    "shootingPlan.proposal.actorPlural": "attori",
    "shootingPlan.proposal.cameraSingular": "camera",
    "shootingPlan.proposal.cameraPlural": "camere",
    "shootingPlan.proposal.acceptOneAria": "Accetta {name}",
    "shootingPlan.proposal.rejectOneAria": "Scarta {name}",
    "shootingPlan.proposal.rejectAll": "Scarta tutto",
    "shootingPlan.proposal.applying": "Applicando…",
    "shootingPlan.proposal.acceptAll": "Accetta tutto",
    // Blocking canvas / pin
    "shootingPlan.canvas.proposalsAria":
      "Proposte di blocking suggerite da Cesare",
    "shootingPlan.pin.rotateTitle": "Trascina per ruotare la camera",
    // Shot detail panel
    "shootingPlan.shotDetail.size": "Dimensione",
    "shootingPlan.shotDetail.movement": "Movimento",
    "shootingPlan.shotDetail.camera": "Camera",
    "shootingPlan.shotDetail.minutes": "Minuti",
    "shootingPlan.shotDetail.autoHint": "auto: {value}m",
    "shootingPlan.shotDetail.autoPlaceholder": "{value} (auto)",
    "shootingPlan.shotDetail.resetAuto": "reset auto",
    "shootingPlan.shotDetail.notes": "Note",
    "shootingPlan.shotDetail.deleteShot": "Elimina shot",
    // Script panel
    "shootingPlan.scriptPanel.openAria": "Apri pannello sceneggiatura",
    "shootingPlan.scriptPanel.collapsedLabel": "SCENA ▶",
    "shootingPlan.scriptPanel.regionAria": "Pannello sceneggiatura",
    "shootingPlan.scriptPanel.headerTitle": "Scena {value} — testo",
    "shootingPlan.scriptPanel.openScreenplayTitle":
      "Apri nello Screenplay editor",
    "shootingPlan.scriptPanel.closeAria": "Chiudi pannello",
    "shootingPlan.scriptPanel.notesPlaceholder": "Aggiungi note di scena…",
    "shootingPlan.scriptPanel.saving": "salvataggio…",
    "shootingPlan.scriptPanel.notesFooter": "note di scena",
    // Scene fountain panel
    "shootingPlan.sceneFountain.label": "TESTO SCENA",
    "shootingPlan.sceneFountain.loading": "Caricamento testo scena",
    // Plan picker
    "shootingPlan.picker.regionAria": "Selezione piani visibili",
    "shootingPlan.picker.show": "Mostra:",
    "shootingPlan.picker.addPlan": "+ piano",
    "shootingPlan.picker.createAs": "Crea Piano come:",
    "shootingPlan.picker.empty": "Vuoto",
    "shootingPlan.picker.copyActive": "Copia piano attivo",
    "shootingPlan.picker.fromPattern": "Da pattern…",
    // Plan track
    "shootingPlan.track.active": "ATTIVO",
    "shootingPlan.track.makeActive": "RENDI ATTIVO",
    "shootingPlan.track.suggestedTitle":
      "Pattern generato automaticamente — modifica per personalizzare",
    "shootingPlan.track.suggested": "suggerito",
    // Parallel plans editor
    "shootingPlan.editor.activeHidden": "Il piano attivo è nascosto —",
    "shootingPlan.editor.show": "mostra",
    "shootingPlan.editor.hours": "Ore",
    "shootingPlan.editor.endOfDay": "8h fine GG",
    // Quick-add toolbar
    "shootingPlan.quickAdd.patternTitle":
      "Aggiunge una copertura completa (es. campo/controcampo)",
    "shootingPlan.quickAdd.hint": "⌘D duplica · ⌫ elimina",
    // Pattern menu
    "shootingPlan.pattern.label": "Pattern copertura",
    "shootingPlan.pattern.recommended": "consigliato",
    "shootingPlan.pattern.futureTitle": "Disponibile in una versione futura",
    "shootingPlan.pattern.saveAsPattern": "+ Salva piano attuale come pattern…",
    // Shot context menu
    "shootingPlan.shotMenu.duplicate": "📋 Duplica",
    "shootingPlan.shotMenu.addReverseTitle":
      "Crea lo specchio dello shot per il personaggio opposto",
    "shootingPlan.shotMenu.addReverseDisabledTitle":
      "Disponibile solo per OTS o MS in scene a 2 personaggi",
    "shootingPlan.shotMenu.addReverse": "↔ Aggiungi controcampo",
    "shootingPlan.shotMenu.moveTo": "→ Sposta a {name}",
    "shootingPlan.shotMenu.delete": "🗑 Elimina",
    // Track context menu
    "shootingPlan.trackMenu.removeGaps": "Rimuovi spazi",
    // Shot block
    "shootingPlan.shotBlock.resizeTitle": "Trascina per cambiare durata",
    // Cesare plan banner
    "shootingPlan.banner.regionAria": "Conferma piano",
    "shootingPlan.banner.title": "Quale piano confermi per la scena?",
    "shootingPlan.banner.subtitle":
      "I {count} piani sono mutualmente esclusivi — solo uno verrà eseguito. Clicca il numero o seleziona dal track.",
    "shootingPlan.banner.confirmTitle": "Conferma {name}",
    // Blocking editor toolbar
    "shootingPlan.editorToolbar.close": "← Chiudi",
    "shootingPlan.editorToolbar.toolSelect": "↖ Seleziona",
    "shootingPlan.editorToolbar.toolWall": "▬ Parete",
    "shootingPlan.editorToolbar.toolFurniture": "□ Mobile",
    "shootingPlan.editorToolbar.toolOpening": "↔ Apertura",
    // Blocking editor page
    "shootingPlan.editorPage.layer": "Layer",
    "shootingPlan.editorPage.location": "Location",
    "shootingPlan.editorPage.actors": "Attori",
    "shootingPlan.editorPage.cameras": "Camere",
  },
} as const satisfies LocaleDict;
