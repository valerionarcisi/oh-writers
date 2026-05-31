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
  // Screenplay intents
  | "macro_rewrite"
  | "micro_edit"
  | "rewrite_one_scene"
  | "merge_scenes"
  | "delete_scene"
  | "rename"
  // Document (narrative chain) intents — Bug #4: free natural-language writing
  // requests must reliably select the matching generator, not fall through to
  // "no tools to invoke".
  | "write_logline"
  | "write_soggetto"
  | "write_synopsis"
  | "write_outline"
  // Generic
  | "question"
  | "comment";

export interface IntentResult {
  readonly type: IntentType;
  readonly confidence: number;
  readonly suggestedTool?: string;
}

const CONFIDENCE_THRESHOLD = 0.6;

// Mapping from intent → tool the API must force. Only includes intents that
// have a one-to-one mapping to a proper propose_*/write_* tool. Generic intents
// (question, comment) fall through to "auto".
const TOOL_BY_INTENT: Partial<Record<IntentType, string>> = {
  macro_rewrite: "propose_screenplay_revision",
  micro_edit: "propose_screenplay_edit",
  rewrite_one_scene: "rewrite_scene",
  merge_scenes: "merge_scenes",
  delete_scene: "delete_scene",
  rename: "propose_rename_entity",
  write_logline: "write_logline",
  write_soggetto: "propose_soggetto_v2",
  write_synopsis: "propose_synopsis_from_screenplay",
  write_outline: "propose_scaletta_from_soggetto",
};

const SCREENPLAY_SYSTEM_PROMPT = `Sei un classificatore d'intento per Oh Writers. L'utente sta dialogando con Cesare (AI dramaturg) sulla pagina "screenplay". Devi capire SE l'utente sta chiedendo una mutazione e DI CHE TIPO.

Output: SOLO un oggetto JSON, niente prosa attorno. Schema:
{
  "type": "macro_rewrite" | "micro_edit" | "rewrite_one_scene" | "merge_scenes" | "delete_scene" | "rename" | "question" | "comment",
  "confidence": <number tra 0 e 1>
}

Definizioni dei type:
- macro_rewrite: riscrittura ampia di un range di scene (>1) o intera sceneggiatura. Include:
    "scrivi v2", "fai una versione 2", "traduci tutto in inglese",
    "ambienta in un ristorante stellato", "tutto al femminile",
    "in italiano del '600", "in 5 atti", "rendi noir", "riscrivi l'Atto II",
    "tutto in una stanza", "porta in chiave western".
- rewrite_one_scene: riscrittura di UNA SOLA scena specifica (numero esplicito o riferimento "questa scena"). Include:
    "riscrivi la scena 3", "opzione B per la 5", "dammi una versione alternativa di sc.7",
    "rendi più intensa la scena corrente", "fai una variante di questa scena".
- merge_scenes: UNIRE due o più scene consecutive in una sola. Include:
    "unisci scena 1 e 2", "fondi le scene 3-4", "queste due scene sono la stessa",
    "compatta sc.5 e sc.6 in una", "la 7 e la 8 sono lo stesso momento".
- delete_scene: ELIMINARE una scena. Include:
    "elimina sc.4", "togli questa scena", "rimuovi la scena 3", "cancella sc.7".
- micro_edit: sostituzione puntuale di una battuta/parola/direzione di scena. Include:
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
"riscrivi la scena 3 più tesa" → {"type":"rewrite_one_scene","confidence":0.95}
"unisci la 1 e la 2 in una sola scena" → {"type":"merge_scenes","confidence":0.97}
"elimina la scena 5" → {"type":"delete_scene","confidence":0.98}
"in 5 atti" → {"type":"macro_rewrite","confidence":0.85}
"rinomina Marco in Luca" → {"type":"rename","confidence":0.99}
"cambia 'ciao' con 'salve'" → {"type":"micro_edit","confidence":0.92}
"chi è il protagonista?" → {"type":"question","confidence":0.98}
"questa scena è piatta" → {"type":"comment","confidence":0.80}`;

