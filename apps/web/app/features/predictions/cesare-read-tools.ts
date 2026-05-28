// Lazy-RAG read tools. Cesare fetches data on demand instead of receiving
// the full project payload up front. Every executor scopes its query by
// projectId so the agent loop cannot leak across tenants — the surrounding
// `withProjectAccess` already authorised the project, we re-assert here as
// a defence-in-depth measure against id confusion in the LLM.

import { tool } from "ai";
import { z } from "zod";
import { ResultAsync, okAsync } from "neverthrow";
import { and, eq, gte, lte, inArray, asc, isNull } from "drizzle-orm";
import {
  screenplays,
  scenes,
  documents,
  documentVersions,
  budgets,
  budgetLines,
  breakdownElements,
  breakdownOccurrences,
  locationRequirements,
  locationRequirementScenes,
  locationCandidates,
  schedules,
  shootingDays,
  strips,
  TOP_SHEETS,
} from "@oh-writers/db/schema";

type TopSheet = (typeof TOP_SHEETS)[number];
import type { Db } from "~/server/db";
import { CesareError } from "./cesare.errors";

// ─── Tool definitions ─────────────────────────────────────────────────────────

export const CESARE_READ_TOOLS = [
  {
    name: "read_scene",
    description:
      "Leggi il corpo completo (heading, note, dialoghi) di una specifica scena della sceneggiatura, identificata dal suo numero ordinale. " +
      "Usalo quando ti serve il testo letterale di una scena per analizzarla, citarla o ragionarci sopra.",
    input_schema: {
      type: "object" as const,
      properties: {
        scene_number: {
          type: "integer",
          minimum: 1,
          description: "Numero ordinale della scena (1-based).",
        },
      },
      required: ["scene_number"],
    },
  },
  {
    name: "read_scene_range",
    description:
      "Leggi più scene consecutive in un colpo solo, inclusi gli estremi (da `from` a `to`). " +
      "Usalo per leggere un blocco narrativo o quando devi confrontare scene adiacenti.",
    input_schema: {
      type: "object" as const,
      properties: {
        from: {
          type: "integer",
          minimum: 1,
          description: "Numero scena di partenza",
        },
        to: {
          type: "integer",
          minimum: 1,
          description: "Numero scena di arrivo (inclusivo)",
        },
      },
      required: ["from", "to"],
    },
  },
  {
    name: "read_document",
    description:
      "Leggi il contenuto completo di un documento del progetto (soggetto, sinossi, scaletta, trattamento). " +
      "Usalo quando ti serve il testo letterale del documento per ragionarci o citarlo.",
    input_schema: {
      type: "object" as const,
      properties: {
        document_type: {
          type: "string",
          enum: ["soggetto", "synopsis", "outline", "treatment"],
          description: "Tipo di documento da leggere.",
        },
      },
      required: ["document_type"],
    },
  },
  {
    name: "read_budget_lines",
    description:
      "Leggi le righe del budget del progetto. Senza filtri restituisce tutte le righe; passando `top_sheet` filtra per categoria. " +
      "Usalo quando devi analizzare voci specifiche prima di proporre modifiche.",
    input_schema: {
      type: "object" as const,
      properties: {
        top_sheet: {
          type: "string",
          enum: [
            "above_the_line",
            "production",
            "crew",
            "post_production",
            "contingency",
          ],
          description:
            "Filtro opzionale per top sheet. Se omesso, restituisce tutte le righe.",
        },
      },
    },
  },
  {
    name: "read_breakdown",
    description:
      "Leggi gli elementi del breakdown del progetto (cast, props, locations, ecc.). " +
      "Passando `scene_id` filtra agli elementi collegati a quella scena.",
    input_schema: {
      type: "object" as const,
      properties: {
        scene_id: {
          type: "string",
          description:
            "UUID della scena da filtrare. Se omesso, restituisce tutti gli elementi del progetto.",
        },
      },
    },
  },
  {
    name: "read_location_requirement",
    description:
      "Leggi i dettagli di un requirement di location (nome, intExt, time of day) insieme alle scene collegate e ai candidati salvati.",
    input_schema: {
      type: "object" as const,
      properties: {
        requirement_id: {
          type: "string",
          description: "UUID del location requirement da leggere.",
        },
      },
      required: ["requirement_id"],
    },
  },
  {
    name: "read_shooting_day",
    description:
      "Leggi le strip di una giornata di ripresa, identificata dal suo numero ordinale. " +
      "Restituisce le scene assegnate alla giornata con il loro stato (locked, banner color).",
    input_schema: {
      type: "object" as const,
      properties: {
        day_number: {
          type: "integer",
          minimum: 1,
          description: "Numero ordinale della giornata (1-based).",
        },
      },
      required: ["day_number"],
    },
  },
] as const;

