import { createServerFn } from "@tanstack/start";
import { z } from "zod";
import { eq, and, isNull, count, gte, lte, inArray } from "drizzle-orm";
import { ResultAsync } from "neverthrow";
import {
  screenplays,
  scenes,
  breakdownElements,
  breakdownOccurrences,
  budgets,
  budgetLines,
  schedules,
  shootingDays,
  locationRequirements,
  locationRequirementScenes,
  locationCandidates,
} from "@oh-writers/db/schema";
import { toShape } from "@oh-writers/utils";
import { withProjectAccess } from "~/server/pipeline";
import type { Db } from "~/server/db";
import type { ProjectAccess } from "~/server/access";
import { loadAnthropicStreamingClient } from "~/features/ai/anthropic-client";
import { runToolLoop } from "./cesare-tools";

// ─── Error ────────────────────────────────────────────────────────────────────

export class CesareError {
  readonly _tag = "CesareError" as const;
  readonly message: string;
  constructor(readonly cause: string) {
    this.message = `Cesare error: ${cause}`;
  }
}

// ─── Input schemas ────────────────────────────────────────────────────────────

const PageContextSchema = z.object({
  page: z.enum([
    "soggetto",
    "synopsis",
    "outline",
    "treatment",
    "screenplay",
    "breakdown",
    "budget",
    "schedule",
    "shooting-plan",
    "locations",
  ]),
  sceneId: z.string().uuid().nullable(),
  sceneNumber: z.number().nullable(),
  requirementId: z.string().uuid().nullable().optional(),
});

const ConversationMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

const CesareInputSchema = z.object({
  projectId: z.string().uuid(),
  message: z.string().min(1).max(2000),
  pageContext: PageContextSchema,
  conversationHistory: z.array(ConversationMessageSchema).max(20),
});

type CesareInput = z.infer<typeof CesareInputSchema>;
type PageContext = z.infer<typeof PageContextSchema>;
type ConversationMessage = z.infer<typeof ConversationMessageSchema>;

// ─── Context assembly ─────────────────────────────────────────────────────────

interface SceneRow {
  id: string;
  number: number;
  heading: string;
}

interface SceneBodyRow {
  id: string;
  number: number;
  heading: string;
  body: string | null;
  characterNames: string[];
  isCurrent: boolean;
}

interface BreakdownElementRow {
  category: string;
  name: string;
}

interface BudgetSummary {
  totalAllocated: number;
  residualByTopSheet: Record<string, number>;
}

interface ScheduleSummary {
  totalShootingDays: number;
  lockedDays: number;
}

interface LocationCandidateRow {
  id: string;
  name: string;
  address: string | null;
  status: string;
}

interface LinkedSceneRow {
  id: string;
  number: number;
  heading: string;
  intExt: string;
  timeOfDay: string | null;
  characterNames: string[];
  notes: string | null;
  breakdownElements: string[];
}

interface LocationRequirementRow {
  id: string;
  name: string;
  intExt: string | null;
  timeOfDay: string[];
  status: string;
  candidates: LocationCandidateRow[];
  linkedScenes: LinkedSceneRow[];
}

interface CesareContext {
  projectTitle: string;
  scenes: SceneRow[];
  currentScene: SceneRow | null;
  sceneWindow: SceneBodyRow[];
  characters: string[];
  breakdownElements: BreakdownElementRow[];
  budget: BudgetSummary | null;
  schedule: ScheduleSummary | null;
  locations: LocationRequirementRow[];
  currentRequirement: LocationRequirementRow | null;
}

