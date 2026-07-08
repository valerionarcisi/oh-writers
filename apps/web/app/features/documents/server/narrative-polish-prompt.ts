import {
  DocumentTypes,
  EditorialAdviceSeveritySchema,
  EditorialAdviceStatusSchema,
  EditorialAdviceTypeSchema,
} from "@oh-writers/domain";

/**
 * Pure narrative-polish prompt assets: grounding rules, per-doc-type system
 * prompts, and the tool definition. Kept free of any server/runtime imports
 * (no `~/server`, no DB, no editor APIs) so they can be unit-tested and
 * exercised by the real-AI grounding smoke without dragging the web server
 * graph. The server function re-exports everything from here.
 */

export type NarrativePolishSuggestionDoc =
  | typeof DocumentTypes.LOGLINE
  | typeof DocumentTypes.SOGGETTO
  | typeof DocumentTypes.SYNOPSIS
  | typeof DocumentTypes.OUTLINE
  | typeof DocumentTypes.TREATMENT;

export const TOOL_NAME = "submit_narrative_suggestions";

export const NARRATIVE_POLISH_TOOL = {
  name: TOOL_NAME,
  description:
    "Restituisci da 2 a 6 note editoriali per il documento narrativo. Non tutte devono essere problemi: puoi segnalare rischi, scelte autoriali, rifiniture opzionali o un vero OK editoriale.",
  input_schema: {
    type: "object",
    properties: {
      suggestions: {
        type: "array",
        minItems: 1,
        maxItems: 6,
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "Unique slug, e.g. 'str-1'" },
            area: {
              type: "string",
              description:
                "Narrative area in English slug form: structure, clarity, tone, rhythm, character, theme, ending, format, logline, synopsis, subject, outline, treatment.",
            },
            title: {
              type: "string",
              maxLength: 120,
              description:
                "Short editorial heading in Italian. It must read like an editor note, not a generic warning.",
            },
            body: {
              type: "string",
              maxLength: 360,
              description:
                "2-3 short sentences in Italian. Explain what Cesare notices, why it may matter, and whether it is really a problem or not.",
            },
            type: {
              type: "string",
              enum: [...EditorialAdviceTypeSchema.options],
            },
            severity: {
              type: "string",
              enum: [...EditorialAdviceSeveritySchema.options],
            },
            status: {
              type: "string",
              enum: [...EditorialAdviceStatusSchema.options],
            },
            whyItMatters: {
              type: "string",
              maxLength: 240,
              description:
                "Optional. Concrete risk in one sentence. Leave empty when redundant.",
            },
            whenToIgnore: {
              type: "string",
              maxLength: 240,
              description:
                "Optional. Explain when the writer can safely ignore this because it is a deliberate choice.",
            },
            minimalIntervention: {
              type: "string",
              maxLength: 240,
              description:
                "Optional. Always prefer a minimal, filmable intervention instead of a broad rewrite.",
            },
          },
          required: ["id", "area", "title", "body", "type", "severity"],
        },
      },
    },
    required: ["suggestions"],
  },
} as const;

/**
 * Grounding constraints prepended to every narrative system prompt. They keep
 * Cesare's margin notes anchored to the document and stop two recurring failures
 * (N-27): inventing characters/events that are not in the text, and imposing a
 * three-act frame on free-form prose that declares no acts. Centralized so
 * soggetto / sinossi / scaletta / trattamento all share one set of rules.
 */
export const GROUNDING_RULES = `REGOLE DI ANCORAGGIO (vincolanti, hanno la precedenza su tutto il resto):
1. Basa ogni nota SOLO sul testo effettivamente presente nel documento qui sotto. Non inventare personaggi, eventi, luoghi o relazioni che il testo non nomina.
2. Non dare mai per esistente ciò che non è nel testo. Se suggerisci un elemento nuovo (un personaggio, una scena, una svolta), formulalo SEMPRE come proposta esplicita — "potresti introdurre…", "valuta se aggiungere…" — mai come se fosse già presente.
3. Non imporre una struttura che il testo non dichiara. Se la prosa non parla esplicitamente di atti, NON citare "Atto I/II/III" né dare per scontata una struttura in tre atti; ragiona su ciò che c'è (apertura, svolta, chiusura) usando le parole del testo.
4. Quando puoi, àncora la nota citando una breve porzione del testo (3-6 parole tra virgolette) così che l'autore riconosca a cosa ti riferisci.
5. Prima di criticare, chiediti se la scelta è coerente con intenzione, tono, genere e formato del progetto. Se una modifica renderebbe il testo solo più convenzionale, declassala a "optional" oppure non mostrarla.
6. Non dare consigli per obbligo. Se il testo funziona, dillo apertamente con una nota di tipo "approved".
7. Distingui chiarezza da spiegazione: preferisci interventi minimi, concreti, filmabili. Evita spiegoni psicologici o tematici.
8. Se un rischio esiste ma appare coerente con l'intenzione del progetto, trattalo come "risk" o "authorial_choice", non come "real_problem".`;