// ─── Block / result shapes ────────────────────────────────────────────────────

interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
}

interface ToolResult {
  type: "tool_result";
  tool_use_id: string;
  content: string;
}

const toResult = (id: string, payload: unknown): ToolResult => ({
  type: "tool_result",
  tool_use_id: id,
  content: JSON.stringify(payload),
});

const errPayload = (message: string): { error: string } => ({ error: message });

// ─── Executors ────────────────────────────────────────────────────────────────

interface ReadSceneInput {
  scene_number: number;
}

const readSceneByNumber = (
  db: Db,
  projectId: string,
  sceneNumber: number,
): ResultAsync<unknown, CesareError> =>
  ResultAsync.fromPromise(
    (async () => {
      const [screenplay] = await db
        .select({ id: screenplays.id })
        .from(screenplays)
        .where(eq(screenplays.projectId, projectId))
        .limit(1);
      if (!screenplay) {
        return errPayload(`No screenplay for project ${projectId}`);
      }
      const [scene] = await db
        .select({
          id: scenes.id,
          number: scenes.number,
          heading: scenes.heading,
          body: scenes.notes,
          intExt: scenes.intExt,
          timeOfDay: scenes.timeOfDay,
          characterNames: scenes.characterNames,
        })
        .from(scenes)
        .where(
          and(
            eq(scenes.screenplayId, screenplay.id),
            eq(scenes.number, sceneNumber),
          ),
        )
        .limit(1);
      if (!scene) return errPayload(`Scene ${sceneNumber} not found`);
      return scene;
    })(),
    (e) =>
      new CesareError(
        `read_scene failed: ${e instanceof Error ? e.message : String(e)}`,
      ),
  );

interface ReadSceneRangeInput {
  from: number;
  to: number;
}

const readSceneRange = (
  db: Db,
  projectId: string,
  input: ReadSceneRangeInput,
): ResultAsync<unknown, CesareError> =>
  ResultAsync.fromPromise(
    (async () => {
      const lo = Math.min(input.from, input.to);
      const hi = Math.max(input.from, input.to);
      const [screenplay] = await db
        .select({ id: screenplays.id })
        .from(screenplays)
        .where(eq(screenplays.projectId, projectId))
        .limit(1);
      if (!screenplay)
        return errPayload(`No screenplay for project ${projectId}`);
      const rows = await db
        .select({
          id: scenes.id,
          number: scenes.number,
          heading: scenes.heading,
          body: scenes.notes,
          intExt: scenes.intExt,
          timeOfDay: scenes.timeOfDay,
          characterNames: scenes.characterNames,
        })
        .from(scenes)
        .where(
          and(
            eq(scenes.screenplayId, screenplay.id),
            gte(scenes.number, lo),
            lte(scenes.number, hi),
          ),
        )
        .orderBy(asc(scenes.number));
      return { scenes: rows };
    })(),
    (e) =>
      new CesareError(
        `read_scene_range failed: ${e instanceof Error ? e.message : String(e)}`,
      ),
  );

interface ReadDocumentInput {
  document_type: "soggetto" | "synopsis" | "outline" | "treatment";
}

const readDocument = (
  db: Db,
  projectId: string,
  input: ReadDocumentInput,
): ResultAsync<unknown, CesareError> =>
  ResultAsync.fromPromise(
    (async () => {
      const [doc] = await db
        .select({
          id: documents.id,
          type: documents.type,
          content: documents.content,
          currentVersionId: documents.currentVersionId,
        })
        .from(documents)
        .where(
          and(
            eq(documents.projectId, projectId),
            eq(documents.type, input.document_type),
          ),
        )
        .limit(1);
      if (!doc) return errPayload(`Document ${input.document_type} not found`);
      let content = doc.content;
      if (doc.currentVersionId) {
        const [ver] = await db
          .select({ content: documentVersions.content })
          .from(documentVersions)
          .where(eq(documentVersions.id, doc.currentVersionId))
          .limit(1);
        if (ver) content = ver.content;
      }
      return { id: doc.id, type: doc.type, content };
    })(),
    (e) =>
      new CesareError(
        `read_document failed: ${e instanceof Error ? e.message : String(e)}`,
      ),
  );

interface ReadBudgetLinesInput {
  top_sheet?: string;
}