const loadScreenplayContext = (
  db: Db,
  projectId: string,
): ResultAsync<{ id: string | null; title: string; scenes: SceneRow[]; characters: string[] }, CesareError> =>
  ResultAsync.fromPromise(
    (async () => {
      const [screenplay] = await db
        .select({ id: screenplays.id, title: screenplays.title })
        .from(screenplays)
        .where(eq(screenplays.projectId, projectId))
        .limit(1);

      if (!screenplay) {
        return { id: null, title: "Senza titolo", scenes: [], characters: [] };
      }

      const sceneRows = await db
        .select({
          id: scenes.id,
          number: scenes.number,
          heading: scenes.heading,
        })
        .from(scenes)
        .where(eq(scenes.screenplayId, screenplay.id))
        .orderBy(scenes.number);

      // Collect unique character names across all scenes
      const allCharNames = await db
        .select({ characterNames: scenes.characterNames })
        .from(scenes)
        .where(eq(scenes.screenplayId, screenplay.id));

      const uniqueChars = Array.from(
        new Set(allCharNames.flatMap((r) => r.characterNames)),
      ).filter(Boolean);

      return {
        id: screenplay.id,
        title: screenplay.title,
        scenes: sceneRows,
        characters: uniqueChars,
      };
    })(),
    (e) =>
      new CesareError(
        `Failed to load screenplay: ${e instanceof Error ? e.message : String(e)}`,
      ),
  );

const loadBreakdownContext = (
  db: Db,
  projectId: string,
  sceneId: string | null,
): ResultAsync<BreakdownElementRow[], CesareError> =>
  ResultAsync.fromPromise(
    (async () => {
      if (!sceneId) {
        // Return all non-archived elements for the project
        return db
          .select({
            category: breakdownElements.category,
            name: breakdownElements.name,
          })
          .from(breakdownElements)
          .where(
            and(
              eq(breakdownElements.projectId, projectId),
              isNull(breakdownElements.archivedAt),
            ),
          );
      }

      // Return elements linked to the specific scene via occurrences
      return db
        .select({
          category: breakdownElements.category,
          name: breakdownElements.name,
        })
        .from(breakdownElements)
        .innerJoin(
          breakdownOccurrences,
          eq(breakdownOccurrences.elementId, breakdownElements.id),
        )
        .where(
          and(
            eq(breakdownElements.projectId, projectId),
            eq(breakdownOccurrences.sceneId, sceneId),
            isNull(breakdownElements.archivedAt),
          ),
        );
    })(),
    (e) =>
      new CesareError(
        `Failed to load breakdown: ${e instanceof Error ? e.message : String(e)}`,
      ),
  );

const loadBudgetSummary = (
  db: Db,
  projectId: string,
): ResultAsync<BudgetSummary | null, CesareError> =>
  ResultAsync.fromPromise(
    (async () => {
      const [budget] = await db
        .select({ id: budgets.id })
        .from(budgets)
        .where(eq(budgets.projectId, projectId))
        .limit(1);

      if (!budget) return null;

      const lines = await db
        .select({
          topSheet: budgetLines.topSheet,
          rate: budgetLines.rate,
          quantity: budgetLines.quantity,
          actual: budgetLines.actual,
        })
        .from(budgetLines)
        .where(eq(budgetLines.budgetId, budget.id));

      const residualByTopSheet: Record<string, number> = {};
      let totalAllocated = 0;

      for (const line of lines) {
        const estimated =
          line.quantity !== null && line.rate !== null
            ? Number(line.quantity) * Number(line.rate)
            : 0;
        const spent = line.actual !== null ? Number(line.actual) : 0;
        const residual = estimated - spent;

        totalAllocated += estimated;
        residualByTopSheet[line.topSheet] =
          (residualByTopSheet[line.topSheet] ?? 0) + residual;
      }

      return { totalAllocated, residualByTopSheet };
    })(),
    (e) =>
      new CesareError(
        `Failed to load budget: ${e instanceof Error ? e.message : String(e)}`,
      ),
  );

