// Pure router that picks the cheapest model tier capable of answering the
// user. Read-only, no DB, no React, no neverthrow. Cost optimisation lives
// here so the rest of the Cesare pipeline stays untouched.

export const FAST_TIER_MODEL = "claude-haiku-4-5-20251001";
export const QUALITY_TIER_MODEL = "claude-sonnet-5";

// Tiers are ROLES (budget vs quality), not model names. With BYOK (Spec 84)
// any provider's model can fill either slot — "fast" trades reasoning depth
// for cost/latency, "quality" is where that depth earns its price. The
// platform's own default mapping (below) happens to use Haiku/Sonnet today,
// but a user's OpenRouter or Anthropic config can point "fast"/"quality" at
// any two models they choose.
export type ModelTier = "fast" | "quality";

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
  /** The classified intent's scale (INTENT_SCALE in cesare-intent-classifier).
   *  Kept as a plain literal — not the IntentType — so this module stays free
   *  of the classifier and its prompt. Absent when the page has no classifier;
   *  the structural rules below then decide alone. */
  readonly intentScale?: "scoped" | "document";
}

// The fast tier (Haiku 4.5 on the platform default, 3× cheaper than the
// quality tier's Sonnet) is the default. It handles the common interactive
// load — questions and everyday edits ("aggiungi una scena", "accorcia
// questo", "aggiorna la scaletta") — well. The quality tier is reserved for
// the genuinely hard turns where its depth earns its cost, gated by three
// narrow signals below. Note: the heavy *generate-from-scratch* tools (full
// scaletta / treatment / screenplay from soggetto) already select the quality
// tier directly at their own call site (cesare-document-tools.ts), so the
// router does NOT need a broad imperative net to protect those — it only
// decides the interactive tool-loop tier. This is the deliberate reversal of
// the old "any imperative → quality tier" bias, which sent nearly all real
// requests to the expensive tier (issue #101).

// A narrow set of "rewrite the whole document from scratch" phrasings — the
// one interactive intent heavy enough to justify the quality tier even when
// it slips past the generation tools. Everyday scoped edits are
// intentionally NOT here.

// Multi-constraint prompts encode complex intent. Raised from the old 200 so a
// normal edit instruction ("aggiungi una scena dopo la 4 e accorcia la 2") still
// lands on the fast tier; only genuinely long, layered requests escalate.
const LONG_MESSAGE_CHAR_LIMIT = 400;
// Late-conversation turns accumulate context. Raised from the old 4 so a short
// back-and-forth of edits stays cheap; only deep threads escalate.
const DEEP_CONVERSATION_TURN_LIMIT = 8;

export const routeModel = ({
  userMessage,
  page: _page,
  conversationLength,
  intentScale,
}: RouteModelInput): ModelTier => {
  // The classifier's verdict outranks every textual heuristic: it is an LLM,
  // so it understands any language, any phrasing, any typo — the things a
  // regex was being patched for, one user report at a time (#118). Document-
  // scale work always gets the quality slot.
  if (intentScale === "document") return "quality";

  const trimmed = userMessage.trim();

  // Defensive: an empty message shouldn't reach a model at all; if it does,
  // the fast tier is fine — there is nothing complex to reason about.
  if (trimmed.length === 0) return "fast";

  // Long, multi-constraint prompts: don't gamble on the fast tier.
  if (trimmed.length > LONG_MESSAGE_CHAR_LIMIT) return "quality";

  // Deep conversations carry accumulated context worth the quality tier's reasoning.
  if (conversationLength > DEEP_CONVERSATION_TURN_LIMIT) return "quality";

  // Everything else — questions and everyday scoped edits — is a fast-tier job.
  return "fast";
};

export const tierToModel = (tier: ModelTier): string =>
  tier === "fast" ? FAST_TIER_MODEL : QUALITY_TIER_MODEL;
