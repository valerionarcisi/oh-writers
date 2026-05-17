import { createServerFn } from "@tanstack/start";
import { z } from "zod";
import { eq, and, isNull, count } from "drizzle-orm";
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
} from "@oh-writers/db/schema";
import { toShape } from "@oh-writers/utils";
import { withProjectAccess } from "~/server/pipeline";
import type { Db } from "~/server/db";
import type { ProjectAccess } from "~/server/access";
import { loadAnthropicStreamingClient } from "~/features/ai/anthropic-client";

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
    "screenplay",
    "breakdown",
    "budget",
    "schedule",
    "shooting-plan",
  ]),
  sceneId: z.string().uuid().nullable(),
  sceneNumber: z.number().nullable(),
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

interface CesareContext {
  projectTitle: string;
  scenes: SceneRow[];
  currentScene: SceneRow | null;
  characters: string[];
  breakdownElements: BreakdownElementRow[];
  budget: BudgetSummary | null;
  schedule: ScheduleSummary | null;
}

const loadScreenplayContext = (
  db: Db,
  projectId: string,
): ResultAsync<{ title: string; scenes: SceneRow[]; characters: string[] }, CesareError> =>
  ResultAsync.fromPromise(
    (async () => {
      const [screenplay] = await db
        .select({ id: screenplays.id, title: screenplays.title })
        .from(screenplays)
        .where(eq(screenplays.projectId, projectId))
        .limit(1);

      if (!screenplay) {
        return { title: "Senza titolo", scenes: [], characters: [] };
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

const assembleContext = (
  db: Db,
  projectId: string,
  pageContext: PageContext,
): ResultAsync<CesareContext, CesareError> =>
  loadScreenplayContext(db, projectId).andThen((screenplay) =>
    loadBreakdownContext(db, projectId, pageContext.sceneId).andThen(
      (elements) =>
        loadBudgetSummary(db, projectId).andThen((budget) =>
          loadScheduleSummary(db, projectId).map((schedule) => {
            const currentScene =
              pageContext.sceneId !== null
                ? (screenplay.scenes.find((s) => s.id === pageContext.sceneId) ??
                  null)
                : null;

            return {
              projectTitle: screenplay.title,
              scenes: screenplay.scenes,
              currentScene,
              characters: screenplay.characters,
              breakdownElements: elements,
              budget,
              schedule,
            };
          }),
        ),
    ),
  );

// ─── System prompt ────────────────────────────────────────────────────────────

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

  return `Sei Cesare, l'assistente AI di Oh Writers, ispirato a Cesare Zavattini.
Non sei un chatbot generico. Conosci l'intera produzione del film "${ctx.projectTitle}".

CONTESTO PRODUZIONE:
- Sceneggiatura: ${ctx.scenes.length} scene, ${ctx.characters.length} personaggi
- Scena corrente: ${ctx.currentScene?.heading ?? "nessuna"}
- Budget: €${totalBudget} totale, €${residualBudget} residuo
- Schedule: ${shootingDaysLabel} giorni di ripresa
${breakdownCtx}

Rispondi in italiano. Sii concreto e specifico — non generare testo generico.
Quando suggerisci modifiche alla sceneggiatura, usa il formato Fountain.
Quando parli di costi, usa i numeri reali dal budget.
Quando parli di disponibilità, usa i dati reali dello schedule.`;
};

// ─── Mock mode ────────────────────────────────────────────────────────────────

const MOCK_RESPONSES: Record<string, string> = {
  default:
    "Ciao! Sono Cesare. Ho analizzato la produzione e sono pronto ad aiutarti.",
  screenplay:
    "Ho letto la scena. Il dialogo funziona ma il personaggio B appare in 3 scene consecutive — valuta se alleggerire qui.",
  breakdown:
    "La scena ha 7 elementi props. Le voci di costo maggiori sono la scrivania ministeriale (€480/g) e il tappeto XL (€220/g). Risparmio potenziale eliminando entrambi: €700.",
  budget:
    "Il budget categoria Cast è al 78% dell'allocato. Hai ancora €2.400 disponibili per le scene rimanenti con personaggi principali.",
  schedule:
    "Lo schedule ha 3 location che appaiono in scene non consecutive. Raggruppando le scene per location risparmi 2 giorni di set.",
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