const loadScheduleSummary = (
  db: Db,
  projectId: string,
): ResultAsync<ScheduleSummary | null, CesareError> =>
  ResultAsync.fromPromise(
    (async () => {
      const [schedule] = await db
        .select({ id: schedules.id })
        .from(schedules)
        .where(eq(schedules.projectId, projectId))
        .limit(1);

      if (!schedule) return null;

      const [totals] = await db
        .select({ total: count() })
        .from(shootingDays)
        .where(
          and(
            eq(shootingDays.scheduleId, schedule.id),
          ),
        );

      // shootingDays table has no locked flag — count all shoot-type days
      // as total; locked state lives on strips, not days
      const totalShootingDays = totals?.total ?? 0;

      return {
        totalShootingDays: Number(totalShootingDays),
        lockedDays: 0,
      };
    })(),
    (e) =>
      new CesareError(
        `Failed to load schedule: ${e instanceof Error ? e.message : String(e)}`,
      ),
  );

const loadLocationsContext = (
  db: Db,
  projectId: string,
): ResultAsync<LocationRequirementRow[], CesareError> =>
  ResultAsync.fromPromise(
    (async () => {
      const reqs = await db
        .select({
          id: locationRequirements.id,
          name: locationRequirements.name,
          intExt: locationRequirements.intExt,
          timeOfDay: locationRequirements.timeOfDay,
          status: locationRequirements.status,
        })
        .from(locationRequirements)
        .where(eq(locationRequirements.projectId, projectId));

      if (reqs.length === 0) return [];

      const reqIds = reqs.map((r) => r.id);

      const allCandidates = await db
        .select({
          id: locationCandidates.id,
          requirementId: locationCandidates.requirementId,
          name: locationCandidates.name,
          address: locationCandidates.address,
          status: locationCandidates.status,
        })
        .from(locationCandidates)
        .innerJoin(
          locationRequirements,
          eq(locationCandidates.requirementId, locationRequirements.id),
        )
        .where(eq(locationRequirements.projectId, projectId));

      // Load scenes linked to each requirement with their breakdown elements
      const allLinkedSceneJoins = reqIds.length === 0 ? [] : await db
        .select({
          requirementId: locationRequirementScenes.requirementId,
          sceneId: locationRequirementScenes.sceneId,
          number: scenes.number,
          heading: scenes.heading,
          intExt: scenes.intExt,
          timeOfDay: scenes.timeOfDay,
          characterNames: scenes.characterNames,
          notes: scenes.notes,
        })
        .from(locationRequirementScenes)
        .innerJoin(scenes, eq(locationRequirementScenes.sceneId, scenes.id))
        .innerJoin(locationRequirements, eq(locationRequirementScenes.requirementId, locationRequirements.id))
        .where(eq(locationRequirements.projectId, projectId));

      // Load breakdown elements for each linked scene
      const linkedSceneIds = allLinkedSceneJoins.map((j) => j.sceneId);
      const allSceneElements = linkedSceneIds.length === 0 ? [] : await db
        .select({
          sceneId: breakdownOccurrences.sceneId,
          category: breakdownElements.category,
          name: breakdownElements.name,
        })
        .from(breakdownOccurrences)
        .innerJoin(breakdownElements, eq(breakdownOccurrences.elementId, breakdownElements.id))
        .where(
          and(
            eq(breakdownElements.projectId, projectId),
            isNull(breakdownElements.archivedAt),
          ),
        );

      const elementsByScene = allSceneElements.reduce<Record<string, string[]>>((acc, el) => {
        if (!el.sceneId) return acc;
        const list = acc[el.sceneId] ?? [];
        list.push(`${el.name} (${el.category})`);
        acc[el.sceneId] = list;
        return acc;
      }, {});

      return reqs.map((req) => ({
        ...req,
        timeOfDay: (req.timeOfDay as string[] | null) ?? [],
        candidates: allCandidates
          .filter((c) => c.requirementId === req.id)
          .map((c) => ({ id: c.id, name: c.name, address: c.address, status: c.status })),
        linkedScenes: allLinkedSceneJoins
          .filter((j) => j.requirementId === req.id)
          .map((j) => ({
            id: j.sceneId,
            number: j.number,
            heading: j.heading,
            intExt: j.intExt,
            timeOfDay: j.timeOfDay,
            characterNames: j.characterNames,
            notes: j.notes,
            breakdownElements: elementsByScene[j.sceneId] ?? [],
          })),
      }));
    })(),
    (e) =>
      new CesareError(
        `Failed to load locations: ${e instanceof Error ? e.message : String(e)}`,
      ),
  );

