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
  // #102 — a targeted edit of ONE existing outline scene (e.g. "accorcia la
  // scena 1"). Distinct from write_outline, which (re)generates the WHOLE
  // scaletta. Carved out so a single-scene ask doesn't force a full regen.
  | "edit_outline_scene"
  | "write_treatment"
  // Screenplay-from-narrative (Spec 75 / BUG-N67): write the FIRST DRAFT of the
  // screenplay from the upstream narrative chain. Distinct from macro_rewrite,
  // which revises an EXISTING screenplay.
  | "write_screenplay"
  // Generic
  | "question"
  | "comment";

export interface IntentResult {
  readonly type: IntentType;
  readonly confidence: number;
  readonly suggestedTool?: string;
}

// Clearly-actionable write/edit/mutation requests must dispatch reliably: a
// writer phrases "scrivimi la scaletta" a hundred different ways and every one
// of them should reach the right generator. We keep the gate at 0.55 — below
// that the request is genuinely ambiguous and we let `tool_choice: "auto"`
// decide (or Cesare asks a clarifying question). This is deliberately lower than
// a "force a destructive op" threshold would be: the document generators and the
// screenplay propose_* tools all auto-create a revertible version BEFORE applying
// (Agentic Edit Pattern), so a borderline-but-wrong dispatch is cheap to undo,
// while a borderline-but-missed dispatch silently breaks the persona's only
// input channel. Questions/comments map to the `question`/`comment` intents,
// which have NO tool in TOOL_BY_INTENT, so they always stay a chat answer
// regardless of this threshold.
const CONFIDENCE_THRESHOLD = 0.55;

// Mapping from intent → tool the API must force. Only includes intents that
// have a one-to-one mapping to a proper propose_*/write_* tool. Generic intents
// (question, comment) fall through to "auto".
const TOOL_BY_INTENT: Partial<Record<IntentType, string>> = {
  macro_rewrite: "propose_screenplay_revision",
  // Spec 80 — a single-scene edit (micro OR full rewrite) is one universal tool
  // now: the model returns the whole scene, which rewrite_scene applies inline
  // (correct Fountain, right scene, no fragile find/replace). See rewrite_scene.
  micro_edit: "rewrite_scene",
  rewrite_one_scene: "rewrite_scene",
  merge_scenes: "merge_scenes",
  delete_scene: "delete_scene",
  rename: "propose_rename_entity",
  write_logline: "write_logline",
  write_soggetto: "propose_soggetto_v2",
  write_synopsis: "propose_synopsis_from_screenplay",
  write_outline: "propose_scaletta_from_soggetto",
  edit_outline_scene: "edit_outline_scene",
  write_treatment: "propose_treatment_from_narrative",
  write_screenplay: "generate_screenplay_from_narrative",
};

