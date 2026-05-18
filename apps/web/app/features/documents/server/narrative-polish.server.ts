import { createServerFn } from "@tanstack/start";
import { z } from "zod";
import { ok, ResultAsync } from "neverthrow";
import { queryOptions } from "@tanstack/react-query";
import { DocumentTypes } from "@oh-writers/domain";
import { toShape, type ResultShape } from "@oh-writers/utils";
import { withProjectAccess } from "~/server/pipeline";
import { callHaiku, extractToolUse } from "~/features/ai";
import type { ProjectAccessError } from "~/server/access";

// ─── Types ─────────────────────────────────────────────────────────────────────

export class NarrativePolishError {
  readonly _tag = "NarrativePolishError" as const;
  readonly message: string;
  constructor(readonly cause: string) {
    this.message = `Narrative polish error: ${cause}`;
  }
}

export type NarrativePolishSuggestionDoc =
  | typeof DocumentTypes.SOGGETTO
  | typeof DocumentTypes.SYNOPSIS
  | typeof DocumentTypes.OUTLINE
  | typeof DocumentTypes.TREATMENT;

export interface NarrativePolishSuggestion {
  readonly id: string;
  readonly group: string;
  readonly category: string;
  readonly message: string;
}

// ─── Input schema ─────────────────────────────────────────────────────────────

const NarrativePolishInput = z.object({
  projectId: z.string().uuid(),
  docType: z.enum([
    DocumentTypes.SOGGETTO,
    DocumentTypes.SYNOPSIS,
    DocumentTypes.OUTLINE,
    DocumentTypes.TREATMENT,
  ]),
  content: z.string().min(1).max(50_000),
});

type NarrativePolishInputData = z.infer<typeof NarrativePolishInput>;

// ─── Tool definition ──────────────────────────────────────────────────────────

const TOOL_NAME = "submit_narrative_suggestions";

const NARRATIVE_POLISH_TOOL = {
  name: TOOL_NAME,
  description:
    "Restituisci da 3 a 5 suggerimenti di miglioramento concreti per il documento narrativo. Ogni suggerimento appartiene a un gruppo tematico (es. 'Struttura', 'Chiarezza', 'Tono') e ha una categoria più specifica.",
  input_schema: {
    type: "object",
    properties: {
      suggestions: {
        type: "array",
        minItems: 3,
        maxItems: 5,
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "Unique slug, e.g. 'str-1'" },
            group: {
              type: "string",
              description:
                "Thematic group label in Italian (e.g. 'Struttura', 'Chiarezza', 'Tono', 'Ritmo', 'Target formato')",
            },
            category: {
              type: "string",
              description:
                "More specific label within the group (e.g. 'Finale', 'Atto II', 'Antefatto')",
            },
            message: {
              type: "string",
              maxLength: 300,
              description:
                "Concrete actionable suggestion in Italian, ≤ 300 characters.",
            },
          },
          required: ["id", "group", "category", "message"],
        },
      },
    },
    required: ["suggestions"],
  },
} as const;

const SuggestionsResponseSchema = z.object({
  suggestions: z.array(
    z.object({
      id: z.string().min(1),
      group: z.string().min(1),
      category: z.string().min(1),
      message: z.string().min(1).max(300),
    }),
  ),
});

// ─── System prompts per doc type ──────────────────────────────────────────────