// Loads a window of scenes around the current scene, including their body text.
// For locations context, loads scenes linked to the current requirement instead.
const loadSceneWindow = (
  db: Db,
  projectId: string,
  screenplayId: string | null,
  centerSceneNumber: number | null,
  linkedSceneIds: string[],
  windowSize = 2,
): ResultAsync<SceneBodyRow[], CesareError> => {
  if (!screenplayId) return ResultAsync.fromSafePromise(Promise.resolve([]));

  return ResultAsync.fromPromise(
    (async (): Promise<SceneBodyRow[]> => {
      // For locations: load the specific linked scenes by ID
      if (linkedSceneIds.length > 0) {
        const rows = await db
          .select({
            id: scenes.id,
            number: scenes.number,
            heading: scenes.heading,
            body: scenes.notes,
            characterNames: scenes.characterNames,
          })
          .from(scenes)
          .where(inArray(scenes.id, linkedSceneIds));
        return rows.map((r) => ({ ...r, isCurrent: true }));
      }

      // For all other pages: window around the current scene number
      if (centerSceneNumber === null) return [];

      const minNum = Math.max(1, centerSceneNumber - windowSize);
      const maxNum = centerSceneNumber + windowSize;

      const rows = await db
        .select({
          id: scenes.id,
          number: scenes.number,
          heading: scenes.heading,
          body: scenes.notes,
          characterNames: scenes.characterNames,
        })
        .from(scenes)
        .where(
          and(
            eq(scenes.screenplayId, screenplayId),
            gte(scenes.number, minNum),
            lte(scenes.number, maxNum),
          ),
        )
        .orderBy(scenes.number);

      return rows.map((r) => ({
        ...r,
        isCurrent: r.number === centerSceneNumber,
      }));
    })(),
    (e) => new CesareError(`loadSceneWindow failed: ${e instanceof Error ? e.message : String(e)}`),
  );
};

const assembleContext = (
  db: Db,
  projectId: string,
  pageContext: PageContext,
): ResultAsync<CesareContext, CesareError> =>
  loadScreenplayContext(db, projectId).andThen((screenplay) =>
    loadBreakdownContext(db, projectId, pageContext.sceneId).andThen(
      (elements) =>
        loadBudgetSummary(db, projectId).andThen((budget) =>
          loadScheduleSummary(db, projectId).andThen((schedule) =>
            loadLocationsContext(db, projectId).andThen((locations) => {
              // sceneId may be "" when only sceneNumber is known (screenplay editor scroll tracking)
              const effectiveSceneId = pageContext.sceneId && pageContext.sceneId.length > 10
                ? pageContext.sceneId
                : null;
              const currentScene = effectiveSceneId
                ? (screenplay.scenes.find((s) => s.id === effectiveSceneId) ?? null)
                : pageContext.sceneNumber !== null
                  ? (screenplay.scenes.find((s) => s.number === pageContext.sceneNumber) ?? null)
                  : null;

              const currentRequirement =
                pageContext.requirementId
                  ? (locations.find((r) => r.id === pageContext.requirementId) ?? null)
                  : null;

              // For locations: use linked scene IDs; for other pages: use number window
              const linkedSceneIds =
                currentRequirement?.linkedScenes.map((s) => s.id) ?? [];

              return loadSceneWindow(
                db,
                projectId,
                screenplay.id,
                currentScene?.number ?? pageContext.sceneNumber,
                linkedSceneIds,
              ).map((sceneWindow) => ({
                projectTitle: screenplay.title,
                scenes: screenplay.scenes,
                currentScene,
                sceneWindow,
                characters: screenplay.characters,
                breakdownElements: elements,
                budget,
                schedule,
                locations,
                currentRequirement,
              }));
            }),
          ),
        ),
    ),
  );

// ─── System prompt ────────────────────────────────────────────────────────────