// Shared catalogue of the many Italian ways a writer phrases a WRITE / DERIVE /
// EDIT request for a narrative document. Reused by both prompts so the screenplay
// page (which, in a Cesare SESSION, is the page the shell defaults to — see
// `deriveCesarePage`) and the document pages classify document requests with the
// same breadth. Keeping it in one constant avoids the two prompts drifting apart.
const DOCUMENT_INTENT_DEFINITIONS = `- write_logline: scrivere, generare o modificare la LOGLINE. Verbi/giri di frase: "scrivimi/scrivi/buttami giù/butta giù/fammi/abbozza/abbozzami/metti giù/mettimi giù/dammi/sviluppa/genera/generami/crea/preparami la logline", "una logline su/per/di…", oppure modifiche: "rendi la logline più tesa/corta/asciutta/incisiva", "accorcia la logline", "cambia il protagonista della logline", "riscrivi la logline".
- write_soggetto: scrivere, generare, derivare o modificare il SOGGETTO. Frasi: "scrivimi/scrivi/buttami giù/fammi/abbozza/metti giù/dammi/sviluppa/genera/crea il soggetto", "fammi un v2 del soggetto", derivazioni: "genera il soggetto dalla logline", "dato lo spunto fammi il soggetto", modifiche: "rendi il soggetto più asciutto/corto/teso", "riscrivi il soggetto", "espandi il soggetto".
- write_synopsis: scrivere, generare, derivare o RIASSUMERE la SINOSSI. Frasi: "scrivimi/scrivi/fammi/dammi/genera/buttami giù/abbozza la sinossi", derivazioni: "genera la sinossi dal soggetto", "dato il soggetto fammi la sinossi", riassunti: "fai un riassunto di cosa abbiamo scritto", "riassumi la storia", modifiche: "rendi la sinossi più commovente/asciutta", "accorcia la sinossi".
- write_outline: scrivere, generare, derivare o rigenerare l'INTERA SCALETTA (tutte le scene). Frasi: "fammi/scrivimi/dammi/genera/buttami giù/abbozza la scaletta", derivazioni: "genera la scaletta dal soggetto", "dato il soggetto fammi la scaletta", "dividi la storia in scene", "dammi la lista delle scene", "rigenera tutta la scaletta", "accorcia la scaletta" (l'intera scaletta). NON usare per una singola scena numerata → vedi edit_outline_scene.
- edit_outline_scene: modifica di UNA SOLA scena esistente della scaletta, identificata da un numero o riferimento ("la scena N", "la prima/ultima scena"). Frasi: "accorcia la scena 1", "riscrivi la descrizione della scena 3", "rendi più tesa la scena 5", "espandi la scena 2". NON è la rigenerazione dell'intera scaletta.
- write_treatment: scrivere, generare o derivare il TRATTAMENTO dal materiale a monte (scaletta, sinossi, soggetto). Frasi: "scrivi/scrivimi/fammi/dammi/genera/buttami giù/abbozza il trattamento", derivazioni: "genera il trattamento dalla scaletta", "trattamento a partire dalla scaletta/dal soggetto", modifiche: "espandi l'Atto II del trattamento", "rendi il trattamento più dettagliato". ATTENZIONE: vale SOLO per il TRATTAMENTO, MAI per la sceneggiatura.
- write_screenplay: scrivere la PRIMA STESURA della SCENEGGIATURA derivandola dal materiale narrativo a monte (soggetto, sinossi, scaletta, trattamento). Frasi: "scrivi/scrivimi/fammi/dammi/genera/buttami giù/abbozza la sceneggiatura", "scrivimi la prima stesura della sceneggiatura", derivazioni: "partendo dal soggetto fammi la sceneggiatura", "dal soggetto/dalla scaletta scrivimi la sceneggiatura", "scrivimi il film in sceneggiatura". NON è un trattamento: se l'utente nomina la SCENEGGIATURA (o "il film in formato sceneggiatura"), è write_screenplay, mai write_treatment.`;

const DOCUMENT_INTENT_EXAMPLES = `"scrivimi una logline su un detective che non dorme" → {"type":"write_logline","confidence":0.95}
"buttami giù una logline" → {"type":"write_logline","confidence":0.9}
"rendi la logline più tesa" → {"type":"write_logline","confidence":0.9}
"accorcia la logline" → {"type":"write_logline","confidence":0.88}
"cambia il protagonista della logline" → {"type":"write_logline","confidence":0.9}
"scrivi il soggetto" → {"type":"write_soggetto","confidence":0.92}
"genera il soggetto dalla logline" → {"type":"write_soggetto","confidence":0.95}
"fammi un v2 del soggetto più asciutto" → {"type":"write_soggetto","confidence":0.95}
"sviluppa il soggetto" → {"type":"write_soggetto","confidence":0.85}
"scrivimi la sinossi" → {"type":"write_synopsis","confidence":0.92}
"genera la sinossi dal soggetto" → {"type":"write_synopsis","confidence":0.95}
"fai un riassunto di cosa abbiamo scritto finora" → {"type":"write_synopsis","confidence":0.85}
"rendi la sinossi più commovente" → {"type":"write_synopsis","confidence":0.88}
"fammi la scaletta" → {"type":"write_outline","confidence":0.9}
"dato il soggetto fammi la scaletta" → {"type":"write_outline","confidence":0.95}
"rigenera tutta la scaletta" → {"type":"write_outline","confidence":0.92}
"dividi la storia in scene" → {"type":"write_outline","confidence":0.85}
"espandi l'atto II" → {"type":"write_outline","confidence":0.7}
"accorcia la scena 1" → {"type":"edit_outline_scene","confidence":0.93}
"riscrivi la descrizione della scena 3" → {"type":"edit_outline_scene","confidence":0.92}
"rendi più tesa la scena 5" → {"type":"edit_outline_scene","confidence":0.9}
"scrivi il trattamento" → {"type":"write_treatment","confidence":0.92}
"genera il trattamento dalla scaletta" → {"type":"write_treatment","confidence":0.95}
"buttami giù il trattamento" → {"type":"write_treatment","confidence":0.88}
"scrivimi la sceneggiatura" → {"type":"write_screenplay","confidence":0.92}
"partendo dal soggetto attivo scrivimi la prima stesura della sceneggiatura" → {"type":"write_screenplay","confidence":0.96}
"dal soggetto fammi la sceneggiatura" → {"type":"write_screenplay","confidence":0.94}
"scrivi la prima stesura della sceneggiatura" → {"type":"write_screenplay","confidence":0.95}`;