// Bug #4 — document (narrative chain) classifier. On a document page (soggetto,
// sinossi, scaletta, trattamento) free natural-language writing requests used to
// fall through to `tool_choice: "auto"` and often produced no tool call at all.
// This prompt maps the request to the matching generator so the dispatch is
// reliable. A genuine question still resolves to "question" → chat answer.
const DOCUMENT_SYSTEM_PROMPT = `Sei un classificatore d'intento per Oh Writers. L'utente sta dialogando con Cesare (AI dramaturg) su una pagina di documento narrativo (soggetto, sinossi, scaletta, trattamento). Devi capire SE l'utente sta chiedendo di SCRIVERE/GENERARE un documento e QUALE.

Output: SOLO un oggetto JSON, niente prosa attorno. Schema:
{
  "type": "write_logline" | "write_soggetto" | "write_synopsis" | "write_outline" | "question" | "comment",
  "confidence": <number tra 0 e 1>
}

Definizioni dei type:
- write_logline: scrivere o modificare la logline da una premessa libera o un'istruzione. Include:
    "scrivimi una logline su un detective", "scrivi la logline dallo spunto",
    "rendi la logline più tesa", "cambia il protagonista della logline".
- write_soggetto: scrivere o riscrivere il soggetto (anche a partire dalla logline). Include:
    "scrivi il soggetto", "genera il soggetto dalla logline", "fammi un v2 del soggetto",
    "riscrivi il soggetto più asciutto", "soggetto a partire dalla logline".
- write_synopsis: scrivere o generare la sinossi (anche riassumendo ciò che è stato scritto). Include:
    "scrivimi la sinossi", "genera la sinossi dal soggetto", "fai un riassunto di cosa abbiamo scritto",
    "riassumi la storia", "dammi una sinossi".
- write_outline: scrivere o generare la scaletta (lista di scene) dal soggetto. Include:
    "fammi la scaletta", "genera la scaletta dal soggetto", "dividi la storia in scene",
    "dammi la lista delle scene".
- question: domanda informativa che NON richiede di scrivere un documento.
    "di cosa parla la storia?", "chi è il protagonista?", "che ne pensi?".
- comment: osservazione o feedback senza richiesta di scrittura.
    "il soggetto è debole", "non mi convince il finale".

REGOLA: se l'utente chiede chiaramente di SCRIVERE/GENERARE/RIASSUMERE un documento, scegli il write_* corrispondente con confidence alta. In caso di ambiguità con una domanda informativa, scegli question/comment con confidence ~0.5.

Esempi:
"scrivimi una logline su un detective che non dorme" → {"type":"write_logline","confidence":0.95}
"genera il soggetto dalla logline" → {"type":"write_soggetto","confidence":0.95}
"fai un riassunto di cosa abbiamo scritto finora" → {"type":"write_synopsis","confidence":0.9}
"fammi la scaletta dal soggetto" → {"type":"write_outline","confidence":0.95}
"di cosa parla la storia?" → {"type":"question","confidence":0.95}
"il soggetto non mi convince" → {"type":"comment","confidence":0.8}`;

// Document-narrative pages where the document classifier applies.
const DOCUMENT_PAGES: ReadonlySet<string> = new Set([
  "soggetto",
  "synopsis",
  "outline",
  "treatment",
]);

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
      "rewrite_one_scene",
      "merge_scenes",
      "delete_scene",
      "rename",
      "write_logline",
      "write_soggetto",
      "write_synopsis",
      "write_outline",
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
 * Resolves which classifier prompt (if any) applies to the page. The screenplay
 * page uses the screenplay-mutation prompt; the narrative document pages use the
 * document-generation prompt (Bug #4). Any other page returns null → the caller
 * skips the classifier and lets `tool_choice: "auto"` choose.
 */
const promptForPage = (page: string): string | null => {
  if (page === "screenplay") return SCREENPLAY_SYSTEM_PROMPT;
  if (DOCUMENT_PAGES.has(page)) return DOCUMENT_SYSTEM_PROMPT;
  return null;
};

/**
 * Classify the user's last message into an intent bucket.
 * Returns `suggestedTool` only when the intent maps to a registered generation
 * or mutation tool and confidence clears the threshold.
 *
 * Uses callHaiku internally — no raw Anthropic SDK client needed.
 */
export const classifyIntent = (
  opts: ClassifyOpts,
): ResultAsync<IntentResult, CesareError> => {
  // Run the classifier on the screenplay page (screenplay mutations) and on the
  // narrative document pages (document generation — Bug #4). On any other page
  // (budget, schedule, locations) tool adherence is already good thanks to the
  // narrower scope, so we skip the extra Haiku call and let "auto" choose.
  const systemPrompt = promptForPage(opts.page);
  if (!systemPrompt) {
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
      system: systemPrompt,
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
