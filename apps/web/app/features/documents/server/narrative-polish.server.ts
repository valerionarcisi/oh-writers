import { createServerFn } from "@tanstack/start";
import { z } from "zod";
import { ok, ResultAsync } from "neverthrow";
import { queryOptions } from "@tanstack/react-query";
import {
  createEditorialApprovalAdvice,
  dedupeEditorialAdvice,
  DocumentTypes,
  EditorialAdviceListSchema,
  sortEditorialAdvice,
  type EditorialAdvice,
} from "@oh-writers/domain";
import { toShape, type ResultShape } from "@oh-writers/utils";
import { withProjectAccess } from "~/server/pipeline";
import { callHaiku, extractToolUse } from "~/features/ai";
import { fetchEditorialAdviceDecisionsBlock } from "~/features/predictions/editorial-advice-decisions.server";
import type { ProjectAccessError } from "~/server/access";
import { getDb } from "~/server/db";
import { documents, projects } from "@oh-writers/db/schema";
import { and, eq } from "drizzle-orm";
import {
  type NarrativePolishSuggestionDoc,
  TOOL_NAME,
  NARRATIVE_POLISH_TOOL,
  NARRATIVE_POLISH_MAX_TOKENS,
  GROUNDING_RULES,
  buildNarrativeSystemPrompt,
  SYSTEM_PROMPTS,
} from "./narrative-polish-prompt";

// Re-export the pure prompt assets so existing importers keep one entry point.
export {
  TOOL_NAME,
  NARRATIVE_POLISH_TOOL,
  NARRATIVE_POLISH_MAX_TOKENS,
  GROUNDING_RULES,
  buildNarrativeSystemPrompt,
  SYSTEM_PROMPTS,
};
export type { NarrativePolishSuggestionDoc };

// ─── Types ─────────────────────────────────────────────────────────────────────

export class NarrativePolishError {
  readonly _tag = "NarrativePolishError" as const;
  readonly message: string;
  constructor(readonly cause: string) {
    this.message = `Narrative polish error: ${cause}`;
  }
}

export type NarrativePolishSuggestion = EditorialAdvice;

// ─── Input schema ─────────────────────────────────────────────────────────────

const NarrativePolishInput = z.object({
  projectId: z.string().uuid(),
  docType: z.enum([
    DocumentTypes.LOGLINE,
    DocumentTypes.SOGGETTO,
    DocumentTypes.SYNOPSIS,
    DocumentTypes.OUTLINE,
    DocumentTypes.TREATMENT,
  ]),
  content: z.string().min(1).max(50_000),
});

type NarrativePolishInputData = z.infer<typeof NarrativePolishInput>;

// ─── Mock fallback ────────────────────────────────────────────────────────────

const MOCK_SUGGESTIONS: Record<
  NarrativePolishSuggestionDoc,
  NarrativePolishSuggestion[]
