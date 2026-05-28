// Semantic intent classifier for the Cesare agentic loop.
//
// Why this file exists:
//   The model (Sonnet) is perfectly capable of producing a v2 of the
//   screenplay translated to English, set in a Michelin-starred restaurant,
//   or rewritten as a noir. The problem isn't capability — it's *control
//   flow*. By default the model writes the new Fountain inline in chat
//   instead of calling `propose_screenplay_revision`, which would create a
//   proper DRAFT in `screenplay_versions` and surface a diff to the user.
//
//   A regex on the user message ("scrivi v2", "riscrivi") would never
//   generalise to "traduci in inglese", "in 5 atti", "tutto al femminile",
//   "in italiano del '600". So we ask a small/cheap LLM (Haiku) to classify
//   the intent and emit a tight JSON object. The result drives the
//   `tool_choice` of the main tool loop — when the classifier is confident,
//   the API forces the model to use the right tool.
//
//   Costs: ~$0.0001 per turn (Haiku, ~200 input tokens, JSON-only output).
//   Negligible compared to the determinism gained.
//
//   Falls back to "auto" silently on any error / low confidence — the
//   user-visible behaviour is "best effort", never blocking.

import { ResultAsync } from "neverthrow";
import { callHaiku, extractText } from "~/features/ai";
import { HAIKU_MODEL } from "./cesare-model-router";
import { CesareError } from "./cesare.errors";

export type IntentType =
  | "macro_rewrite"
  | "micro_edit"
  | "rename"
  | "question"
  | "comment";

export interface IntentResult {
  readonly type: IntentType;
  readonly confidence: number;
  readonly suggestedTool?: string;
}

const CONFIDENCE_THRESHOLD = 0.6;

// Mapping from intent → tool the API must force. Only includes intents that
// have a one-to-one mapping to a proper propose_* tool. Generic intents
// (question, comment) fall through to "auto".
const TOOL_BY_INTENT: Partial<Record<IntentType, string>> = {
  macro_rewrite: "propose_screenplay_revision",
  micro_edit: "propose_screenplay_edit",
  rename: "propose_rename_entity",
};

const SYSTEM_PROMPT = `Sei un classificatore d'intento per Oh Writers. L'utente sta dialogando con Cesare (AI dramaturg) sulla pagina "screenplay". Devi capire SE l'utente sta chiedendo una mutazione e DI CHE TIPO.

Output: SOLO un oggetto JSON, niente prosa attorno. Schema:
{
  "type": "macro_rewrite" | "micro_edit" | "rename" | "question" | "comment",
  "confidence": <number tra 0 e 1>
}

Definizioni dei type:
- macro_rewrite: riscrittura ampia che produce >2-3 righe Fountain nuove. Include:
    "scrivi v2", "fai una versione 2", "traduci tutto in inglese",
    "ambienta in un ristorante stellato", "tutto al femminile",
    "in italiano del '600", "in 5 atti", "rendi noir", "riscrivi l'Atto II",
    "fai una versione più tesa", "tutto in una stanza", "porta in chiave western".
- micro_edit: sostituzione puntuale di una battuta, una parola, una direzione di scena. Include:
    "cambia 'ciao' con 'salve' nella scena 3", "togli la pausa",
    "rendi più asciutta questa battuta".
- rename: rinomina di personaggio o location attraverso tutta la sceneggiatura.
    "rinomina Marco in Luca", "chiama la location Bar invece di Pizzeria".
- question: domanda informativa che NON richiede mutazione.
    "come si chiama il protagonista?", "quante scene ci sono?",
    "che pensi del finale?".
- comment: osservazione, feedback, brainstorm senza richiesta mutativa esplicita.
    "questa scena è troppo lunga", "non mi convince Tea", "sembra debole".

REGOLA: in caso di ambiguità tra question/comment e una mutation, scegli question/comment con confidence ~0.5 — il loop poi userà "auto" e Cesare farà la domanda di chiarimento.

Esempi:
"traduci tutta la sceneggiatura in inglese" → {"type":"macro_rewrite","confidence":0.95}
"in 5 atti" → {"type":"macro_rewrite","confidence":0.85}
"rinomina Marco in Luca" → {"type":"rename","confidence":0.99}
"cambia 'ciao' con 'salve'" → {"type":"micro_edit","confidence":0.92}
"chi è il protagonista?" → {"type":"question","confidence":0.98}
"questa scena è piatta" → {"type":"comment","confidence":0.80}`;

const NO_OP_INTENT: IntentResult = { type: "question", confidence: 0 };

const parseJsonResponse = (text: string): IntentResult | null => {
  try {
    // Strip optional code-fence wrapping ("```json ... ```").
    const cleaned = text
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    const obj = JSON.parse(cleaned) as { type?: string; confidence?: number };
    if (!obj.type || typeof obj.confidence !== "number") return null;
    const validTypes: IntentType[] = [
      "macro_rewrite",
      "micro_edit",
      "rename",
      "question",
      "comment",
    ];
    if (!validTypes.includes(obj.type as IntentType)) return null;
    return {
      type: obj.type as IntentType,
      confidence: Math.max(0, Math.min(1, obj.confidence)),
    };
  } catch {
    return null;
  }
};

export interface ClassifyOpts {
  readonly userMessage: string;
  readonly page: string;
  /** Names of the propose_* tools available on the current page. The
   *  classifier only forces a tool that is actually registered. */
  readonly availableTools: ReadonlySet<string>;
}

/**
 * Classify the user's last message into one of five intent buckets.
 * Returns `suggestedTool` only when the intent maps to a propose_* tool
 * registered for the current page and confidence clears the threshold.
 *
 * Uses callHaiku internally — no raw Anthropic SDK client needed.
 */
export const classifyIntent = (
  opts: ClassifyOpts,
): ResultAsync<IntentResult, CesareError> => {
  // Only run the classifier on the screenplay page for now — that's
  // where the inline-instead-of-tool bug bites the most. Other pages
  // (budget, schedule, locations) already have good tool adherence
  // thanks to their narrower scope.
  if (opts.page !== "screenplay") {
    return ResultAsync.fromSafePromise(Promise.resolve(NO_OP_INTENT));
  }

  // MOCK_AI escape hatch: the scripted client matches scenarios on the
  // user text, so calling it for classification would consume the first
  // scripted turn meant for the main tool loop. Skip the classifier and
  // let the loop run with tool_choice: "auto".
  if (process.env["MOCK_AI"] === "true") {
    return ResultAsync.fromSafePromise(Promise.resolve(NO_OP_INTENT));
  }

  return callHaiku(
    {
      system: SYSTEM_PROMPT,
      fewShot: [],
      user: opts.userMessage.slice(0, 800),
      model: HAIKU_MODEL,
      maxTokens: 100,
    },
    "cesare.intent-classifier",
  )
    .mapErr((e) => new CesareError(`intent classifier failed: ${e.message}`))
    .map((result) => {
      const text = extractText(result.content);
      if (!text) return NO_OP_INTENT;

      const parsed = parseJsonResponse(text);
      if (!parsed) return NO_OP_INTENT;

      // Decorate with the tool name when intent is confident and the tool
      // is actually available on this page.
      const candidate = TOOL_BY_INTENT[parsed.type];
      if (
        candidate &&
        parsed.confidence >= CONFIDENCE_THRESHOLD &&
        opts.availableTools.has(candidate)
      ) {
        return { ...parsed, suggestedTool: candidate };
      }
      return parsed;
    });
};