const MAX_BODY_CHARS = 600;

const formatSceneWindow = (window: SceneBodyRow[]): string => {
  if (window.length === 0) return "";

  const lines = window.map((s) => {
    const label = s.isCurrent ? "SCENA CORRENTE" : `Scena ${s.number}`;
    const chars = s.characterNames.length > 0 ? ` [${s.characterNames.join(", ")}]` : "";
    const body = s.body
      ? (s.body.length > MAX_BODY_CHARS ? s.body.slice(0, MAX_BODY_CHARS) + "…" : s.body)
      : "(nessun corpo)";
    return `${label} ${s.number}: ${s.heading}${chars}\n---\n${body}\n---`;
  });

  return `\nTESTO SCENEGGIATURA:\n${lines.join("\n\n")}`;
};

const formatBreakdownContext = (
  elements: BreakdownElementRow[],
  sceneId: string | null,
): string => {
  if (elements.length === 0) return "";

  const grouped = elements.reduce<Record<string, string[]>>((acc, el) => {
    const list = acc[el.category] ?? [];
    list.push(el.name);
    acc[el.category] = list;
    return acc;
  }, {});

  const scope = sceneId !== null ? "scena corrente" : "produzione";
  const lines = Object.entries(grouped).map(
    ([cat, names]) => `  - ${cat}: ${names.join(", ")}`,
  );

  return `\nELEMENTI BREAKDOWN (${scope}):\n${lines.join("\n")}`;
};

const formatLocationsContext = (ctx: CesareContext): string => {
  if (ctx.locations.length === 0) return "";

  const formatRequirement = (req: LocationRequirementRow, selected: boolean): string => {
    const candidateLines = req.candidates.length > 0
      ? req.candidates.map((c) => `    - ${c.name}${c.address ? ` (${c.address})` : ""} [${c.status}]`).join("\n")
      : "    Nessun candidato ancora";

    const sceneLines = req.linkedScenes.length > 0
      ? req.linkedScenes.map((s) => {
          const chars = s.characterNames.length > 0 ? `Personaggi: ${s.characterNames.join(", ")}` : "";
          const els = s.breakdownElements.length > 0 ? `Elementi: ${s.breakdownElements.slice(0, 8).join(", ")}` : "";
          const notes = s.notes ? `Note: ${s.notes}` : "";
          const details = [chars, els, notes].filter(Boolean).join(" | ");
          return `    - Scena ${s.number}: ${s.heading}${details ? ` — ${details}` : ""}`;
        }).join("\n")
      : "    Nessuna scena collegata";

    const meta = [
      req.intExt ?? "",
      req.timeOfDay.length > 0 ? req.timeOfDay.join("/") : "",
    ].filter(Boolean).join(" · ");

    const header = selected
      ? `LOCATION SELEZIONATA: "${req.name}"${meta ? ` [${meta}]` : ""} [${req.status}]\n  requirement_id: ${req.id}`
      : `  - "${req.name}"${meta ? ` [${meta}]` : ""} [${req.status}] (requirement_id: ${req.id})`;

    if (selected) {
      return `\n${header}\n  Candidati:\n${candidateLines}\n  Scene del copione:\n${sceneLines}\nQuando aggiungi candidati usa sempre requirement_id: ${req.id}`;
    }
    return header;
  };

  if (ctx.currentRequirement) {
    return formatRequirement(ctx.currentRequirement, true);
  }

  const summary = ctx.locations.map((r) => formatRequirement(r, false)).join("\n");
  return `\nLOCATION DEL PROGETTO (${ctx.locations.length} requisiti):\n${summary}`;
};