> = {
  [DocumentTypes.LOGLINE]: [
    {
      id: "logline-ok-1",
      area: "logline",
      title: "Premessa compatta e già leggibile",
      body: "La logline regge se vuoi restare asciutto. Non la allargherei solo per spiegare di più.",
      type: "approved",
      severity: "optional",
      status: "approved",
      minimalIntervention:
        "Al massimo stringi una parola ridondante, senza cambiare la promessa.",
    },
  ],
  [DocumentTypes.SOGGETTO]: [
    {
      id: "sog-structure-1",
      area: "structure",
      title: "Snodo centrale da rendere più leggibile",
      body: "Il salto verso il pentimento arriva un po' brusco. Qui parlerei di rischio concreto, non di buco strutturale.",
      type: "risk",
      severity: "medium",
      whyItMatters:
        "Se il passaggio resta troppo astratto, l'emozione può sembrare anticipata.",
      minimalIntervention:
        "Aggiungi un gesto o un micro-beat che renda visibile il cambio di energia.",
    },
    {
      id: "sog-tone-1",
      area: "tone",
      title: "Slittamento lirico che può essere una scelta",
      body: "Il secondo paragrafo si apre di più del resto. Non lo leggerei come errore se vuoi far entrare una vibrazione più scoperta.",
      type: "authorial_choice",
      severity: "low",
      whenToIgnore:
        "Ignora questa nota se quello scarto serve a far sentire un'apertura emotiva momentanea.",
    },
    {
      id: "sog-clarity-2",
      area: "clarity",
      title: "Pressione antagonista evocata più che visibile",
      body: "La controforza è presente ma resta fuori campo. Interverrei solo se vuoi più attrito in pagina, non per obbligo di schema.",
      type: "optional",
      severity: "optional",
      minimalIntervention:
        "Basta un segnale concreto della pressione, non serve introdurre un confronto pieno.",
    },
  ],
  [DocumentTypes.SYNOPSIS]: [
    {
      id: "syn-format-1",
      area: "format",
      title: "Formato già in controllo",
      body: "La sinossi sta dentro una lettura produttiva. Qui non allargherei il testo solo per spiegare meglio.",
      type: "already_resolved",
      severity: "optional",
      status: "resolved",
    },
    {
      id: "syn-ending-1",
      area: "ending",
      title: "Finale leggibile senza esplicitarlo troppo",
      body: "L'emozione finale arriva. Chiederei più esposizione solo se vuoi una chiusura più lineare, non perché manchi un obbligo.",
      type: "authorial_choice",
      severity: "low",
      whenToIgnore:
        "Se il progetto vive di un'ultima vibrazione sospesa, questa ellissi è coerente.",
    },
    {
      id: "syn-clarity-1",
      area: "clarity",
      title: "Ingresso iniziale un po' compatto",
      body: "Il primo paragrafo porta molte informazioni ravvicinate. Qui sì: una piccola apertura aiuterebbe la leggibilità.",
      type: "real_problem",
      severity: "medium",
      minimalIntervention:
        "Spezza una frase o sposta un dettaglio alla riga successiva.",
    },
  ],
  [DocumentTypes.OUTLINE]: [
    {
      id: "out-structure-1",
      area: "structure",
      title: "Cerniera narrativa da anticipare di poco",
      body: "Il punto che rimette in moto la progressione arriva quando l'energia sta già calando. Lo vedo come rischio di ritmo concreto.",
      type: "risk",
      severity: "medium",
      minimalIntervention:
        "Anticipa un'informazione o un gesto che metta pressione una scena prima.",
    },
    {
      id: "out-rhythm-1",
      area: "rhythm",
      title: "Apertura densa ma non sbagliata",
      body: "La prima sequenza concentra parecchio materiale. La alleggerirei solo se senti davvero attrito di lettura.",
      type: "optional",
      severity: "low",
      minimalIntervention:
        "Accorpa o separa due beat, senza ripensare tutta la struttura.",
    },
    {
      id: "out-ok-1",
      area: "outline",
      title: "Progressione abbastanza risolta",
      body: "Non emergono problemi strutturali gravi. Procederei oltre, salvo micro-rifiniture locali.",
      type: "approved",
      severity: "optional",
      status: "approved",
    },
  ],
  [DocumentTypes.TREATMENT]: [
    {
      id: "trt-rhythm-1",
      area: "rhythm",
      title: "Sequenza centrale da far respirare",
      body: "Qui la densità di lettura si sente davvero. Il punto non è spiegare di più, ma far passare meglio l'energia.",
      type: "real_problem",
      severity: "medium",
      minimalIntervention:
        "Taglia una ripetizione o spezza un periodo lungo in due battute narrative.",
    },
    {
      id: "trt-tone-1",
      area: "tone",
      title: "Virata emotiva leggibile e plausibile",
      body: "La temperatura si apre nel centro del trattamento. Potrebbe essere una buona scelta, non una incoerenza automatica.",
      type: "authorial_choice",
      severity: "low",
      whenToIgnore:
        "Ignora la nota se vuoi proprio che il testo si incrini in quella zona.",
    },
    {
      id: "trt-clarity-1",
      area: "clarity",
      title: "Voce verbale da riallineare",
      body: "L'alternanza tra passato remoto e presente storico crea una frizione vera di lettura. Qui interverrei.",
      type: "real_problem",
      severity: "high",
      whyItMatters:
        "Il cambio di tempo verbale distrae dal flusso e fa sembrare instabile la voce.",
      minimalIntervention:
        "Scegli il tempo dominante del capitolo e riallinea solo le frasi fuori asse.",
    },
  ],
};

// ─── Core logic ───────────────────────────────────────────────────────────────

