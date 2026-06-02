import type { LocaleDict } from "./types.js";

/** auth feature keys (login / register). Spec 18b PR-5+. */
export const authKeys = {
  en: {
    // Login — validation
    "auth.validation.emailInvalid": "Enter a valid email address",
    "auth.validation.passwordRequired": "Password is required",
    "auth.validation.emailInvalidShort": "Invalid email",
    "auth.validation.passwordRequiredShort": "Password required",
    // Login — flow
    "auth.error.invalidCredentials": "Incorrect email or password",
    "auth.login.headingSignIn": "Sign in",
    "auth.login.headingWelcomeBack": "Welcome back",
    "auth.login.changeEmail": "Change",
    "auth.field.email": "Email",
    "auth.field.password": "Password",
    "auth.placeholder.email": "you@example.com",
    "auth.action.continue": "Continue",
    "auth.divider.or": "or",
    "auth.oauth.continueGoogle": "Continue with Google",
    "auth.oauth.continueGithub": "Continue with GitHub",
    "auth.login.submitting": "Signing in…",
    "auth.login.submit": "Sign in",
    "auth.login.noAccount": "Don't have an account?",
    "auth.login.register": "Sign up",
    // Password input
    "auth.password.hide": "Hide password",
    "auth.password.show": "Show password",
    // Register
    "auth.register.validation.nameRequired": "Name is required",
    "auth.register.validation.nameTooLong": "Name is too long",
    "auth.register.validation.emailInvalid": "Enter a valid email address",
    "auth.register.validation.passwordMin":
      "Password must be at least 8 characters",
    "auth.register.error.createFailed": "Failed to create account",
    "auth.register.heading": "Create account",
    "auth.register.fieldName": "Name",
    "auth.register.fieldEmail": "Email",
    "auth.register.fieldPassword": "Password",
    "auth.register.placeholderName": "Jane Smith",
    "auth.register.placeholderEmail": "you@example.com",
    "auth.register.placeholderPassword": "Min. 8 characters",
    "auth.register.submitting": "Creating account…",
    "auth.register.submit": "Create account",
    "auth.register.haveAccount": "Already have an account?",
    "auth.register.signIn": "Sign in",
  },
  it: {
    // Login — validation
    "auth.validation.emailInvalid": "Inserisci un indirizzo email valido",
    "auth.validation.passwordRequired": "La password è obbligatoria",
    "auth.validation.emailInvalidShort": "Email non valida",
    "auth.validation.passwordRequiredShort": "Password obbligatoria",
    // Login — flow
    "auth.error.invalidCredentials": "Email o password non corretti",
    "auth.login.headingSignIn": "Accedi",
    "auth.login.headingWelcomeBack": "Bentornato",
    "auth.login.changeEmail": "Cambia",
    "auth.field.email": "Email",
    "auth.field.password": "Password",
    "auth.placeholder.email": "tu@esempio.com",
    "auth.action.continue": "Continua",
    "auth.divider.or": "oppure",
    "auth.oauth.continueGoogle": "Continua con Google",
    "auth.oauth.continueGithub": "Continua con GitHub",
    "auth.login.submitting": "Accesso in corso…",
    "auth.login.submit": "Accedi",
    "auth.login.noAccount": "Non hai un account?",
    "auth.login.register": "Registrati",
    // Password input
    "auth.password.hide": "Nascondi password",
    "auth.password.show": "Mostra password",
    // Register — kept verbatim (this page currently renders English in both
    // locales; preserve that until the register copy is localised).
    "auth.register.validation.nameRequired": "Name is required",
    "auth.register.validation.nameTooLong": "Name is too long",
    "auth.register.validation.emailInvalid": "Enter a valid email address",
    "auth.register.validation.passwordMin":
      "Password must be at least 8 characters",
    "auth.register.error.createFailed": "Failed to create account",
    "auth.register.heading": "Create account",
    "auth.register.fieldName": "Name",
    "auth.register.fieldEmail": "Email",
    "auth.register.fieldPassword": "Password",
    "auth.register.placeholderName": "Jane Smith",
    "auth.register.placeholderEmail": "you@example.com",
    "auth.register.placeholderPassword": "Min. 8 characters",
    "auth.register.submitting": "Creating account…",
    "auth.register.submit": "Create account",
    "auth.register.haveAccount": "Already have an account?",
    "auth.register.signIn": "Sign in",
  },
} as const satisfies LocaleDict;
