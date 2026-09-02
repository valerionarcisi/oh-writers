import type { LocaleDict } from "./types.js";

/**
 * Spec 88 — legal baseline for the free-tier launch: Privacy Policy / ToS
 * pages, the signup consent checkbox, and the cookie notice. All copy is
 * marked DRAFT — pending legal review; do not treat as final legal text.
 */
export const legalKeys = {
  en: {
    "legal.privacy.title": "Privacy Policy",
    "legal.privacy.draftNotice":
      "DRAFT — pending legal review. This is not final legal text.",
    "legal.privacy.body":
      "We collect the name and email you provide at signup, and a session cookie used to keep you signed in. We do not use tracking or advertising cookies. Data controller: Valerio Narcisi, Italy — contact: valerio.narcisi@gmail.com. You can request deletion of your account and data at any time from Settings.",
    "legal.terms.title": "Terms of Service",
    "legal.terms.draftNotice":
      "DRAFT — pending legal review. This is not final legal text.",
    "legal.terms.body":
      "Oh Writers is provided as-is during this early free-tier launch. By creating an account you agree to use the service in good faith and understand these terms may change as the product evolves. Contact: valerio.narcisi@gmail.com.",
    "auth.register.consentLabel":
      "I accept the Terms of Service and Privacy Policy",
    "auth.register.consentTermsLink": "Terms of Service",
    "auth.register.consentPrivacyLink": "Privacy Policy",
    "auth.register.validation.consentRequired":
      "You must accept the Terms of Service and Privacy Policy",
    "cookieBanner.message":
      "We use only a technical session cookie to keep you signed in — no tracking or advertising cookies.",
    "cookieBanner.dismiss": "Got it",
  },
  it: {
    "legal.privacy.title": "Informativa Privacy",
    "legal.privacy.draftNotice":
      "BOZZA — in attesa di revisione legale. Non è testo legale definitivo.",
    "legal.privacy.body":
      "Raccogliamo nome ed email forniti in fase di registrazione, e un cookie di sessione usato per mantenere l'accesso. Non usiamo cookie di tracciamento o pubblicitari. Titolare del trattamento: Valerio Narcisi, Italia — contatto: valerio.narcisi@gmail.com. Puoi richiedere la cancellazione del tuo account e dei tuoi dati in qualsiasi momento dalle Impostazioni.",
    "legal.terms.title": "Termini di Servizio",
    "legal.terms.draftNotice":
      "BOZZA — in attesa di revisione legale. Non è testo legale definitivo.",
    "legal.terms.body":
      "Oh Writers è fornito così com'è durante questo lancio iniziale della versione gratuita. Creando un account accetti di utilizzare il servizio in buona fede e comprendi che questi termini potranno cambiare con l'evoluzione del prodotto. Contatto: valerio.narcisi@gmail.com.",
    "auth.register.consentLabel":
      "Accetto i Termini di Servizio e l'Informativa Privacy",
    "auth.register.consentTermsLink": "Termini di Servizio",
    "auth.register.consentPrivacyLink": "Informativa Privacy",
    "auth.register.validation.consentRequired":
      "Devi accettare i Termini di Servizio e l'Informativa Privacy",
    "cookieBanner.message":
      "Usiamo solo un cookie tecnico di sessione per mantenere l'accesso — nessun cookie di tracciamento o pubblicitario.",
    "cookieBanner.dismiss": "Capito",
  },
} as const satisfies LocaleDict;