const callNarrativePolish = async (
  docType: NarrativePolishSuggestionDoc,
  prompt: string,
): Promise<NarrativePolishSuggestion[]> => {
  const trimmed = prompt.slice(0, 12_000);
  const result = await callHaiku(
    {
      system: SYSTEM_PROMPTS[docType],
      fewShot: [],
      user: trimmed,
      maxTokens: NARRATIVE_POLISH_MAX_TOKENS,
      tools: [NARRATIVE_POLISH_TOOL],
      toolChoice: { type: "tool", name: TOOL_NAME },
    },
    "cesare/narrative-polish",
  );

  // A failed call is NOT the same as a clean document. Throwing here surfaces a
  // NarrativePolishError (via the caller's ResultAsync) → the panel shows its
  // error state, instead of a fabricated "OK editoriale" indistinguishable from
  // genuinely fine text. See #99.
  if (result.isErr()) {
    throw new Error(`callHaiku: ${result.error.message}`);
  }

  const input = extractToolUse(result.value.content, TOOL_NAME);
  if (input === null) {
    // stop_reason=max_tokens leaves an empty/partial tool input; treat truncation
    // as a failure to retry, never as "the text is fine".
    throw new Error(
      `no usable tool_use block (stop_reason=${result.value.stopReason})`,
    );
  }

  const parsed = EditorialAdviceListSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(
      `schema parse: ${JSON.stringify(parsed.error.issues.slice(0, 3))}`,
    );
  }

  const deduped = sortEditorialAdvice(
    dedupeEditorialAdvice(parsed.data.suggestions),
  );
  return deduped.length > 0
    ? deduped
    : [createEditorialApprovalAdvice(docTypeToArea(docType))];
};

const docTypeToArea = (docType: NarrativePolishSuggestionDoc): string =>
  docType === DocumentTypes.SOGGETTO
    ? "subject"
    : docType === DocumentTypes.SYNOPSIS
      ? "synopsis"
      : docType === DocumentTypes.OUTLINE
        ? "outline"
        : docType === DocumentTypes.TREATMENT
          ? "treatment"
          : "logline";

const buildPromptInput = async (
  data: NarrativePolishInputData,
): Promise<string> => {
  const db = await getDb();
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, data.projectId),
    columns: { title: true, format: true, genre: true },
  });
  const loglineDoc = await db.query.documents.findFirst({
    where: and(
      eq(documents.projectId, data.projectId),
      eq(documents.type, DocumentTypes.LOGLINE),
    ),
    columns: { content: true },
  });
  const decisionsBlock = await fetchEditorialAdviceDecisionsBlock(
    db,
    data.projectId,
    data.docType,
  );

  return [
    `Titolo progetto: ${project?.title ?? "N/D"}`,
    `Formato: ${project?.format ?? "N/D"}`,
    `Genere: ${project?.genre ?? "N/D"}`,
    `Logline del progetto: ${loglineDoc?.content?.trim() || "N/D"}`,
    `Documento in revisione: ${data.docType}`,
    "",
    "Obiettivo editoriale:",
    "- individua i problemi reali e i rischi concreti, e mostrali sempre",
    "- tratta le scelte autoriali come tali, ma non nasconderle: classificale",
    "- non nascondere un rilievo reale: al più declassalo, mai ometterlo",
    "- se il testo è genuinamente risolto, dillo apertamente con un OK editoriale",
    ...(decisionsBlock ? ["", decisionsBlock] : []),
    "",
    "Documento:",
    data.content,
  ].join("\n");
};

const handlePolishNarrativeDoc = (
  data: NarrativePolishInputData,
): ResultAsync<NarrativePolishSuggestion[], NarrativePolishError> => {
  const wantsMock =
    process.env["MOCK_AI"] === "true" || !process.env["ANTHROPIC_API_KEY"];

  if (wantsMock) {
    return ResultAsync.fromSafePromise(
      Promise.resolve(sortEditorialAdvice(MOCK_SUGGESTIONS[data.docType])),
    );
  }

  return ResultAsync.fromPromise(
    buildPromptInput(data),
    (e) =>
      new NarrativePolishError(
        e instanceof Error ? `context: ${e.message}` : String(e),
      ),
  ).andThen((prompt) =>
    ResultAsync.fromPromise(
      callNarrativePolish(data.docType, prompt),
      (e) =>
        new NarrativePolishError(e instanceof Error ? e.message : String(e)),
    ),
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
  fingerprint?: string,
) =>
  queryOptions({
    queryKey: [
      "narrative-polish",
      projectId,
      docType,
      fingerprint ?? content.slice(0, 200),
    ],
    queryFn: () =>
      polishNarrativeDoc({ data: { projectId, docType, content } }),
    // Only fetch when there is meaningful content
    enabled: content.length > (docType === DocumentTypes.LOGLINE ? 12 : 50),
    // Suggestions remain valid for the entire session — they are re-fetched only
    // when the content key changes (i.e. the first 200 chars change).
    staleTime: Number.POSITIVE_INFINITY,
  });
