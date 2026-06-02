import type { LocaleDict } from "./types.js";

/** predictions / Cesare feature keys (chat sheet, sessions, tracer UI labels,
 *  quick prompts, recap strip). Spec 18b PR-5+.
 *
 *  NOTE: the streamed step *semantics* (the `reading/writing/tool/reasoning`
 *  step kinds and the result-card model from `parseToolUpdates`) stay in code —
 *  only the UI labels that surface to the user are extracted here. */
export const predictionsKeys = {
  en: {
    // Page label chips (uppercase, used in Cesare context tags + empty state)
    "cesare.page.soggetto": "TREATMENT OUTLINE",
    "cesare.page.synopsis": "SYNOPSIS",
    "cesare.page.outline": "OUTLINE",
    "cesare.page.treatment": "TREATMENT",
    "cesare.page.screenplay": "SCREENPLAY",
    "cesare.page.breakdown": "BREAKDOWN",
    "cesare.page.budget": "BUDGET",
    "cesare.page.schedule": "SCHEDULE",
    "cesare.page.shootingPlan": "SHOTS",
    "cesare.page.locations": "LOCATIONS",
    // Conversation bubbles + live trace
    "cesare.bubble.sending": "Sending",
    "cesare.bubble.sendFailed": "Send failed",
    "cesare.bubble.replying": "Cesare is replying",
    "cesare.trace.reasoning": "Reasoning",
    "cesare.trace.reading": "Reading",
    "cesare.trace.writing": "Writing",
    "cesare.trace.tool": "Running",
    "cesare.trace.working": "Cesare is working",
    // Sheet — relative time
    "cesare.time.now": "now",
    "cesare.time.minutes": "m",
    "cesare.time.hours": "h",
    "cesare.time.yesterday": "yesterday",
    "cesare.time.days": "d",
    // Sheet — scopes / context / composer
    "cesare.scene": "Scene",
    "cesare.peek.thinking": "thinking…",
    "cesare.peek.waiting": "waiting",
    "cesare.empty.askAbout": "Ask me anything about",
    "cesare.quickPrompts.aria": "Quick suggestions",
    "cesare.sessions.popoverAria": "Cesare sessions",
    "cesare.sessions.empty": "No session",
    "cesare.sessions.new": "+ New session",
    // Quick prompts — soggetto
    "cesare.quick.soggetto.0": "Is the central conflict clear?",
    "cesare.quick.soggetto.1": "Suggest a character arc",
    "cesare.quick.soggetto.2": "How can I make the ending stronger?",
    // Quick prompts — synopsis
    "cesare.quick.synopsis.0": "Is the synopsis effective for a producer?",
    "cesare.quick.synopsis.1": "Summarise in three lines",
    "cesare.quick.synopsis.2": "Make the tone more commercial",
    // Quick prompts — outline
    "cesare.quick.outline.0": "Is there an imbalance between the acts?",
    "cesare.quick.outline.1": "Suggest a twist in the second act",
    "cesare.quick.outline.2": "Compress the redundant scenes",
    // Quick prompts — treatment
    "cesare.quick.treatment.0": "Does the narrative pacing work?",
    "cesare.quick.treatment.1": "Suggest how to improve the transition",
    "cesare.quick.treatment.2": "Identify the weak points",
    // Quick prompts — screenplay
    "cesare.quick.screenplay.0": "Is this scene feasible tomorrow?",
    "cesare.quick.screenplay.1": "Help me write the dialogue",
    "cesare.quick.screenplay.2": "How do I cut the costs of this scene?",
    // Quick prompts — breakdown
    "cesare.quick.breakdown.0": "What costs the most in this scene?",
    "cesare.quick.breakdown.1": "Suggest where to cut",
    "cesare.quick.breakdown.2": "Compare with similar scenes",
    // Quick prompts — budget
    "cesare.quick.budget.0": "Where are we going over?",
    "cesare.quick.budget.1": "Optimise this category",
    "cesare.quick.budget.2": "Estimate the cost of the next day",
    // Quick prompts — schedule
    "cesare.quick.schedule.0": "Optimise the shooting days",
    "cesare.quick.schedule.1": "Group by location",
    "cesare.quick.schedule.2": "How many days are left?",
    // Quick prompts — shooting-plan
    "cesare.quick.shootingPlan.0": "How long does this scene take?",
    "cesare.quick.shootingPlan.1": "Group the shots by setup",
    "cesare.quick.shootingPlan.2": "Optimal shooting order",
    // Quick prompts — locations
    "cesare.quick.locations.0": "Find candidates for this location",
    "cesare.quick.locations.1": "Which geographic area to explore?",
    "cesare.quick.locations.2": "What to check during the location scout?",
    // New-session landing
    "cesare.landing.placeholder": "Ask Cesare anything…",
    "cesare.landing.starterBrainstormLabel": "Explore an idea for the film",
    "cesare.landing.starterBrainstormPrompt":
      "Help me explore an idea for a film: let's brainstorm the theme, the characters and the conflict.",
    "cesare.landing.starterReviewLabel": "Review what I've written so far",
    "cesare.landing.starterReviewPrompt":
      "Take a look at what I've written so far in the project and tell me what works and what to improve.",
    "cesare.landing.heading": "What shall we write today?",
    "cesare.landing.subheading":
      "Cesare helps you write and review your film, step by step.",
    "cesare.landing.suggestionsAria": "Suggestions",
    "cesare.landing.error": "Could not start the session. Please retry.",
    "cesare.landing.startSession": "Start the session",
    "cesare.landing.messageAria": "Message for Cesare",
    // Recap strip
    "cesare.recap.costUnit": "/ day",
    "cesare.recap.adding": "Adding…",
    "cesare.recap.addToBudget": "Add to budget",
    "cesare.recap.aria": "Scene recap",
    "cesare.recap.categoriesAria": "Categories",
    // Session conversation page
    "cesare.session.notFoundTitle": "Session not found",
    "cesare.session.notFoundBody":
      "This conversation does not exist or is not accessible.",
    "cesare.session.loadingAria": "Loading Cesare session",
    "cesare.session.subtitle": "Conversation with Cesare",
    "cesare.session.empty":
      "No message yet in this conversation. Write below to start.",
    "cesare.session.sendMessage": "Send message",
    "cesare.session.composerPlaceholder": "Ask Cesare…",
    "cesare.session.composerAria": "Cesare composer",
    // Sessions landing page
    "cesare.landing.openPrefix": "Open",
    "cesare.landing.newSessionAria": "New Cesare session",
    "cesare.landing.title": "Cesare",
    "cesare.landing.listSubtitle": "Your conversations on this project",
    "cesare.landing.new": "+ New",
    "cesare.landing.loadingAria": "Loading Cesare sessions",
    "cesare.landing.empty": "No session yet. Start one with “+ New”.",
    "cesare.landing.listAria": "Cesare sessions",
    // Next-step chip
    "cesare.nextStep.kicker": "Next step",
    "cesare.nextStep.aria": "Next step:",
  },
  it: {
    // Page label chips (uppercase, used in Cesare context tags + empty state)
    "cesare.page.soggetto": "SOGGETTO",
    "cesare.page.synopsis": "SINOSSI",
    "cesare.page.outline": "SCALETTA",
    "cesare.page.treatment": "TRATTAMENTO",
    "cesare.page.screenplay": "SCENEGGIATURA",
    "cesare.page.breakdown": "BREAKDOWN",
    "cesare.page.budget": "BUDGET",
    "cesare.page.schedule": "CALENDARIO",
    "cesare.page.shootingPlan": "INQUADRATURE",
    "cesare.page.locations": "LOCATION",
    // Conversation bubbles + live trace
    "cesare.bubble.sending": "Invio in corso",
    "cesare.bubble.sendFailed": "Invio non riuscito",
    "cesare.bubble.replying": "Cesare sta rispondendo",
    "cesare.trace.reasoning": "Sto ragionando",
    "cesare.trace.reading": "Sto leggendo",
    "cesare.trace.writing": "Sto scrivendo",
    "cesare.trace.tool": "Eseguo",
    "cesare.trace.working": "Cesare sta lavorando",
    // Sheet — relative time
    "cesare.time.now": "ora",
    "cesare.time.minutes": "m",
    "cesare.time.hours": "h",
    "cesare.time.yesterday": "ieri",
    "cesare.time.days": "g",
    // Sheet — scopes / context / composer
    "cesare.scene": "Scena",
    "cesare.peek.thinking": "sta pensando…",
    "cesare.peek.waiting": "in attesa",
    "cesare.empty.askAbout": "Chiedimi qualunque cosa su",
    "cesare.quickPrompts.aria": "Suggerimenti rapidi",
    "cesare.sessions.popoverAria": "Sessioni Cesare",
    "cesare.sessions.empty": "Nessuna sessione",
    "cesare.sessions.new": "+ Nuova sessione",
    // Quick prompts — soggetto
    "cesare.quick.soggetto.0": "Il conflitto centrale è chiaro?",
    "cesare.quick.soggetto.1": "Suggerisci un arco del personaggio",
    "cesare.quick.soggetto.2": "Come rendere il finale più forte?",
    // Quick prompts — synopsis
    "cesare.quick.synopsis.0": "La sinossi è efficace per un produttore?",
    "cesare.quick.synopsis.1": "Riassumi in tre righe",
    "cesare.quick.synopsis.2": "Rendi il tono più commerciale",
    // Quick prompts — outline
    "cesare.quick.outline.0": "C'è squilibrio tra gli atti?",
    "cesare.quick.outline.1": "Suggerisci un twist al secondo atto",
    "cesare.quick.outline.2": "Compatta le scene ridondanti",
    // Quick prompts — treatment
    "cesare.quick.treatment.0": "Il ritmo narrativo funziona?",
    "cesare.quick.treatment.1": "Suggerisci come migliorare la transizione",
    "cesare.quick.treatment.2": "Identifica i punti deboli",
    // Quick prompts — screenplay
    "cesare.quick.screenplay.0": "Questa scena è fattibile domani?",
    "cesare.quick.screenplay.1": "Aiutami a scrivere il dialogo",
    "cesare.quick.screenplay.2": "Come riduco i costi di questa scena?",
    // Quick prompts — breakdown
    "cesare.quick.breakdown.0": "Cosa costa di più in questa scena?",
    "cesare.quick.breakdown.1": "Suggerisci dove tagliare",
    "cesare.quick.breakdown.2": "Compara con scene simili",
    // Quick prompts — budget
    "cesare.quick.budget.0": "Dove stiamo sforando?",
    "cesare.quick.budget.1": "Ottimizza questa categoria",
    "cesare.quick.budget.2": "Stima il costo della prossima giornata",
    // Quick prompts — schedule
    "cesare.quick.schedule.0": "Ottimizza i giorni di ripresa",
    "cesare.quick.schedule.1": "Raggruppa per location",
    "cesare.quick.schedule.2": "Quanti giorni rimangono?",
    // Quick prompts — shooting-plan
    "cesare.quick.shootingPlan.0": "Quanto tempo ci vuole per questa scena?",
    "cesare.quick.shootingPlan.1": "Raggruppa le inquadrature per setup",
    "cesare.quick.shootingPlan.2": "Ordine ottimale delle riprese",
    // Quick prompts — locations
    "cesare.quick.locations.0": "Trova candidati per questa location",
    "cesare.quick.locations.1": "Quale zona geografica esplorare?",
    "cesare.quick.locations.2": "Cosa controllare durante il sopralluogo?",
    // New-session landing
    "cesare.landing.placeholder": "Chiedi qualunque cosa a Cesare…",
    "cesare.landing.starterBrainstormLabel": "Esplora un'idea per il film",
    "cesare.landing.starterBrainstormPrompt":
      "Aiutami a esplorare un'idea per un film: facciamo brainstorming sul tema, i personaggi e il conflitto.",
    "cesare.landing.starterReviewLabel": "Rivedi cosa ho scritto finora",
    "cesare.landing.starterReviewPrompt":
      "Dai un'occhiata a quello che ho scritto finora nel progetto e dimmi cosa funziona e cosa migliorare.",
    "cesare.landing.heading": "Cosa scriviamo oggi?",
    "cesare.landing.subheading":
      "Cesare ti aiuta a scrivere e revisionare il tuo film, passo dopo passo.",
    "cesare.landing.suggestionsAria": "Suggerimenti",
    "cesare.landing.error": "Impossibile avviare la sessione. Riprova.",
    "cesare.landing.startSession": "Avvia la sessione",
    "cesare.landing.messageAria": "Messaggio per Cesare",
    // Recap strip
    "cesare.recap.costUnit": "/ giornata",
    "cesare.recap.adding": "Aggiungo…",
    "cesare.recap.addToBudget": "Aggiungi al budget",
    "cesare.recap.aria": "Recap scena",
    "cesare.recap.categoriesAria": "Categorie",
    // Session conversation page
    "cesare.session.notFoundTitle": "Sessione non trovata",
    "cesare.session.notFoundBody":
      "Questa conversazione non esiste o non è accessibile.",
    "cesare.session.loadingAria": "Caricamento sessione Cesare",
    "cesare.session.subtitle": "Conversazione con Cesare",
    "cesare.session.empty":
      "Nessun messaggio ancora in questa conversazione. Scrivi qui sotto per iniziare.",
    "cesare.session.sendMessage": "Invia messaggio",
    "cesare.session.composerPlaceholder": "Chiedi a Cesare…",
    "cesare.session.composerAria": "Composer Cesare",
    // Sessions landing page
    "cesare.landing.openPrefix": "Apri",
    "cesare.landing.newSessionAria": "Nuova sessione Cesare",
    "cesare.landing.title": "Cesare",
    "cesare.landing.listSubtitle": "Le tue conversazioni su questo progetto",
    "cesare.landing.new": "+ Nuova",
    "cesare.landing.loadingAria": "Caricamento sessioni Cesare",
    "cesare.landing.empty": "Nessuna sessione ancora. Avviane una con “+ Nuova”.",
    "cesare.landing.listAria": "Sessioni Cesare",
    // Next-step chip
    "cesare.nextStep.kicker": "Prossimo passo",
    "cesare.nextStep.aria": "Prossimo passo:",
  },
} as const satisfies LocaleDict;