const readBudgetLines = (
  db: Db,
  projectId: string,
  input: ReadBudgetLinesInput,
): ResultAsync<unknown, CesareError> =>
  ResultAsync.fromPromise(
    (async () => {
      const [budget] = await db
        .select({ id: budgets.id, status: budgets.status })
        .from(budgets)
        .where(eq(budgets.projectId, projectId))
        .limit(1);
      if (!budget) return errPayload("No budget generated for project");
      const baseWhere = input.top_sheet
        ? and(
            eq(budgetLines.budgetId, budget.id),
            eq(budgetLines.topSheet, input.top_sheet as TopSheet),
          )
        : eq(budgetLines.budgetId, budget.id);
      const rows = await db
        .select({
          id: budgetLines.id,
          topSheet: budgetLines.topSheet,
          name: budgetLines.name,
          linkedCategory: budgetLines.linkedCategory,
          rate: budgetLines.rate,
          quantity: budgetLines.quantity,
          actual: budgetLines.actual,
          notes: budgetLines.notes,
        })
        .from(budgetLines)
        .where(baseWhere);
      return {
        budgetStatus: budget.status,
        lines: rows.map((r) => ({
          id: r.id,
          topSheet: r.topSheet,
          name: r.name,
          linkedCategory: r.linkedCategory,
          rate: r.rate !== null ? Number(r.rate) : null,
          quantity: r.quantity !== null ? Number(r.quantity) : null,
          actual: r.actual !== null ? Number(r.actual) : null,
          notes: r.notes,
        })),
      };
    })(),
    (e) =>
      new CesareError(
        `read_budget_lines failed: ${e instanceof Error ? e.message : String(e)}`,
      ),
  );

interface ReadBreakdownInput {
  scene_id?: string;
}

