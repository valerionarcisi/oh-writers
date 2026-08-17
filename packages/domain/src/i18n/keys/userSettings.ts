import type { LocaleDict } from "./types.js";

/** userSettings feature keys (account / profile / password / language / teams).
 *  Spec 18b PR-5+. */
export const userSettingsKeys = {
  en: {
    // Page header
    "settings.title": "Account settings",
    // Profile validation
    "settings.profile.validation.nameRequired": "Name is required",
    "settings.profile.validation.nameMax": "Maximum 100 characters",
    "settings.profile.validation.urlInvalid": "Invalid URL",
    // Profile
    "settings.profile.saveError": "Error while saving.",
    "settings.profile.sectionTitle": "Profile",
    "settings.profile.avatarAlt": "Avatar",
    "settings.profile.avatarUrlLabel": "Avatar URL",
    "settings.profile.nameLabel": "Name",
    "settings.profile.emailLabel": "Email",
    "settings.profile.saved": "Saved!",
    "settings.profile.saving": "Saving…",
    "settings.profile.save": "Save profile",
    // Password validation
    "settings.password.validation.currentRequired":
      "Enter the current password",
    "settings.password.validation.nextMin":
      "The new password must be at least 8 characters",
    "settings.password.validation.confirmRequired": "Confirm the new password",
    "settings.password.validation.mismatch": "Passwords do not match",
    // Password
    "settings.password.changeError": "Error while changing the password.",
    "settings.password.sectionTitle": "Change password",
    "settings.password.currentLabel": "Current password",
    "settings.password.newLabel": "New password",
    "settings.password.confirmLabel": "Confirm new password",
    "settings.password.updated": "Password updated!",
    "settings.password.saving": "Saving…",
    "settings.password.save": "Update password",
    // Language
    "settings.language.optionIt": "Italiano",
    "settings.language.optionEn": "English",
    "settings.language.sectionTitle": "Language",
    "settings.language.ariaLabel": "Interface language",
    // Teams
    "settings.teams.sectionTitle": "Team",
    "settings.teams.empty": "You are not part of any team.",
    // Account deletion (Spec #127)
    "settings.delete.sectionTitle": "Delete account",
    "settings.delete.description":
      "Permanently deletes your account and all your data. This cannot be undone.",
    "settings.delete.confirmTitle": "Delete account?",
    "settings.delete.confirmBody":
      "This will permanently delete your account and all your projects. This action cannot be undone.",
    "settings.delete.confirmLabel": "Delete forever",
    "settings.delete.cancel": "Cancel",
    "settings.delete.deleting": "Deleting…",
    "settings.delete.error": "Error while deleting the account.",
    // AI section (link to /settings/ai)
    "settings.aiSection.sectionTitle": "AI",
    "settings.aiSection.description":
      "Cesare runs on your own AI account: connect a provider and choose your models.",
    "settings.aiSection.manageLink": "Manage AI settings →",
    // AI usage chart (settings/ai)
    "settings.ai.usage.title": "AI spend — last 14 days",
    "settings.ai.usage.total": "${n} total",
    // AI usage stats (inline in settings/ai)
    "settings.ai.stats.pageTitle": "AI usage statistics",
    "settings.ai.stats.totalCost": "Cost (30 days)",
    "settings.ai.stats.totalCalls": "Calls",
    "settings.ai.stats.totalInputTokens": "Input tokens",
    "settings.ai.stats.totalOutputTokens": "Output tokens",
    "settings.ai.stats.byModel": "By model",
    "settings.ai.stats.byOperation": "By operation",
    "settings.ai.stats.colKey": "Name",
    "settings.ai.stats.colCalls": "Calls",
    "settings.ai.stats.colInput": "Input",
    "settings.ai.stats.colOutput": "Output",
    "settings.ai.stats.colCost": "Cost",
    "settings.ai.stats.empty": "No AI usage recorded in the last 30 days.",
    // AI provider (Spec 84 Wave 3) — connect wizard, disconnected step 1
    "settings.ai.pageTitle": "AI",
    "settings.ai.disconnected.eyebrow": "Cesare, powered by your own account",
    "settings.ai.disconnected.title": "Connect your AI account",
    "settings.ai.disconnected.intro":
      "Oh Writers does not resell AI usage: you connect the provider that pays, we build the tool on top.",
    "settings.ai.disconnected.fact1": "~€5 covers an entire feature film",
    "settings.ai.disconnected.fact2": "The credit is yours on OpenRouter",
    "settings.ai.disconnected.fact3": "No extra subscription",
    "settings.ai.disconnected.ctaPrimary": "Continue on OpenRouter →",
    "settings.ai.disconnected.ctaSecondary": "I already have a key",
    // Manual key form
    "settings.ai.manualKey.title": "Connect with an existing key",
    "settings.ai.manualKey.providerLabel": "Provider",
    "settings.ai.manualKey.providerOpenRouter": "OpenRouter",
    "settings.ai.manualKey.providerAnthropic": "Anthropic",
    "settings.ai.manualKey.keyLabel": "API key",
    "settings.ai.manualKey.keyPlaceholder": "sk-…",
    "settings.ai.manualKey.cancel": "Cancel",
    "settings.ai.manualKey.validate": "Validate and connect",
    "settings.ai.manualKey.validating": "Validating…",
    "settings.ai.manualKey.invalidKey":
      "This key was not accepted by the provider. Check it and try again.",
    "settings.ai.manualKey.keyRequired": "Enter an API key",
    // Errors from the OAuth callback (?error=<code>)
    "settings.ai.error.connection_failed":
      "Something went wrong starting the connection. Try again.",
    "settings.ai.error.provider_denied":
      "The connection was cancelled on OpenRouter.",
    "settings.ai.error.missing_code":
      "The connection did not complete correctly. Try again.",
    "settings.ai.error.missing_state":
      "The connection session expired. Try again.",
    "settings.ai.error.state_invalid":
      "The connection session is no longer valid. Try again.",
    "settings.ai.error.exchange_failed":
      "OpenRouter did not confirm the connection. Try again.",
    "settings.ai.error.save_failed":
      "The key was validated but could not be saved. Try again.",
    "settings.ai.error.retry": "Try again",
    // Connected header + credit check
    "settings.ai.connected.title": "AI account connected",
    "settings.ai.connected.providerOpenRouter": "OpenRouter",
    "settings.ai.connected.providerAnthropic": "Anthropic",
    "settings.ai.connected.keyLabel": "Key",
    "settings.ai.credit.checking": "Checking your balance…",
    "settings.ai.credit.zeroTitle": "Your balance is at zero",
    "settings.ai.credit.zeroMessage":
      "Top up your account on OpenRouter to start using Cesare.",
    "settings.ai.credit.topUp": "Top up on OpenRouter ↗",
    "settings.ai.credit.recheck": "Check again",
    "settings.ai.credit.positiveLabel": "Balance:",
    "settings.ai.credit.notApplicable":
      "Balance not available for this provider.",
    // Model picker
    "settings.ai.models.title": "Choose the models",
    "settings.ai.models.intro":
      "Cesare uses two roles: a fast one for everyday edits, and a quality one for the hardest turns.",
    "settings.ai.models.fastLabel": "Fast",
    "settings.ai.models.qualityLabel": "Quality",
    "settings.ai.models.pricePerFilmSuffix": "€ / feature film",
    "settings.ai.models.changeHint": "Change",
    "settings.ai.models.loadingAria": "Loading model catalogue",
    "settings.ai.models.advancedWarning":
      "Cesare's quality is only guaranteed on the recommended models.",
    "settings.ai.models.searchPlaceholder": "Search the full catalogue…",
    "settings.ai.models.save": "Save models",
    "settings.ai.models.saving": "Saving…",
    "settings.ai.models.saved": "Models saved!",
    "settings.ai.models.loadError":
      "Could not load the model catalogue. Try again.",
    "settings.ai.models.changeAffordance": "Change models",
    // Connected steady-state card
    "settings.ai.steady.title": "AI account",
    "settings.ai.steady.currentModels": "Current models",
    "settings.ai.steady.fastModel": "Fast",
    "settings.ai.steady.qualityModel": "Quality",
    "settings.ai.steady.disconnect": "Disconnect",
    "settings.ai.steady.disconnecting": "Disconnecting…",
    "settings.ai.steady.disconnectConfirmTitle": "Disconnect AI account?",
    "settings.ai.steady.disconnectConfirmMessage":
      "Oh Writers will stop being able to use Cesare until you connect an account again. Your key remains valid on the provider's side — you can revoke it from there.",
    "settings.ai.steady.disconnectConfirmAction": "Disconnect",
  },
  it: {
    // Page header
    "settings.title": "Impostazioni account",
    // Profile validation
    "settings.profile.validation.nameRequired": "Il nome è obbligatorio",
    "settings.profile.validation.nameMax": "Massimo 100 caratteri",
    "settings.profile.validation.urlInvalid": "URL non valido",
    // Profile
    "settings.profile.saveError": "Errore durante il salvataggio.",
    "settings.profile.sectionTitle": "Profilo",
    "settings.profile.avatarAlt": "Avatar",
    "settings.profile.avatarUrlLabel": "URL avatar",
    "settings.profile.nameLabel": "Nome",
    "settings.profile.emailLabel": "Email",
    "settings.profile.saved": "Salvato!",
    "settings.profile.saving": "Salvataggio…",
    "settings.profile.save": "Salva profilo",
    // Password validation
    "settings.password.validation.currentRequired":
      "Inserisci la password attuale",
    "settings.password.validation.nextMin":
      "La nuova password deve avere almeno 8 caratteri",
    "settings.password.validation.confirmRequired":
      "Conferma la nuova password",
    "settings.password.validation.mismatch": "Le password non corrispondono",
    // Password
    "settings.password.changeError": "Errore durante il cambio password.",
    "settings.password.sectionTitle": "Cambia password",
    "settings.password.currentLabel": "Password attuale",
    "settings.password.newLabel": "Nuova password",
    "settings.password.confirmLabel": "Conferma nuova password",
    "settings.password.updated": "Password aggiornata!",
    "settings.password.saving": "Salvataggio…",
    "settings.password.save": "Aggiorna password",
    // Language
    "settings.language.optionIt": "Italiano",
    "settings.language.optionEn": "English",
    "settings.language.sectionTitle": "Lingua",
    "settings.language.ariaLabel": "Lingua dell'interfaccia",
    // Teams
    "settings.teams.sectionTitle": "Team",
    "settings.teams.empty": "Non fai parte di nessun team.",
    // Account deletion (Spec #127)
    "settings.delete.sectionTitle": "Elimina account",
    "settings.delete.description":
      "Elimina definitivamente il tuo account e tutti i tuoi dati. Non puoi annullare l'operazione.",
    "settings.delete.confirmTitle": "Eliminare l'account?",
    "settings.delete.confirmBody":
      "Verranno eliminati definitivamente l'account e tutti i progetti. L'operazione non può essere annullata.",
    "settings.delete.confirmLabel": "Elimina per sempre",
    "settings.delete.cancel": "Annulla",
    "settings.delete.deleting": "Eliminazione…",
    "settings.delete.error": "Errore durante l'eliminazione dell'account.",
    // AI section (link to /settings/ai)
    "settings.aiSection.sectionTitle": "AI",
    "settings.aiSection.description":
      "Cesare funziona con il tuo account AI: collega un provider e scegli i modelli.",
    "settings.aiSection.manageLink": "Gestisci impostazioni AI →",
    // AI usage chart (settings/ai)
    "settings.ai.usage.title": "Consumi AI — ultimi 14 giorni",
    "settings.ai.usage.total": "${n} totali",
    // AI usage stats (inline in settings/ai)
    "settings.ai.stats.pageTitle": "Statistiche di utilizzo AI",
    "settings.ai.stats.totalCost": "Costo (30 giorni)",
    "settings.ai.stats.totalCalls": "Chiamate",
    "settings.ai.stats.totalInputTokens": "Token input",
    "settings.ai.stats.totalOutputTokens": "Token output",
    "settings.ai.stats.byModel": "Per modello",
    "settings.ai.stats.byOperation": "Per operazione",
    "settings.ai.stats.colKey": "Nome",
    "settings.ai.stats.colCalls": "Chiamate",
    "settings.ai.stats.colInput": "Input",
    "settings.ai.stats.colOutput": "Output",
    "settings.ai.stats.colCost": "Costo",
    "settings.ai.stats.empty":
      "Nessun utilizzo AI registrato negli ultimi 30 giorni.",
    // AI provider (Spec 84 Wave 3) — connect wizard, disconnected step 1
    "settings.ai.pageTitle": "AI",
    "settings.ai.disconnected.eyebrow": "Cesare, con il tuo account",
    "settings.ai.disconnected.title": "Collega il tuo account AI",
    "settings.ai.disconnected.intro":
      "Oh Writers non rivende l'uso dell'AI: colleghi tu il provider che paga, noi costruiamo lo strumento sopra.",
    "settings.ai.disconnected.fact1": "~5€ coprono un lungometraggio intero",
    "settings.ai.disconnected.fact2": "Il credito è tuo su OpenRouter",
    "settings.ai.disconnected.fact3": "Nessun abbonamento extra",
    "settings.ai.disconnected.ctaPrimary": "Continua su OpenRouter →",
    "settings.ai.disconnected.ctaSecondary": "Ho già una chiave",
    // Manual key form
    "settings.ai.manualKey.title": "Collega con una chiave esistente",
    "settings.ai.manualKey.providerLabel": "Provider",
    "settings.ai.manualKey.providerOpenRouter": "OpenRouter",
    "settings.ai.manualKey.providerAnthropic": "Anthropic",
    "settings.ai.manualKey.keyLabel": "Chiave API",
    "settings.ai.manualKey.keyPlaceholder": "sk-…",
    "settings.ai.manualKey.cancel": "Annulla",
    "settings.ai.manualKey.validate": "Valida e collega",
    "settings.ai.manualKey.validating": "Verifica…",
    "settings.ai.manualKey.invalidKey":
      "Questa chiave non è stata accettata dal provider. Controllala e riprova.",
    "settings.ai.manualKey.keyRequired": "Inserisci una chiave API",
    // Errors from the OAuth callback (?error=<code>)
    "settings.ai.error.connection_failed":
      "Qualcosa è andato storto avviando la connessione. Riprova.",
    "settings.ai.error.provider_denied":
      "La connessione è stata annullata su OpenRouter.",
    "settings.ai.error.missing_code":
      "La connessione non si è conclusa correttamente. Riprova.",
    "settings.ai.error.missing_state":
      "La sessione di connessione è scaduta. Riprova.",
    "settings.ai.error.state_invalid":
      "La sessione di connessione non è più valida. Riprova.",
    "settings.ai.error.exchange_failed":
      "OpenRouter non ha confermato la connessione. Riprova.",
    "settings.ai.error.save_failed":
      "La chiave è stata validata ma non è stato possibile salvarla. Riprova.",
    "settings.ai.error.retry": "Riprova",
    // Connected header + credit check
    "settings.ai.connected.title": "Account AI collegato",
    "settings.ai.connected.providerOpenRouter": "OpenRouter",
    "settings.ai.connected.providerAnthropic": "Anthropic",
    "settings.ai.connected.keyLabel": "Chiave",
    "settings.ai.credit.checking": "Controllo il tuo saldo…",
    "settings.ai.credit.zeroTitle": "Il tuo saldo è a zero",
    "settings.ai.credit.zeroMessage":
      "Ricarica il tuo account su OpenRouter per iniziare a usare Cesare.",
    "settings.ai.credit.topUp": "Ricarica su OpenRouter ↗",
    "settings.ai.credit.recheck": "Ricontrolla",
    "settings.ai.credit.positiveLabel": "Saldo:",
    "settings.ai.credit.notApplicable":
      "Saldo non disponibile per questo provider.",
    // Model picker
    "settings.ai.models.title": "Scegli i modelli",
    "settings.ai.models.intro":
      "Cesare usa due ruoli: uno veloce per le modifiche di tutti i giorni, uno di qualità per i passaggi più difficili.",
    "settings.ai.models.fastLabel": "Veloce",
    "settings.ai.models.qualityLabel": "Qualità",
    "settings.ai.models.pricePerFilmSuffix": "€ / lungometraggio",
    "settings.ai.models.changeHint": "Cambia",
    "settings.ai.models.loadingAria": "Caricamento catalogo modelli",
    "settings.ai.models.advancedWarning":
      "La qualità di Cesare è garantita solo sui modelli consigliati.",
    "settings.ai.models.searchPlaceholder": "Cerca nel catalogo completo…",
    "settings.ai.models.save": "Salva modelli",
    "settings.ai.models.saving": "Salvataggio…",
    "settings.ai.models.saved": "Modelli salvati!",
    "settings.ai.models.loadError":
      "Non è stato possibile caricare il catalogo modelli. Riprova.",
    "settings.ai.models.changeAffordance": "Cambia modelli",
    // Connected steady-state card
    "settings.ai.steady.title": "Account AI",
    "settings.ai.steady.currentModels": "Modelli attuali",
    "settings.ai.steady.fastModel": "Veloce",
    "settings.ai.steady.qualityModel": "Qualità",
    "settings.ai.steady.disconnect": "Scollega",
    "settings.ai.steady.disconnecting": "Scollegamento…",
    "settings.ai.steady.disconnectConfirmTitle": "Scollegare l'account AI?",
    "settings.ai.steady.disconnectConfirmMessage":
      "Oh Writers non potrà più usare Cesare finché non colleghi di nuovo un account. La tua chiave resta valida sul provider — puoi revocarla da lì.",
    "settings.ai.steady.disconnectConfirmAction": "Scollega",
  },
} as const satisfies LocaleDict;