const SCREENPLAY_SYSTEM_PROMPT = `Sei un classificatore d'intento per Oh Writers. L'utente sta dialogando con Cesare (AI dramaturg). La pagina di contesto è "screenplay", ma in una SESSIONE Cesare questa è anche la pagina di default: l'utente può chiederti di scrivere QUALSIASI documento narrativo (logline, soggetto, sinossi, scaletta, trattamento) oltre a mutare la sceneggiatura. Devi capire SE l'utente sta chiedendo un'azione (mutazione sceneggiatura O scrittura/derivazione/modifica di un documento) e DI CHE TIPO.

Output: SOLO un oggetto JSON, niente prosa attorno. Schema:
{
  "type": "macro_rewrite" | "micro_edit" | "rewrite_one_scene" | "merge_scenes" | "delete_scene" | "rename" | "write_logline" | "write_soggetto" | "write_synopsis" | "write_outline" | "write_treatment" | "write_screenplay" | "question" | "comment",
  "confidence": <number tra 0 e 1>
}

Definizioni dei type — SCENEGGIATURA:
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

DISTINZIONE CRITICA — write_screenplay vs macro_rewrite:
- write_screenplay = SCRIVERE la PRIMA STESURA della sceneggiatura partendo dal materiale narrativo (soggetto/sinossi/scaletta/trattamento), quando la sceneggiatura ancora NON esiste o l'utente chiede esplicitamente di scriverla "partendo dal soggetto/dalla scaletta". → "scrivimi la sceneggiatura", "dal soggetto fammi la sceneggiatura".
- macro_rewrite = RISCRIVERE/trasformare una sceneggiatura GIÀ esistente. → "fai una v2", "traduci tutto in inglese", "tutto in una stanza".
Se l'utente dice "scrivi/scrivimi/genera la sceneggiatura" (NON "riscrivi", NON "v2"), è write_screenplay.

Definizioni dei type — DOCUMENTI NARRATIVI (valgono anche da questa pagina):
${DOCUMENT_INTENT_DEFINITIONS}

Definizioni dei type — GENERICI (NESSUNA azione, resta in chat):
- question: domanda informativa che NON richiede un'azione.
    "come si chiama il protagonista?", "quante scene ci sono?",
    "di cosa parla questo soggetto?", "il conflitto è chiaro?",
    "che pensi del finale?", "secondo te funziona la scaletta?".
- comment: osservazione, feedback, brainstorm senza richiesta esecutiva esplicita.
    "questa scena è troppo lunga", "non mi convince Tea", "il soggetto sembra debole".

REGOLE:
1. Se l'utente chiede CHIARAMENTE di scrivere/generare/derivare/modificare un documento o di mutare la sceneggiatura, scegli il type d'azione con confidence ALTA (>=0.8). Un imperativo ("scrivi", "fammi", "genera", "buttami giù", "rendi", "accorcia", "cambia", "sviluppa", "espandi") rivolto a un'entità è un'AZIONE, non una domanda — anche senza punto interrogativo.
2. Una vera DOMANDA su cosa esiste/se funziona ("di cosa parla…?", "è chiaro il conflitto?", "che ne pensi?") è SEMPRE question, anche se nomina un documento. Non forzare un'azione su una domanda.
3. Solo in caso di reale ambiguità (non capisci se è azione o domanda) scegli question/comment con confidence ~0.5 — il loop userà "auto" e Cesare chiederà chiarimenti.

Esempi:
"traduci tutta la sceneggiatura in inglese" → {"type":"macro_rewrite","confidence":0.95}
"riscrivi la scena 3 più tesa" → {"type":"rewrite_one_scene","confidence":0.95}
"unisci la 1 e la 2 in una sola scena" → {"type":"merge_scenes","confidence":0.97}
"elimina la scena 5" → {"type":"delete_scene","confidence":0.98}
"in 5 atti" → {"type":"macro_rewrite","confidence":0.85}
"rinomina Marco in Luca" → {"type":"rename","confidence":0.99}
"cambia 'ciao' con 'salve'" → {"type":"micro_edit","confidence":0.92}
${DOCUMENT_INTENT_EXAMPLES}
"chi è il protagonista?" → {"type":"question","confidence":0.98}
"di cosa parla questo soggetto?" → {"type":"question","confidence":0.95}
"il conflitto è chiaro?" → {"type":"question","confidence":0.9}
"questa scena è piatta" → {"type":"comment","confidence":0.80}`;