const readBreakdown = (
  db: Db,
  projectId: string,
  input: ReadBreakdownInput,
): ResultAsync<unknown, CesareError> =>
  ResultAsync.fromPromise(
    (async () => {
      if (input.scene_id) {
        const rows = await db
          .select({
            id: breakdownElements.id,
            category: breakdownElements.category,
            name: breakdownElements.name,
            occurrenceId: breakdownOccurrences.id,
            quantity: breakdownOccurrences.quantity,
            cesareStatus: breakdownOccurrences.cesareStatus,
          })
          .from(breakdownElements)
          .innerJoin(
            breakdownOccurrences,
            eq(breakdownOccurrences.elementId, breakdownElements.id),
          )
          .where(
            and(
              eq(breakdownElements.projectId, projectId),
              eq(breakdownOccurrences.sceneId, input.scene_id),
              isNull(breakdownElements.archivedAt),
            ),
          );
        return { elements: rows };
      }
      const rows = await db
        .select({
          id: breakdownElements.id,
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
      return { elements: rows };
    })(),
    (e) =>
      new CesareError(
        `read_breakdown failed: ${e instanceof Error ? e.message : String(e)}`,
      ),
  );

interface ReadLocationRequirementInput {
  requirement_id: string;
}

const readLocationRequirement = (
  db: Db,
  projectId: string,
  input: ReadLocationRequirementInput,
): ResultAsync<unknown, CesareError> =>
  ResultAsync.fromPromise(
    (async () => {
      const [req] = await db
        .select({
          id: locationRequirements.id,
          name: locationRequirements.name,
          intExt: locationRequirements.intExt,
          timeOfDay: locationRequirements.timeOfDay,
          status: locationRequirements.status,
        })
        .from(locationRequirements)
        .where(
          and(
            eq(locationRequirements.id, input.requirement_id),
            eq(locationRequirements.projectId, projectId),
          ),
        )
        .limit(1);
      if (!req)
        return errPayload(`Requirement ${input.requirement_id} not found`);

      const linked = await db
        .select({
          sceneId: locationRequirementScenes.sceneId,
          number: scenes.number,
          heading: scenes.heading,
          intExt: scenes.intExt,
          timeOfDay: scenes.timeOfDay,
        })
        .from(locationRequirementScenes)
        .innerJoin(scenes, eq(locationRequirementScenes.sceneId, scenes.id))
        .where(
          eq(locationRequirementScenes.requirementId, input.requirement_id),
        );

      const candidates = await db
        .select({
          id: locationCandidates.id,
          name: locationCandidates.name,
          address: locationCandidates.address,
          status: locationCandidates.status,
          notes: locationCandidates.notes,
        })
        .from(locationCandidates)
        .where(eq(locationCandidates.requirementId, input.requirement_id));

      return {
        requirement: req,
        linkedScenes: linked,
        candidates,
      };
    })(),
    (e) =>
      new CesareError(
        `read_location_requirement failed: ${e instanceof Error ? e.message : String(e)}`,
      ),
  );

interface ReadShootingDayInput {
  day_number: number;
}

const readShootingDay = (
  db: Db,
  projectId: string,
  input: ReadShootingDayInput,
): ResultAsync<unknown, CesareError> =>
  ResultAsync.fromPromise(
    (async () => {
      const [schedule] = await db
        .select({ id: schedules.id })
        .from(schedules)
        .where(eq(schedules.projectId, projectId))
        .limit(1);
      if (!schedule) return errPayload("No schedule for project");

      const [day] = await db
        .select({
          id: shootingDays.id,
          dayNumber: shootingDays.dayNumber,
          date: shootingDays.date,
          dayType: shootingDays.dayType,
          notes: shootingDays.notes,
        })
        .from(shootingDays)
        .where(
          and(
            eq(shootingDays.scheduleId, schedule.id),
            eq(shootingDays.dayNumber, input.day_number),
          ),
        )
        .limit(1);
      if (!day) return errPayload(`Shooting day ${input.day_number} not found`);

      const stripRows = await db
        .select({
          id: strips.id,
          sceneId: strips.sceneId,
          position: strips.position,
          bannerColor: strips.bannerColor,
          isLocked: strips.isLocked,
          estimatedHours: strips.estimatedHours,
          sceneNumber: scenes.number,
          sceneHeading: scenes.heading,
        })
        .from(strips)
        .innerJoin(scenes, eq(strips.sceneId, scenes.id))
        .where(eq(strips.shootingDayId, day.id))
        .orderBy(asc(strips.position));

      return { day, strips: stripRows };
    })(),
    (e) =>
      new CesareError(
        `read_shooting_day failed: ${e instanceof Error ? e.message : String(e)}`,
      ),
  );

// ─── Router ───────────────────────────────────────────────────────────────────

// Returns null when the tool name isn't a read tool, so the caller can fall
// through to its own executor. Returning a `null` is preferred over an
// "Unknown tool" payload here because each toolset (locations, budget,
// schedule, …) keeps its own catch-all, and we want them to remain the
// authoritative error reporters.
export const tryExecuteReadTool = (
  block: ToolUseBlock,
  db: Db,
  projectId: string,
): ResultAsync<ToolResult, CesareError> | null => {
  switch (block.name) {
    case "read_scene": {
      const input = block.input as ReadSceneInput;
      return readSceneByNumber(db, projectId, input.scene_number).map((r) =>
        toResult(block.id, r),
      );
    }
    case "read_scene_range":
      return readSceneRange(
        db,
        projectId,
        block.input as ReadSceneRangeInput,
      ).map((r) => toResult(block.id, r));
    case "read_document":
      return readDocument(db, projectId, block.input as ReadDocumentInput).map(
        (r) => toResult(block.id, r),
      );
    case "read_budget_lines":
      return readBudgetLines(
        db,
        projectId,
        block.input as ReadBudgetLinesInput,
      ).map((r) => toResult(block.id, r));
    case "read_breakdown":
      return readBreakdown(
        db,
        projectId,
        block.input as ReadBreakdownInput,
      ).map((r) => toResult(block.id, r));
    case "read_location_requirement":
      return readLocationRequirement(
        db,
        projectId,
        block.input as ReadLocationRequirementInput,
      ).map((r) => toResult(block.id, r));
    case "read_shooting_day":
      return readShootingDay(
        db,
        projectId,
        block.input as ReadShootingDayInput,
      ).map((r) => toResult(block.id, r));
    default:
      return null;
  }
};

// Convenience helper used by the schedule/shooting-plan routers that don't
// take projectId from their executor signature — they wrap this so the
// fallthrough still flows.
export const executeReadToolOrError = (
  block: ToolUseBlock,
  db: Db,
  projectId: string,
): ResultAsync<ToolResult, CesareError> => {
  const r = tryExecuteReadTool(block, db, projectId);
  if (r) return r;
  return okAsync(toResult(block.id, errPayload(`Unknown tool: ${block.name}`)));
};

// ─── Read tools factory (AI SDK v5 format) ───────────────────────────────────

const TOP_SHEET_ENUM_READ = [
  "above_the_line",
  "production",
  "crew",
  "post_production",
  "contingency",
] as const;

export const createReadTools = (db: Db, projectId: string) => ({
  read_scene: tool({
    description:
      "Leggi il corpo completo (heading, note, dialoghi) di una specifica scena della sceneggiatura, identificata dal suo numero ordinale. " +
      "Usalo quando ti serve il testo letterale di una scena per analizzarla, citarla o ragionarci sopra.",
    inputSchema: z.object({
      scene_number: z
        .number()
        .int()
        .min(1)
        .describe("Numero ordinale della scena (1-based)."),
    }),
    execute: async (input, _opts) => {
      const i = input as ReadSceneInput;
      const result = await readSceneByNumber(db, projectId, i.scene_number);
      if (result.isErr()) return { error: result.error.message };
      return result.value;
    },
  }),
  read_scene_range: tool({
    description:
      "Leggi più scene consecutive in un colpo solo, inclusi gli estremi (da `from` a `to`). " +
      "Usalo per leggere un blocco narrativo o quando devi confrontare scene adiacenti.",
    inputSchema: z.object({
      from: z.number().int().min(1).describe("Numero scena di partenza"),
      to: z
        .number()
        .int()
        .min(1)
        .describe("Numero scena di arrivo (inclusivo)"),
    }),
    execute: async (input, _opts) => {
      const result = await readSceneRange(
        db,
        projectId,
        input as ReadSceneRangeInput,
      );
      if (result.isErr()) return { error: result.error.message };
      return result.value;
    },
  }),
  read_document: tool({
    description:
      "Leggi il contenuto completo di un documento del progetto (soggetto, sinossi, scaletta, trattamento). " +
      "Usalo quando ti serve il testo letterale del documento per ragionarci o citarlo.",
    inputSchema: z.object({
      document_type: z
        .enum(["soggetto", "synopsis", "outline", "treatment"])
        .describe("Tipo di documento da leggere."),
    }),
    execute: async (input, _opts) => {
      const result = await readDocument(
        db,
        projectId,
        input as ReadDocumentInput,
      );
      if (result.isErr()) return { error: result.error.message };
      return result.value;
    },
  }),
  read_budget_lines: tool({
    description:
      "Leggi le righe del budget del progetto. Senza filtri restituisce tutte le righe; passando `top_sheet` filtra per categoria. " +
      "Usalo quando devi analizzare voci specifiche prima di proporre modifiche.",
    inputSchema: z.object({
      top_sheet: z
        .enum(TOP_SHEET_ENUM_READ)
        .optional()
        .describe(
          "Filtro opzionale per top sheet. Se omesso, restituisce tutte le righe.",
        ),
    }),
    execute: async (input, _opts) => {
      const result = await readBudgetLines(
        db,
        projectId,
        input as ReadBudgetLinesInput,
      );
      if (result.isErr()) return { error: result.error.message };
      return result.value;
    },
  }),
  read_breakdown: tool({
    description:
      "Leggi gli elementi del breakdown del progetto (cast, props, locations, ecc.). " +
      "Passando `scene_id` filtra agli elementi collegati a quella scena.",
    inputSchema: z.object({
      scene_id: z
        .string()
        .optional()
        .describe(
          "UUID della scena da filtrare. Se omesso, restituisce tutti gli elementi del progetto.",
        ),
    }),
    execute: async (input, _opts) => {
      const result = await readBreakdown(
        db,
        projectId,
        input as ReadBreakdownInput,
      );
      if (result.isErr()) return { error: result.error.message };
      return result.value;
    },
  }),
  read_location_requirement: tool({
    description:
      "Leggi i dettagli di un requirement di location (nome, intExt, time of day) insieme alle scene collegate e ai candidati salvati.",
    inputSchema: z.object({
      requirement_id: z
        .string()
        .describe("UUID del location requirement da leggere."),
    }),
    execute: async (input, _opts) => {
      const result = await readLocationRequirement(
        db,
        projectId,
        input as ReadLocationRequirementInput,
      );
      if (result.isErr()) return { error: result.error.message };
      return result.value;
    },
  }),
  read_shooting_day: tool({
    description:
      "Leggi le strip di una giornata di ripresa, identificata dal suo numero ordinale. " +
      "Restituisce le scene assegnate alla giornata con il loro stato (locked, banner color).",
    inputSchema: z.object({
      day_number: z
        .number()
        .int()
        .min(1)
        .describe("Numero ordinale della giornata (1-based)."),
    }),
    execute: async (input, _opts) => {
      const result = await readShootingDay(
        db,
        projectId,
        input as ReadShootingDayInput,
      );
      if (result.isErr()) return { error: result.error.message };
      return result.value;
    },
  }),
});

export type ReadTools = ReturnType<typeof createReadTools>;
