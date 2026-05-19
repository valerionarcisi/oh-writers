// Pure router that picks the cheapest model tier capable of answering the
// user. Read-only, no DB, no React, no neverthrow. Cost optimisation lives
// here so the rest of the Cesare pipeline stays untouched.

export const HAIKU_MODEL = "claude-haiku-4-5-20251001";
export const SONNET_MODEL = "claude-sonnet-4-6";

export type ModelTier = "haiku" | "sonnet";

export type CesarePage =
  | "soggetto"
  | "synopsis"
  | "outline"
  | "treatment"
  | "screenplay"
  | "breakdown"
  | "budget"
  | "schedule"
  | "shooting-plan"
  | "locations";

export interface RouteModelInput {
  readonly userMessage: string;
  readonly page: CesarePage;
  readonly conversationLength: number;
}

// Italian imperative verbs that signal a state-changing request. The list
// is intentionally narrow: false positives only cost us money (route to
// Sonnet when Haiku would have sufficed), false negatives cost correctness
// (Haiku tries to handle a mutation and fails).
const ITALIAN_IMPERATIVE_REGEX =
  /\b(aggiungi|aggiungere|modifica|modificare|crea|creare|rinomina|rinominare|applica|applicare|salva|salvare|rimuovi|rimuovere|sposta|spostare|sostituisci|sostituire|elimina|eliminare|genera|generare|imposta|impostare|cambia|cambiare|togli|togliere|metti|mettere|fai|costruisci|costruire|riscrivi|riscrivere|scrivi|scrivere|scrivimi|riempi|riempire|aggiorna|aggiornare|cancella|cancellare|propaga|propagare|distribuisci|distribuire|sincronizza|sincronizzare|esegui|eseguire|trova|trovare|cerca|cercare|espandi|espandere|comprimi|comprimere|accorcia|accorciare|riassumi|riassumere|tagga|taggare|spoglia|spogliare|riduci|ridurre|abbassa|abbassare|alza|alzare|aumenta|aumentare|riallocara|rialloca|riallocare|redistribuisci|redistribuire|proponi|proporre|suggerisci|suggerire|componi|comporre|inventa|inventare|racconta|raccontare|disegna|disegnare|rendi|rendere|spinge|spingi|spingere|tira|tirare|tendi|tendere)\b/i;

const LONG_MESSAGE_CHAR_LIMIT = 200;
const DEEP_CONVERSATION_TURN_LIMIT = 4;

export const routeModel = ({
  userMessage,
  page: _page,
  conversationLength,
}: RouteModelInput): ModelTier => {
  const trimmed = userMessage.trim();

  // Defensive: an empty message is not a real Haiku candidate.
  if (trimmed.length === 0) return "sonnet";

  // Long prompts encode complex intent. Don't gamble on Haiku.
  if (trimmed.length > LONG_MESSAGE_CHAR_LIMIT) return "sonnet";

  // Late-conversation messages tend to carry accumulated context the user
  // expects us to reason about. Route to Sonnet.
  if (conversationLength > DEEP_CONVERSATION_TURN_LIMIT) return "sonnet";

  // Imperative trumps everything (including questions like "puoi aggiungere?").
  if (ITALIAN_IMPERATIVE_REGEX.test(trimmed)) return "sonnet";

  // Pure questions are cheap and Haiku handles them well.
  if (trimmed.endsWith("?")) return "haiku";

  // Default conservatively to Sonnet — we'd rather pay more than degrade
  // quality on an ambiguous prompt.
  return "sonnet";
};

export const tierToModel = (tier: ModelTier): string =>
  tier === "haiku" ? HAIKU_MODEL : SONNET_MODEL;