const SYSTEM_PROMPTS: Record<NarrativePolishSuggestionDoc, string> = {
  [DocumentTypes.SOGGETTO]: `Sei Cesare, dramaturg italiano sobrio. Stai leggendo un soggetto cinematografico.
Restituisci da 3 a 5 suggerimenti di miglioramento concreti, in italiano.
Concentrati su: premessa, arco del protagonista, antagonista, struttura in tre atti, coerenza di tono.
Niente complimenti generici. Ogni suggerimento deve indicare COSA migliorare e PERCHÉ.
Ogni suggerimento deve avere un gruppo tematico (es. "Struttura", "Chiarezza", "Tono") e una categoria specifica.`,

  [DocumentTypes.SYNOPSIS]: `Sei Cesare, dramaturg italiano sobrio. Stai leggendo una sinossi cinematografica.
Restituisci da 3 a 5 suggerimenti di miglioramento concreti, in italiano.
Concentrati su: lunghezza (target 1-2 cartelle), finale esplicito, presentazione dei personaggi, antefatto, tono per produttori e organismi di finanziamento.
Niente complimenti generici. Ogni suggerimento deve indicare COSA migliorare e PERCHÉ.
Ogni suggerimento deve avere un gruppo tematico (es. "Target formato", "Struttura", "Chiarezza") e una categoria specifica.`,

  [DocumentTypes.OUTLINE]: `Sei Cesare, dramaturg italiano sobrio. Stai leggendo una scaletta cinematografica.
Restituisci da 3 a 5 suggerimenti di miglioramento concreti, in italiano.
Concentrati su: bilanciamento degli atti, posizionamento del catalyst, midpoint, pacing tra scene di interni/esterni, sequenze ridondanti.
Niente complimenti generici. Ogni suggerimento deve indicare COSA migliorare e PERCHÉ.
Ogni suggerimento deve avere un gruppo tematico (es. "Struttura", "Ritmo", "Copertura beat") e una categoria specifica.`,

  [DocumentTypes.TREATMENT]: `Sei Cesare, dramaturg italiano sobrio. Stai leggendo un trattamento cinematografico.
Restituisci da 3 a 5 suggerimenti di miglioramento concreti, in italiano.
Concentrati su: densità del testo, coerenza del tono tra i capitoli, voce narrante, transizioni tra sequenze, ritmo della lettura.
Niente complimenti generici. Ogni suggerimento deve indicare COSA migliorare e PERCHÉ.
Ogni suggerimento deve avere un gruppo tematico (es. "Stile", "Lettura", "Chiarezza") e una categoria specifica.`,
};

// ─── Mock fallback ────────────────────────────────────────────────────────────

const MOCK_SUGGESTIONS: Record<
  NarrativePolishSuggestionDoc,
  NarrativePolishSuggestion[]
> = {
  [DocumentTypes.SOGGETTO]: [
    {
      id: "sog-clarity-1",
      group: "Chiarezza",
      category: "Premessa",
      message:
        "La premessa è solida ma il salto al pentimento è brusco. Aggiungi un beat sul gesto fisico del solvente.",
    },
    {
      id: "sog-tone-1",
      group: "Tono",
      category: "Coerenza",
      message:
        "Il registro nel secondo paragrafo vira al lirico; il resto è più asciutto. Decidi se vuoi tenerlo voluto.",
    },
    {
      id: "sog-clarity-2",
      group: "Struttura",
      category: "Antagonista",
      message:
        "L'antagonista è nominato ma non agisce mai sulla pagina. Considera una scena di confronto diretto.",
    },
  ],
  [DocumentTypes.SYNOPSIS]: [
    {
      id: "syn-target-1",
      group: "Target formato",
      category: "Lunghezza",
      message:
        "Sei in target 1–2 cartelle. Non aggiungere altro: gli organismi di finanziamento si fermano alle prime due.",
    },
    {
      id: "syn-structure-1",
      group: "Struttura",
      category: "Finale",
      message:
        "Il finale è descritto in due frasi: serve un beat in più che renda esplicita la decisione del protagonista.",
    },
    {
      id: "syn-clarity-1",
      group: "Chiarezza",
      category: "Antefatto",
      message:
        "Il primo paragrafo presenta tre informazioni in due frasi. Spezza per dare respiro.",
    },
  ],
  [DocumentTypes.OUTLINE]: [
    {
      id: "out-beat-1",
      group: "Struttura",
      category: "Beat · catalyst",
      message:
        "Il catalyst arriva troppo tardi. Per un giallo, idealmente 10–15% del totale. Considera un'anticipazione.",
    },
    {
      id: "out-seq-1",
      group: "Struttura",
      category: "Sequenza",
      message:
        "La sequenza di apertura è densa di esposizione. Potresti spalmarla su due momenti più brevi.",
    },
    {
      id: "out-pace-1",
      group: "Ritmo",
      category: "Pacing",
      message:
        "Tre scene di seguito in interni. Considera un esterno diurno per dare respiro visivo.",
    },
  ],
  [DocumentTypes.TREATMENT]: [
    {
      id: "trt-density-1",
      group: "Lettura",
      category: "Densità",
      message:
        "La sequenza centrale è densa (frasi lunghe in media). Spezza per dare respiro al lettore.",
    },
    {
      id: "trt-tone-1",
      group: "Stile",
      category: "Tono · coerenza",
      message:
        "Il tono di Atto I è freddo; Atto II vira al malinconico. Va bene se è voluto.",
    },
    {
      id: "trt-clarity-1",
      group: "Chiarezza",
      category: "Voce narrante",
      message:
        "Alterni passato remoto e presente storico nello stesso capitolo. Scegli la voce dominante.",
    },
  ],
};

