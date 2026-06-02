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
    "settings.password.validation.confirmRequired":
      "Confirm the new password",
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
  },
} as const satisfies LocaleDict;
