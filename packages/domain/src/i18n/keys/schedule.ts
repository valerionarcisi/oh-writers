import type { LocaleDict } from "./types.js";

/** schedule feature UI-chrome keys (Spec 18b PR-5+). */
export const scheduleKeys = {
  en: {
    // Shared
    "schedule.close": "Close",
    "schedule.loadingSceneElements": "Loading scene elements",
    "schedule.pagesShort": "pages",
    "schedule.pagesShortBare": "pages",
    "schedule.pageInitial": "p",

    // Day difficulty badge
    "schedule.difficulty.low": "low",
    "schedule.difficulty.midLow": "mid-low",
    "schedule.difficulty.mid": "medium",
    "schedule.difficulty.midHigh": "mid-high",
    "schedule.difficulty.critical": "critical",
    "schedule.difficulty.dayLabel": "day {number}",
    "schedule.difficulty.thisDay": "this day",
    "schedule.difficulty.successWithWeather":
      "Estimated success {clear}% in clear weather, {actual}% with the forecast weather.",
    "schedule.difficulty.successOnly": "Estimated success {actual}%.",
    "schedule.difficulty.ariaLabel":
      "Difficulty {day}: {tone}, {score} out of 5. {probability}",
    "schedule.difficulty.dotsAria": "Difficulty {score} out of 5",
    "schedule.difficulty.label": "Difficulty",
    "schedule.difficulty.successLabel": "Success",
    "schedule.difficulty.weatherLoading": "weather loading",

    // Day location warning banner
    "schedule.locationWarning.dismissAria": "Hide location warning",
    "schedule.locationWarning.ariaLabel": "Location warning for day {number}",
    "schedule.locationWarning.headlineOne":
      "This day has 1 scene with a location not yet confirmed:",
    "schedule.locationWarning.headlineOther":
      "This day has {count} scenes with locations not yet confirmed:",

    // Calendar view
    "schedule.calendar.undatedAria": "Undated days",
    "schedule.calendar.undatedHeading": "Undated",
    "schedule.calendar.dayOne": "day",
    "schedule.calendar.dayOther": "days",
    "schedule.calendar.withoutDate": "without date",
    "schedule.calendar.weeklyAria": "Weekly calendar",
    "schedule.calendar.empty":
      "No days planned. Generate the shooting plan first.",
    "schedule.calendar.scenesShort": "sc",

    // Day view
    "schedule.dayView.empty":
      "No day available. Generate the shooting plan first.",
    "schedule.dayView.navAria": "Navigate days",
    "schedule.dayView.day": "DAY",
    "schedule.dayView.toPlan": "To be planned",
    "schedule.dayView.sceneOne": "scene",
    "schedule.dayView.sceneOther": "scenes",
    "schedule.dayView.crewCall": "Crew call",
    "schedule.dayView.shoot": "Shoot",
    "schedule.dayView.wrap": "Wrap",
    "schedule.dayView.scenesOfDayAria": "Scenes of the day",
    "schedule.dayView.scenesOfDay": "Scenes of the day",
    "schedule.dayView.noScenesAssigned": "No scene assigned to this day.",
    "schedule.dayView.castRequiredAria": "Cast required",
    "schedule.dayView.castRequired": "Cast required · DOOD",
    "schedule.dayView.castPlaceholderBefore":
      "The cast list with makeup times and availability conflicts will be available when the",
    "schedule.dayView.castPlaceholderAfter": "table is added to the schema.",
    "schedule.dayView.locationAria": "Location",
    "schedule.dayView.location": "Location",
    "schedule.dayView.locationOne": "location",
    "schedule.dayView.locationOther": "locations",
    "schedule.dayView.locationDetailsBefore":
      "Address and logistics details available after adding the",
    "schedule.dayView.locationDetailsMid": "field to",
    "schedule.dayView.noPrimaryLocation": "No primary location.",
    "schedule.dayView.departmentsAria": "Departments",
    "schedule.dayView.departments": "Departments",
    "schedule.dayView.departmentsPlaceholderBefore":
      "Camera, lights, sound, costumes, makeup, FX, catering — they will be listed after introducing the",
    "schedule.dayView.departmentsPlaceholderAfter": "field on the strips.",
    "schedule.dayView.notesAria": "Day notes",
    "schedule.dayView.notes": "Day notes",
    "schedule.dayView.notesSaving": "Saving…",
    "schedule.dayView.notesSaved": "Saved",
    "schedule.dayView.notesEmpty": "Empty",
    "schedule.dayView.notesPlaceholder":
      "Reminders for directing, crew, production…",
    "schedule.dayView.sunWeatherAria": "Sun and weather",
    "schedule.dayView.sunWeather": "Sun · weather · magic hour",
    "schedule.dayView.sunWeatherPlaceholderBefore":
      "Sunrise, sunset, magic hour and weather will be pre-computed from",
    "schedule.dayView.sunWeatherPlaceholderAfter":
      "through the weather integration.",

    // Cesare banner
    "schedule.cesareBanner.ariaLabel": "Cesare suggestions",
    "schedule.cesareBanner.suggestionOne": "suggestion",
    "schedule.cesareBanner.suggestionOther": "suggestions",
    "schedule.cesareBanner.ignore": "Ignore",

    // Stub view
    "schedule.stub.eyebrow": "Coming soon",

    // Timeline view
    "schedule.timeline.empty":
      "No days planned. Generate the shooting plan first.",
    "schedule.timeline.withoutLocation": "No location",
    "schedule.timeline.location": "Location",
    "schedule.timeline.dayAria": "Day {number}",
    "schedule.timeline.day": "Day",
    "schedule.timeline.scenesShort": "sc",
    "schedule.timeline.blockTitle": "D{day} · {scenes} scenes · {hours}",

    // Page (SchedulePage)
    "schedule.page.tabStrip": "Strip board",
    "schedule.page.tabDay": "Day",
    "schedule.page.tabDays": "Days",
    "schedule.page.tabWeeks": "Weeks",
    "schedule.page.viewAria": "Shooting plan view",
    "schedule.page.eyebrowPrefix": "SHOOTING PLAN ·",
    "schedule.page.eyebrowScenes": "{scenes} SCENES",
    "schedule.page.dayOne": "DAY",
    "schedule.page.dayOther": "DAYS",
    "schedule.page.total": "total",
    "schedule.page.emptyHint":
      "Generate the shooting plan to organize the scenes into shooting days. Requires a screenplay with scenes.",
    "schedule.page.generatePlan": "Generate plan",
    "schedule.page.dockLabel": "SHOOTING PLAN",
    "schedule.page.regenerate": "Regenerate",
    "schedule.page.generate": "Generate",
    "schedule.page.export": "Export",
    "schedule.page.print": "Print",

    // Scene drawer
    "schedule.sceneDrawer.noBreakdown": "No breakdown element for this scene.",

    // Shooting day column
    "schedule.dayColumn.dayType.travel": "travel",
    "schedule.dayColumn.dayType.rest": "rest",
    "schedule.dayColumn.dayType.prep": "prep",
    "schedule.dayColumn.openDetails": "Open day details",
    "schedule.dayColumn.day": "DAY",
    "schedule.dayColumn.addScene": "Add scene",
    "schedule.dayColumn.addSceneToDay": "Add scene to the day",
    "schedule.dayColumn.noSceneToAdd": "No scene to add",
    "schedule.dayColumn.removeScene": "Remove scene",
    "schedule.dayColumn.removeSceneFromDay": "Remove scene from the day",
    "schedule.dayColumn.noSceneInDay": "No scene in this day",
    "schedule.dayColumn.moveToUnscheduled": "Move to unscheduled",
    "schedule.dayColumn.removeDay": "Remove day",
    "schedule.dayColumn.editDate": "Edit date",
    "schedule.dayColumn.setDate": "Set date",
    "schedule.dayColumn.summaryAria": "Day summary",
    "schedule.dayColumn.scenes": "SCENES",
    "schedule.dayColumn.pages": "PAG",
    "schedule.dayColumn.restDay": "— rest day —",

    // Shooting day drawer
    "schedule.dayDrawer.dayType.shoot": "Shoot",
    "schedule.dayDrawer.dayType.travel": "Travel",
    "schedule.dayDrawer.dayType.rest": "Rest",
    "schedule.dayDrawer.dayType.prep": "Prep",
    "schedule.dayDrawer.dayLabel": "Day {number}",
    "schedule.dayDrawer.capacity": "Day capacity",
    "schedule.dayDrawer.overCapacity": "over capacity",
    "schedule.dayDrawer.noScene": "No scene in this day.",
    "schedule.dayDrawer.restoreAuto": "Restore auto",

    // Strip board
    "schedule.stripBoard.week": "Week",
    "schedule.stripBoard.addDayToWeek": "Add day to this week",
    "schedule.stripBoard.addWeek": "Add week",
    "schedule.stripBoard.addWeekLabel": "+ Add week",
    "schedule.stripBoard.addDay": "Add day",

    // Strip card
    "schedule.stripCard.effortTitle": "Effort: {effort}/5",
    "schedule.stripCard.effortAria": "Effort {effort}",
    "schedule.stripCard.unlock": "Unlock",
    "schedule.stripCard.lock": "Lock",
    "schedule.stripCard.unlockScene": "Unlock scene",
    "schedule.stripCard.lockScene": "Lock scene",

    // Unscheduled tray
    "schedule.unscheduled.title": "Unscheduled",
  },
  it: {
    "schedule.close": "Chiudi",
    "schedule.loadingSceneElements": "Caricamento elementi scena",
    "schedule.pagesShort": "pag.",
    "schedule.pagesShortBare": "pag",
    "schedule.pageInitial": "p",

    "schedule.difficulty.low": "bassa",
    "schedule.difficulty.midLow": "medio-bassa",
    "schedule.difficulty.mid": "media",
    "schedule.difficulty.midHigh": "medio-alta",
    "schedule.difficulty.critical": "critica",
    "schedule.difficulty.dayLabel": "giorno {number}",
    "schedule.difficulty.thisDay": "questa giornata",
    "schedule.difficulty.successWithWeather":
      "Riuscita stimata {clear}% con tempo sereno, {actual}% con il meteo previsto.",
    "schedule.difficulty.successOnly": "Riuscita stimata {actual}%.",
    "schedule.difficulty.ariaLabel":
      "Difficoltà {day}: {tone}, {score} punti su 5. {probability}",
    "schedule.difficulty.dotsAria": "Difficoltà {score} su 5",
    "schedule.difficulty.label": "Difficoltà",
    "schedule.difficulty.successLabel": "Riuscita",
    "schedule.difficulty.weatherLoading": "meteo in caricamento",

    "schedule.locationWarning.dismissAria": "Nascondi avviso location",
    "schedule.locationWarning.ariaLabel":
      "Avviso location per il giorno {number}",
    "schedule.locationWarning.headlineOne":
      "Questa giornata ha 1 scena con location non ancora confermata:",
    "schedule.locationWarning.headlineOther":
      "Questa giornata ha {count} scene con location non ancora confermate:",

    "schedule.calendar.undatedAria": "Giornate non datate",
    "schedule.calendar.undatedHeading": "Non datate",
    "schedule.calendar.dayOne": "giornata",
    "schedule.calendar.dayOther": "giornate",
    "schedule.calendar.withoutDate": "senza data",
    "schedule.calendar.weeklyAria": "Calendario settimanale",
    "schedule.calendar.empty":
      "Nessuna giornata pianificata. Genera prima il piano di lavorazione.",
    "schedule.calendar.scenesShort": "sc",

    "schedule.dayView.empty":
      "Nessuna giornata disponibile. Genera prima il piano di lavorazione.",
    "schedule.dayView.navAria": "Naviga giornate",
    "schedule.dayView.day": "GIORNATA",
    "schedule.dayView.toPlan": "Da pianificare",
    "schedule.dayView.sceneOne": "scena",
    "schedule.dayView.sceneOther": "scene",
    "schedule.dayView.crewCall": "Crew call",
    "schedule.dayView.shoot": "Shoot",
    "schedule.dayView.wrap": "Wrap",
    "schedule.dayView.scenesOfDayAria": "Scene della giornata",
    "schedule.dayView.scenesOfDay": "Scene della giornata",
    "schedule.dayView.noScenesAssigned":
      "Nessuna scena assegnata a questa giornata.",
    "schedule.dayView.castRequiredAria": "Cast richiesto",
    "schedule.dayView.castRequired": "Cast richiesto · DOOD",
    "schedule.dayView.castPlaceholderBefore":
      "L'elenco cast con orari di trucco e conflitti di disponibilità sarà disponibile quando la tabella",
    "schedule.dayView.castPlaceholderAfter": "sarà aggiunta allo schema.",
    "schedule.dayView.locationAria": "Location",
    "schedule.dayView.location": "Location",
    "schedule.dayView.locationOne": "location",
    "schedule.dayView.locationOther": "location",
    "schedule.dayView.locationDetailsBefore":
      "Indirizzo e dettagli logistici disponibili dopo l'aggiunta del campo",
    "schedule.dayView.locationDetailsMid": "a",
    "schedule.dayView.noPrimaryLocation": "Nessuna location dominante.",
    "schedule.dayView.departmentsAria": "Reparti",
    "schedule.dayView.departments": "Reparti",
    "schedule.dayView.departmentsPlaceholderBefore":
      "Camera, luci, suono, costumi, trucco, FX, catering — saranno elencati dopo l'introduzione del campo",
    "schedule.dayView.departmentsPlaceholderAfter": "sulle strip.",
    "schedule.dayView.notesAria": "Note di giornata",
    "schedule.dayView.notes": "Note di giornata",
    "schedule.dayView.notesSaving": "Salvataggio…",
    "schedule.dayView.notesSaved": "Salvate",
    "schedule.dayView.notesEmpty": "Vuote",
    "schedule.dayView.notesPlaceholder":
      "Promemoria per la regia, la troupe, la produzione…",
    "schedule.dayView.sunWeatherAria": "Sole e meteo",
    "schedule.dayView.sunWeather": "Sole · meteo · magic hour",
    "schedule.dayView.sunWeatherPlaceholderBefore":
      "Alba, tramonto, magic hour e meteo verranno pre-calcolati su",
    "schedule.dayView.sunWeatherPlaceholderAfter":
      "tramite l'integrazione meteo.",

    "schedule.cesareBanner.ariaLabel": "Suggerimenti Cesare",
    "schedule.cesareBanner.suggestionOne": "suggerimento",
    "schedule.cesareBanner.suggestionOther": "suggerimenti",
    "schedule.cesareBanner.ignore": "Ignora",

    "schedule.stub.eyebrow": "In arrivo",

    "schedule.timeline.empty":
      "Nessuna giornata pianificata. Genera prima il piano di lavorazione.",
    "schedule.timeline.withoutLocation": "Senza location",
    "schedule.timeline.location": "Location",
    "schedule.timeline.dayAria": "Giornata {number}",
    "schedule.timeline.day": "Giorno",
    "schedule.timeline.scenesShort": "sc",
    "schedule.timeline.blockTitle": "G{day} · {scenes} scene · {hours}",

    "schedule.page.tabStrip": "Spannografo",
    "schedule.page.tabDay": "Giornata",
    "schedule.page.tabDays": "Giorni",
    "schedule.page.tabWeeks": "Settimane",
    "schedule.page.viewAria": "Vista piano di lavorazione",
    "schedule.page.eyebrowPrefix": "PIANO DI RIPRESA ·",
    "schedule.page.eyebrowScenes": "{scenes} SCENE",
    "schedule.page.dayOne": "GIORNATA",
    "schedule.page.dayOther": "GIORNATE",
    "schedule.page.total": "totali",
    "schedule.page.emptyHint":
      "Genera il piano di lavorazione per organizzare le scene in giornate di ripresa. Richiede uno screenplay con scene.",
    "schedule.page.generatePlan": "Genera pianificazione",
    "schedule.page.dockLabel": "PIANO DI RIPRESA",
    "schedule.page.regenerate": "Rigenera",
    "schedule.page.generate": "Genera",
    "schedule.page.export": "Esporta",
    "schedule.page.print": "Stampa",

    "schedule.sceneDrawer.noBreakdown":
      "Nessun elemento di breakdown per questa scena.",

    "schedule.dayColumn.dayType.travel": "viaggio",
    "schedule.dayColumn.dayType.rest": "riposo",
    "schedule.dayColumn.dayType.prep": "prep",
    "schedule.dayColumn.openDetails": "Apri dettagli giorno",
    "schedule.dayColumn.day": "GIORNO",
    "schedule.dayColumn.addScene": "Aggiungi scena",
    "schedule.dayColumn.addSceneToDay": "Aggiungi scena alla giornata",
    "schedule.dayColumn.noSceneToAdd": "Nessuna scena da aggiungere",
    "schedule.dayColumn.removeScene": "Rimuovi scena",
    "schedule.dayColumn.removeSceneFromDay": "Rimuovi scena dalla giornata",
    "schedule.dayColumn.noSceneInDay": "Nessuna scena in questa giornata",
    "schedule.dayColumn.moveToUnscheduled": "Sposta tra le non pianificate",
    "schedule.dayColumn.removeDay": "Rimuovi giorno",
    "schedule.dayColumn.editDate": "Modifica data",
    "schedule.dayColumn.setDate": "Imposta data",
    "schedule.dayColumn.summaryAria": "Riepilogo giornata",
    "schedule.dayColumn.scenes": "SCENE",
    "schedule.dayColumn.pages": "PAG",
    "schedule.dayColumn.restDay": "— giorno di riposo —",

    "schedule.dayDrawer.dayType.shoot": "Riprese",
    "schedule.dayDrawer.dayType.travel": "Viaggio",
    "schedule.dayDrawer.dayType.rest": "Riposo",
    "schedule.dayDrawer.dayType.prep": "Prep",
    "schedule.dayDrawer.dayLabel": "Giorno {number}",
    "schedule.dayDrawer.capacity": "Capacità giornata",
    "schedule.dayDrawer.overCapacity": "oltre la capacità",
    "schedule.dayDrawer.noScene": "Nessuna scena in questo giorno.",
    "schedule.dayDrawer.restoreAuto": "Ripristina auto",

    "schedule.stripBoard.week": "Settimana",
    "schedule.stripBoard.addDayToWeek": "Aggiungi giorno a questa settimana",
    "schedule.stripBoard.addWeek": "Aggiungi settimana",
    "schedule.stripBoard.addWeekLabel": "+ Aggiungi settimana",
    "schedule.stripBoard.addDay": "Aggiungi giorno",

    "schedule.stripCard.effortTitle": "Effort: {effort}/5",
    "schedule.stripCard.effortAria": "Effort {effort}",
    "schedule.stripCard.unlock": "Sblocca",
    "schedule.stripCard.lock": "Blocca",
    "schedule.stripCard.unlockScene": "Sblocca scena",
    "schedule.stripCard.lockScene": "Blocca scena",

    "schedule.unscheduled.title": "Non pianificate",
  },
} as const satisfies LocaleDict;