// ─── Core logic ───────────────────────────────────────────────────────────────

const callNarrativePolish = async (
  docType: NarrativePolishSuggestionDoc,
  content: string,
): Promise<NarrativePolishSuggestion[]> => {
  const trimmed = content.slice(0, 10_000);
  const result = await callHaiku(
    {
      system: SYSTEM_PROMPTS[docType],
      fewShot: [],
      user: trimmed,
      maxTokens: 1200,
      tools: [NARRATIVE_POLISH_TOOL],
      toolChoice: { type: "tool", name: TOOL_NAME },
    },
    "cesare/narrative-polish",
  );

  if (result.isErr()) {
    console.warn("[cesare/narrative-polish] callHaiku error:", result.error.message);
    return [];
  }

  const input = extractToolUse(result.value.content, TOOL_NAME);
  if (input === null) {
    console.warn(
      "[cesare/narrative-polish] no tool_use block, stop_reason:",
      result.value.stopReason,
    );
    return [];
  }

  const parsed = SuggestionsResponseSchema.safeParse(input);
  if (!parsed.success) {
    console.warn(
      "[cesare/narrative-polish] schema parse error:",
      parsed.error.issues.slice(0, 3),
    );
    return [];
  }

  return parsed.data.suggestions;
};

const handlePolishNarrativeDoc = (
  data: NarrativePolishInputData,
): ResultAsync<NarrativePolishSuggestion[], NarrativePolishError> => {
  const wantsMock =
    process.env["MOCK_AI"] === "true" || !process.env["ANTHROPIC_API_KEY"];

  if (wantsMock) {
    return ResultAsync.fromSafePromise(
      Promise.resolve(MOCK_SUGGESTIONS[data.docType]),
    );
  }

  return ResultAsync.fromPromise(
    callNarrativePolish(data.docType, data.content),
    (e) =>
      new NarrativePolishError(e instanceof Error ? e.message : String(e)),
  );
};

// ─── Server function ──────────────────────────────────────────────────────────

export const polishNarrativeDoc = createServerFn({ method: "GET" })
  .validator(NarrativePolishInput)
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        NarrativePolishSuggestion[],
        NarrativePolishError | ProjectAccessError
      >
    > =>
      toShape(
        await withProjectAccess(data.projectId, "view", () =>
          handlePolishNarrativeDoc(data),
        ),
      ),
  );

// ─── Query options ────────────────────────────────────────────────────────────

export const narrativePolishQueryOptions = (
  projectId: string,
  docType: NarrativePolishSuggestionDoc,
  content: string,
) =>
  queryOptions({
    queryKey: ["narrative-polish", projectId, docType, content.slice(0, 200)],
    queryFn: () => polishNarrativeDoc({ data: { projectId, docType, content } }),
    // Only fetch when there is meaningful content
    enabled: content.length > 50,
    // Suggestions remain valid for the entire session — they are re-fetched only
    // when the content key changes (i.e. the first 200 chars change).
    staleTime: Number.POSITIVE_INFINITY,
  });
