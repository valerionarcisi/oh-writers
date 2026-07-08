// Pure router that picks the cheapest model tier capable of answering the
// user. Read-only, no DB, no React, no neverthrow. Cost optimisation lives
// here so the rest of the Cesare pipeline stays untouched.

export const HAIKU_MODEL = "claude-haiku-4-5-20251001";
export const SONNET_MODEL = "claude-sonnet-5";

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

// Haiku 4.5 is the default (3× cheaper than Sonnet). It handles the common
// interactive load — questions and everyday edits ("aggiungi una scena",
// "accorcia questo", "aggiorna la scaletta") — well. Sonnet is reserved for the
// genuinely hard turns where its quality earns its cost, gated by three narrow
// signals below. Note: the heavy *generate-from-scratch* tools (full scaletta /
// treatment / screenplay from soggetto) already select Sonnet directly at their
// own call site (cesare-document-tools.ts), so the router does NOT need a broad
// imperative net to protect those — it only decides the interactive tool-loop
// tier. This is the deliberate reversal of the old "any imperative → Sonnet"
// bias, which sent nearly all real requests to the expensive tier (issue #101).

// A narrow set of "rewrite the whole document from scratch" phrasings — the one
// interactive intent heavy enough to justify Sonnet even when it slips past the
// generation tools. Everyday scoped edits are intentionally NOT here.
const HEAVY_GENERATION_REGEX =
  /\b(riscrivi|riscrivere|rigenera|rigenerare|genera(?:mi)?|generare)\b.*\b(tutt[oa]|intero|intera|dall['’ ]?inizio|da\s?capo|da\s?zero|l['’ ]?intero|l['’ ]?intera)\b/i;

// Multi-constraint prompts encode complex intent. Raised from the old 200 so a
// normal edit instruction ("aggiungi una scena dopo la 4 e accorcia la 2") still
// lands on Haiku; only genuinely long, layered requests escalate.
const LONG_MESSAGE_CHAR_LIMIT = 400;
// Late-conversation turns accumulate context. Raised from the old 4 so a short
// back-and-forth of edits stays cheap; only deep threads escalate.
const DEEP_CONVERSATION_TURN_LIMIT = 8;

export const routeModel = ({
  userMessage,
  page: _page,
  conversationLength,
}: RouteModelInput): ModelTier => {
  const trimmed = userMessage.trim();

  // Defensive: an empty message shouldn't reach a model at all; if it does,
  // Haiku is fine — there is nothing complex to reason about.
  if (trimmed.length === 0) return "haiku";

  // Long, multi-constraint prompts: don't gamble on Haiku.
  if (trimmed.length > LONG_MESSAGE_CHAR_LIMIT) return "sonnet";

  // Deep conversations carry accumulated context worth Sonnet's reasoning.
  if (conversationLength > DEEP_CONVERSATION_TURN_LIMIT) return "sonnet";

  // "Rewrite the whole thing from scratch" — the one heavy interactive intent.
  if (HEAVY_GENERATION_REGEX.test(trimmed)) return "sonnet";

  // Everything else — questions and everyday scoped edits — is a Haiku job.
  return "haiku";
};

export const tierToModel = (tier: ModelTier): string =>
  tier === "haiku" ? HAIKU_MODEL : SONNET_MODEL;