const buildSystemPrompt = (ctx: CesareContext): string => {
  const totalBudget = ctx.budget
    ? Math.round(ctx.budget.totalAllocated).toLocaleString("it-IT")
    : "N/D";

  const residualBudget = ctx.budget
    ? Math.round(
        Object.values(ctx.budget.residualByTopSheet).reduce((a, b) => a + b, 0),
      ).toLocaleString("it-IT")
    : "N/D";

  const shootingDaysLabel = ctx.schedule
    ? String(ctx.schedule.totalShootingDays)
    : "N/D";

  const breakdownCtx = formatBreakdownContext(
    ctx.breakdownElements,
    ctx.currentScene?.id ?? null,
  );

  const locationsCtx = formatLocationsContext(ctx);
  const sceneWindowCtx = formatSceneWindow(ctx.sceneWindow);

  return `Sei Cesare, l'assistente AI di Oh Writers, ispirato a Cesare Zavattini.
Non sei un chatbot generico. Conosci l'intera produzione del film "${ctx.projectTitle}".

CONTESTO PRODUZIONE:
- Sceneggiatura: ${ctx.scenes.length} scene, ${ctx.characters.length} personaggi
- Scena corrente: ${ctx.currentScene?.heading ?? "nessuna"}
- Budget: €${totalBudget} totale, €${residualBudget} residuo
- Schedule: ${shootingDaysLabel} giorni di ripresa
${breakdownCtx}${locationsCtx}${sceneWindowCtx}

Rispondi in italiano. Sii concreto e specifico — non generare testo generico.
Quando suggerisci modifiche alla sceneggiatura, usa il formato Fountain.
Quando parli di costi, usa i numeri reali dal budget.
Quando parli di disponibilità, usa i dati reali dello schedule.
Quando parli di location, aiuta il regista a valutare i candidati in base al contesto narrativo della scena.
Quando hai il testo della sceneggiatura, citalo esplicitamente nelle tue risposte.`;
};

// ─── Mock mode ────────────────────────────────────────────────────────────────

const MOCK_RESPONSES: Record<string, string> = {
  default:
    "Ciao! Sono Cesare. Ho analizzato la produzione e sono pronto ad aiutarti.",
  soggetto:
    "Il conflitto centrale è chiaramente delineato. Attenzione all'arco del protagonista: il cambiamento avviene troppo tardi rispetto alla struttura classica in tre atti.",
  synopsis:
    "La sinossi è efficace. Il tono è coerente con il genere. Valuta di aggiungere una frase sul tema emotivo centrale — manca il 'perché ci interessa questa storia'.",
  outline:
    "La scaletta ha un ottimo primo atto. Il secondo è lungo — valuta di anticipare il punto di svolta alla scena 18 invece che alla 22.",
  treatment:
    "Il trattamento ha un buon ritmo. La sequenza alle pagine 8-10 è densa: considera di spezzarla con una scena di respiro.",
  screenplay:
    "Ho letto la scena. Il dialogo funziona ma il personaggio B appare in 3 scene consecutive — valuta se alleggerire qui.",
  breakdown:
    "La scena ha 7 elementi props. Le voci di costo maggiori sono la scrivania ministeriale (€480/g) e il tappeto XL (€220/g). Risparmio potenziale eliminando entrambi: €700.",
  budget:
    "Il budget categoria Cast è al 78% dell'allocato. Hai ancora €2.400 disponibili per le scene rimanenti con personaggi principali.",
  schedule:
    "Lo schedule ha 3 location che appaiono in scene non consecutive. Raggruppando le scene per location risparmi 2 giorni di set.",
  "shooting-plan":
    "Il piano inquadrature prevede 14 setup per questa scena. Raggruppando per angolo di ripresa puoi ridurre a 9 setup e guadagnare circa 90 minuti di set.",
  locations:
    "Ho analizzato i tuoi candidati. Il secondo sembra più adatto al tono del film — spazio neutro che lascia parlare i personaggi. Il primo rischia di distrarre. Ti suggerisco di visitarlo in una giornata feriale per valutare rumori e luce naturale.",
};

const mockResponse = (pageContext: PageContext): ResultAsync<string, CesareError> =>
  ResultAsync.fromSafePromise(
    Promise.resolve(MOCK_RESPONSES[pageContext.page] ?? MOCK_RESPONSES["default"]!),
  );