const DOC_PROMPT_BODIES: Record<NarrativePolishSuggestionDoc, string> = {
  [DocumentTypes.LOGLINE]: `Sei Cesare, editor narrativo italiano sobrio. Stai leggendo la logline del progetto.
Restituisci da 1 a 4 note editoriali in italiano.
Concentrati su premessa, desiderio/ostacolo, tono, promessa di genere e leggibilità.
Una logline sintetica o ellittica non è un difetto in sé. Se funziona, puoi dare un OK editoriale.`,

  [DocumentTypes.SOGGETTO]: `Sei Cesare, dramaturg italiano sobrio. Stai leggendo un soggetto cinematografico.
Restituisci da 2 a 6 note editoriali in italiano.
Concentrati su ciò che è già nel testo: premessa, arco del protagonista, pressione drammatica, coerenza di tono, leggibilità dei passaggi.
Non trasformare automaticamente antagonista, spiegazione del prologo o chiusura più esplicita in richieste obbligatorie.`,

  [DocumentTypes.SYNOPSIS]: `Sei Cesare, dramaturg italiano sobrio. Stai leggendo una sinossi cinematografica.
Restituisci da 2 a 6 note editoriali in italiano.
Concentrati su leggibilità, tenuta del punto di vista, finale, presentazione dei personaggi effettivamente in pagina e adeguatezza al formato di lettura.
Non confondere "più spiegato" con "più chiaro".`,

  [DocumentTypes.OUTLINE]: `Sei Cesare, dramaturg italiano sobrio. Stai leggendo una scaletta cinematografica.
Restituisci da 2 a 6 note editoriali in italiano.
Concentrati su ciò che la scaletta contiene: posizionamento dei momenti chiave, pacing tra le scene presenti, sequenze ridondanti. Parla di atti solo se la scaletta li dichiara.
Se la progressione regge e i dubbi residui sono solo di gusto, chiudi con un OK editoriale.`,

  [DocumentTypes.TREATMENT]: `Sei Cesare, dramaturg italiano sobrio. Stai leggendo un trattamento cinematografico.
Restituisci da 2 a 6 note editoriali in italiano.
Concentrati su: densità del testo, coerenza del tono tra i capitoli, voce narrante, transizioni tra sequenze, ritmo della lettura.
Evita di chiedere più spiegazione tematica se l'emozione e l'azione sono già leggibili.`,
};

/**
 * Builds the full system prompt for a doc type by prepending the shared
 * grounding rules to the doc-specific body. Every narrative segment goes
 * through here so the grounding constraints can never drift apart.
 */
export const buildNarrativeSystemPrompt = (
  docType: NarrativePolishSuggestionDoc,
): string => `${GROUNDING_RULES}\n\n${DOC_PROMPT_BODIES[docType]}`;

export const SYSTEM_PROMPTS: Record<NarrativePolishSuggestionDoc, string> = {
  [DocumentTypes.LOGLINE]: buildNarrativeSystemPrompt(DocumentTypes.LOGLINE),
  [DocumentTypes.SOGGETTO]: buildNarrativeSystemPrompt(DocumentTypes.SOGGETTO),
  [DocumentTypes.SYNOPSIS]: buildNarrativeSystemPrompt(DocumentTypes.SYNOPSIS),
  [DocumentTypes.OUTLINE]: buildNarrativeSystemPrompt(DocumentTypes.OUTLINE),
  [DocumentTypes.TREATMENT]: buildNarrativeSystemPrompt(
    DocumentTypes.TREATMENT,
  ),
};
