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
    "auth.login.forgotPassword": "Forgot password?",
    // Password input
    "auth.password.hide": "Hide password",
    "auth.password.show": "Show password",
    // Forgot password
    "auth.forgotPassword.heading": "Reset your password",
    "auth.forgotPassword.instructions":
      "Enter your email and we'll send you a link to reset your password.",
    "auth.forgotPassword.submit": "Send reset link",
    "auth.forgotPassword.submitting": "Sending…",
    "auth.forgotPassword.sentHeading": "Check your email",
    "auth.forgotPassword.sentMessage":
      "If an account exists for that email, we've sent a link to reset your password to",
    "auth.forgotPassword.backToLogin": "Back to sign in",
    // Reset password
    "auth.resetPassword.heading": "Choose a new password",
    "auth.resetPassword.fieldPassword": "New password",
    "auth.resetPassword.placeholderPassword": "Min. 8 characters",
    "auth.resetPassword.submit": "Reset password",
    "auth.resetPassword.submitting": "Resetting…",
    "auth.resetPassword.success":
      "Your password has been reset. You can now sign in.",
    "auth.resetPassword.invalidToken":
      "This reset link is invalid or has expired. Request a new one.",
    "auth.resetPassword.error": "Failed to reset password",
    "auth.resetPassword.validation.passwordMin":
      "Password must be at least 8 characters",
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
    "auth.register.checkEmailHeading": "Check your email",
    "auth.register.checkEmailMessage": "We sent a verification link to",
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
    "auth.login.forgotPassword": "Password dimenticata?",
    // Password input
    "auth.password.hide": "Nascondi password",
    "auth.password.show": "Mostra password",
    // Forgot password
    "auth.forgotPassword.heading": "Reimposta la password",
    "auth.forgotPassword.instructions":
      "Inserisci la tua email e ti invieremo un link per reimpostare la password.",
    "auth.forgotPassword.submit": "Invia link di reset",
    "auth.forgotPassword.submitting": "Invio in corso…",
    "auth.forgotPassword.sentHeading": "Controlla la tua email",
    "auth.forgotPassword.sentMessage":
      "Se esiste un account con questa email, ti abbiamo inviato un link per reimpostare la password a",
    "auth.forgotPassword.backToLogin": "Torna al login",
    // Reset password
    "auth.resetPassword.heading": "Scegli una nuova password",
    "auth.resetPassword.fieldPassword": "Nuova password",
    "auth.resetPassword.placeholderPassword": "Min. 8 caratteri",
    "auth.resetPassword.submit": "Reimposta password",
    "auth.resetPassword.submitting": "Reimpostazione in corso…",
    "auth.resetPassword.success":
      "La tua password è stata reimpostata. Ora puoi accedere.",
    "auth.resetPassword.invalidToken":
      "Questo link di reset non è valido o è scaduto. Richiedine uno nuovo.",
    "auth.resetPassword.error": "Impossibile reimpostare la password",
    "auth.resetPassword.validation.passwordMin":
      "La password deve contenere almeno 8 caratteri",
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
    "auth.register.checkEmailHeading": "Check your email",
    "auth.register.checkEmailMessage": "We sent a verification link to",
  },
} as const satisfies LocaleDict;