// ─── Anthropic streaming call ─────────────────────────────────────────────────

const CESARE_MODEL = "claude-sonnet-4-6";

const callCesare = (
  systemPrompt: string,
  conversationHistory: ConversationMessage[],
  message: string,
): ResultAsync<string, CesareError> =>
  ResultAsync.fromPromise(
    (async () => {
      const client = await loadAnthropicStreamingClient();

      const messages = [
        ...conversationHistory.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        { role: "user" as const, content: message },
      ];

      const stream = client.messages.stream({
        model: CESARE_MODEL,
        max_tokens: 1024,
        system: systemPrompt,
        messages,
      });

      // Collect all text chunks from the stream
      const chunks: string[] = [];
      stream.on("inputJson", (delta: string) => {
        chunks.push(delta);
      });

      // Wait for the stream to complete; then gather the final text content
      const finalMsg = (await stream.finalMessage()) as {
        content: Array<{ type: string; text?: string }>;
      };

      // finalMessage() gives the fully assembled message with text blocks
      const textContent = finalMsg.content
        .filter((b) => b.type === "text" && typeof b.text === "string")
        .map((b) => b.text as string)
        .join("");

      return textContent;
    })(),
    (e) =>
      new CesareError(
        `Anthropic streaming failed: ${e instanceof Error ? e.message : String(e)}`,
      ),
  );

// ─── Agentic tool loop (locations) ───────────────────────────────────────────

const loadAnthropicNonStreaming = async () => {
  const sdkModule = "@anthropic-ai/sdk";
  const sdk = (await import(/* @vite-ignore */ sdkModule)) as {
    default?: new (cfg: { apiKey: string }) => {
      messages: {
        create(args: Record<string, unknown>): Promise<{
          content: unknown[];
          stop_reason?: string | null;
        }>;
      };
    };
  } & {
    new (cfg: { apiKey: string }): {
      messages: {
        create(args: Record<string, unknown>): Promise<{
          content: unknown[];
          stop_reason?: string | null;
        }>;
      };
    };
  };
  const Ctor = sdk.default ?? sdk;
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  return new Ctor({ apiKey });
};

const callCesareWithTools = (
  systemPrompt: string,
  conversationHistory: ConversationMessage[],
  message: string,
  db: Db,
  projectId: string,
  requirementId: string | null | undefined,
): ResultAsync<string, CesareError> =>
  ResultAsync.fromPromise(
    loadAnthropicNonStreaming(),
    (e) => new CesareError(`Failed to load Anthropic client: ${e instanceof Error ? e.message : String(e)}`),
  ).andThen((client) => {
    const messages = [
      ...conversationHistory.map((m) => ({ role: m.role, content: m.content })),
      { role: "user" as const, content: message },
    ];
    return runToolLoop(client, systemPrompt, messages, db, projectId, CESARE_MODEL, requirementId ?? null);
  });

// ─── Handler body ─────────────────────────────────────────────────────────────

const handleAskCesare = (
  data: CesareInput,
  db: Db,
  _access: ProjectAccess,
): ResultAsync<string, CesareError> => {
  if (process.env["MOCK_AI"] === "true") {
    return mockResponse(data.pageContext);
  }

  return assembleContext(db, data.projectId, data.pageContext).andThen((ctx) => {
    const systemPrompt = buildSystemPrompt(ctx);
    if (data.pageContext.page === "locations") {
      return callCesareWithTools(
        systemPrompt,
        data.conversationHistory,
        data.message,
        db,
        data.projectId,
        data.pageContext.requirementId,
      );
    }
    return callCesare(systemPrompt, data.conversationHistory, data.message);
  });
};

// ─── Server function ──────────────────────────────────────────────────────────

export const askCesare = createServerFn({ method: "POST" })
  .validator(CesareInputSchema)
  .handler(async ({ data }) =>
    toShape(
      await withProjectAccess(data.projectId, "view", ({ db, access }) =>
        handleAskCesare(data, db, access),
      ),
    ),
  );