// Bug #4 — document (narrative chain) classifier. On a document page (soggetto,
// sinossi, scaletta, trattamento) free natural-language writing requests used to
// fall through to `tool_choice: "auto"` and often produced no tool call at all.
// This prompt maps the request to the matching generator so the dispatch is
// reliable. A genuine question still resolves to "question" → chat answer.
const DOCUMENT_SYSTEM_PROMPT = `Sei un classificatore d'intento per Oh Writers. L'utente sta dialogando con Cesare (AI dramaturg) su una pagina di documento narrativo (soggetto, sinossi, scaletta, trattamento). Devi capire SE l'utente sta chiedendo di SCRIVERE/GENERARE/DERIVARE/MODIFICARE un documento e QUALE — oppure se sta solo facendo una domanda.

Output: SOLO un oggetto JSON, niente prosa attorno. Schema:
{
  "type": "write_logline" | "write_soggetto" | "write_synopsis" | "write_outline" | "write_treatment" | "write_screenplay" | "question" | "comment",
  "confidence": <number tra 0 e 1>
}

Definizioni dei type d'azione:
${DOCUMENT_INTENT_DEFINITIONS}

Definizioni dei type generici (NESSUNA scrittura, resta in chat):
- question: domanda informativa che NON richiede di scrivere/modificare un documento.
    "di cosa parla la storia?", "di cosa parla questo soggetto?", "chi è il protagonista?",
    "il conflitto è chiaro?", "la scaletta funziona?", "che ne pensi?".
- comment: osservazione o feedback senza richiesta di scrittura.
    "il soggetto è debole", "non mi convince il finale".

REGOLE:
1. Un imperativo ("scrivi", "scrivimi", "fammi", "genera", "buttami giù", "dammi", "abbozza", "sviluppa", "rendi", "accorcia", "cambia", "espandi", "riassumi") rivolto a un'entità è un'AZIONE → scegli il write_* corrispondente con confidence ALTA (>=0.8), anche senza punto interrogativo.
2. Una vera DOMANDA su cosa esiste / se funziona ("di cosa parla…?", "è chiaro il conflitto?", "che ne pensi?") è SEMPRE question, anche se nomina un documento. NON forzare un'azione su una domanda.
3. Solo in caso di reale ambiguità scegli question/comment con confidence ~0.5.

Esempi:
${DOCUMENT_INTENT_EXAMPLES}
"di cosa parla la storia?" → {"type":"question","confidence":0.95}
"di cosa parla questo soggetto?" → {"type":"question","confidence":0.95}
"il conflitto è chiaro?" → {"type":"question","confidence":0.9}
"la scaletta funziona?" → {"type":"question","confidence":0.88}
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
      "edit_outline_scene",
      "write_treatment",
      "write_screenplay",
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
