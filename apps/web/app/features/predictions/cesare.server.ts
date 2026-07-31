import { createServerFn } from "@tanstack/start";
import { z } from "zod";
import { eq, and, isNull, count, gte, lte, inArray } from "drizzle-orm";
import { logger } from "~/server/logger";
import { aiTelemetry } from "~/server/langfuse-config";
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
  documents,
  documentVersions,
  shotPlans,
  shotPlanScenarios,
  shots,
} from "@oh-writers/db/schema";
import type { DocumentType } from "@oh-writers/domain";
import { toShape, repairMojibake } from "@oh-writers/utils";
import {
  withProjectAccess,
  withProjectAccessHeaders,
  type WithProjectAccessCtx,
} from "~/server/pipeline";
import type { Db } from "~/server/db";
import type { ProjectAccess } from "~/server/access";
import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import {
  runToolLoop,
  runDocumentToolLoop,
  runBreakdownToolLoop,
  runScheduleToolLoop,
  runBudgetToolLoop,
  runShootingPlanToolLoop,
  runScreenplayToolLoop,
  runUniversalToolLoop,
} from "./cesare-tools";
import { parseOutline } from "~/features/documents";
import { classifyIntent, INTENT_SCALE } from "./cesare-intent-classifier";
import {
  openTurnSignalsScope,
  setTurnClassifiedIntent,
} from "./cesare-turn-signals";
import type {
  DocumentContext,
  ScheduleToolContext,
  ShootingPlanToolContext,
} from "./cesare-tools";
import { routeModel, tierToModel, type ModelTier } from "./cesare-model-router";
import { loadFilmBible } from "./bible-distill.server";
import {
  formatGlobalContext,
  formatBibleForLocations,
} from "@oh-writers/domain";
import type { FilmBible } from "@oh-writers/domain";
import { runUnifiedToolLoop } from "./cesare-tools";
import { buildSkillRegistry } from "./skills/registry";
import { buildDocumentEditSkill } from "./skills/document-edit.skill";
import type { SkillBuildContext } from "./skills/types";
import { buildGlobalContext, assembleSystemPromptV2 } from "./context";
import { buildLocalContext } from "./context/local-context.server";
import { loadHistoryContextSummary } from "./messages/cesare-history.server";
import type { CesareStreamEvent } from "./cesare-stream-events";

// ─── System prompt blocks ─────────────────────────────────────────────────────

export interface SystemPromptBlock {
  readonly type: "text";
  readonly text: string;
  readonly cache_control?: { readonly type: "ephemeral" };
}

// ─── Error ────────────────────────────────────────────────────────────────────
// Moved to cesare.errors.ts to break the cesare-*-tools.ts ↔ cesare.server.ts
// circular import cycle. Re-exported for back-compat with existing callers.
import { CesareError } from "./cesare.errors";
export { CesareError };

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
  // Sentinel: the screenplay editor passes "" when it knows the scene number
  // (from scroll tracking) but not the UUID. Accept empty string and treat
  // as null downstream.
  sceneId: z
    .union([z.string().uuid(), z.literal("")])
    .nullable()
    .transform((v) => (v === "" ? null : v)),
  sceneNumber: z.number().nullable(),
  requirementId: z
    .union([z.string().uuid(), z.literal("")])
    .nullable()
    .optional()
    .transform((v) => (v === "" ? null : v)),
  documentId: z
    .union([z.string().uuid(), z.literal("")])
    .nullable()
    .optional()
    .transform((v) => (v === "" ? null : v)),
  shootingDayId: z
    .union([z.string().uuid(), z.literal("")])
    .nullable()
    .optional()
    .transform((v) => (v === "" ? null : v)),
  shootingDayNumber: z.number().int().nullable().optional(),
});

const ConversationMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

const CesareInputSchema = z.object({
  projectId: z.string().uuid(),
  // 8000 chars (~1200-1500 words) — a detailed multi-point instruction (e.g.
  // "restructure scenes 4-9, keep the tone, fix these 5 things") must fit.
  message: z.string().min(1).max(8000),
  pageContext: PageContextSchema,
  // The Cesare session this turn belongs to (Spec 76 / BUG-N66). Threads down to
  // the version commit so a session's small edits collapse into one working row
  // instead of flooding the Versions list. Optional: older clients / the
  // non-routed chat omit it and fall back to the legacy mint-per-turn behaviour.
  sessionId: z.string().uuid().nullish(),
  // Keep only the most recent 20 turns instead of REJECTING longer histories.
  // Since spec 51 persists messages, a long session legitimately accumulates
  // >20 turns; a hard `.max(20)` made every request from a long thread fail Zod
  // (it broke all live edits in long sessions). Transform-cap is defensive: no
  // client (UI, test, or future caller) can ever exceed the model's context cap.
  conversationHistory: z
    .array(ConversationMessageSchema)
    .transform((h) => h.slice(-20)),
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
  lines: BudgetLineDetail[];
  status: string | null;
}

interface BudgetLineDetail {
  id: string;
  topSheet: string;
  name: string;
  category: string | null;
  rate: number | null;
  quantity: number | null;
  estimated: number;
  actual: number | null;
  residual: number;
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

interface ProjectDocumentRow {
  id: string;
  type: DocumentType;
  content: string;
}

interface ActiveDocumentRow extends ProjectDocumentRow {
  /** True when this is the document the user is currently viewing. */
  isActive: true;
}

interface ShotSummary {
  shotSize: string;
  cameraMovement: string;
  durationMin: number | null;
  notes: string | null;
}

interface ShotPlanSummary {
  scenarioId: string;
  name: string;
  isActive: boolean;
  shotCount: number;
  shots: ShotSummary[];
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
  /** Full content of the active document, if the page is a document page. */
  activeDocument: ActiveDocumentRow | null;
  /** Short summaries of all other docs in the project (for cross-doc context). */
  projectDocuments: ProjectDocumentRow[];
  /** Existing shot-plans for the active scene (only populated on the shooting-plan page). */
  shotPlans: ShotPlanSummary[];
  /** Distilled Film Bible — null when not yet available (first call). */
  bible: FilmBible | null;
}

const loadScreenplayContext = (
  db: Db,
  projectId: string,
): ResultAsync<
  {
    id: string | null;
    title: string;
    scenes: SceneRow[];
    characters: string[];
  },
  CesareError
> =>
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
        .select({ id: budgets.id, status: budgets.status })
        .from(budgets)
        .where(eq(budgets.projectId, projectId))
        .limit(1);

      if (!budget) return null;

      const lines = await db
        .select({
          id: budgetLines.id,
          topSheet: budgetLines.topSheet,
          name: budgetLines.name,
          linkedCategory: budgetLines.linkedCategory,
          rate: budgetLines.rate,
          quantity: budgetLines.quantity,
          actual: budgetLines.actual,
        })
        .from(budgetLines)
        .where(eq(budgetLines.budgetId, budget.id));

      const residualByTopSheet: Record<string, number> = {};
      let totalAllocated = 0;
      const detailedLines: BudgetLineDetail[] = [];

      for (const line of lines) {
        const rateNum = line.rate !== null ? Number(line.rate) : null;
        const qtyNum = line.quantity !== null ? Number(line.quantity) : null;
        const estimated =
          rateNum !== null && qtyNum !== null ? qtyNum * rateNum : 0;
        const actualNum = line.actual !== null ? Number(line.actual) : null;
        const spent = actualNum ?? 0;
        const residual = estimated - spent;

        totalAllocated += estimated;
        residualByTopSheet[line.topSheet] =
          (residualByTopSheet[line.topSheet] ?? 0) + residual;

        detailedLines.push({
          id: line.id,
          topSheet: line.topSheet,
          name: line.name,
          category: line.linkedCategory,
          rate: rateNum,
          quantity: qtyNum,
          estimated,
          actual: actualNum,
          residual,
        });
      }

      return {
        totalAllocated,
        residualByTopSheet,
        lines: detailedLines,
        status: (budget as { status?: string }).status ?? null,
      };
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
        .where(and(eq(shootingDays.scheduleId, schedule.id)));

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
      const allLinkedSceneJoins =
        reqIds.length === 0
          ? []
          : await db
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
              .innerJoin(
                scenes,
                eq(locationRequirementScenes.sceneId, scenes.id),
              )
              .innerJoin(
                locationRequirements,
                eq(
                  locationRequirementScenes.requirementId,
                  locationRequirements.id,
                ),
              )
              .where(eq(locationRequirements.projectId, projectId));

      // Load breakdown elements for each linked scene
      const linkedSceneIds = allLinkedSceneJoins.map((j) => j.sceneId);
      const allSceneElements =
        linkedSceneIds.length === 0
          ? []
          : await db
              .select({
                sceneId: breakdownOccurrences.sceneId,
                category: breakdownElements.category,
                name: breakdownElements.name,
              })
              .from(breakdownOccurrences)
              .innerJoin(
                breakdownElements,
                eq(breakdownOccurrences.elementId, breakdownElements.id),
              )
              .where(
                and(
                  eq(breakdownElements.projectId, projectId),
                  isNull(breakdownElements.archivedAt),
                ),
              );

      const elementsByScene = allSceneElements.reduce<Record<string, string[]>>(
        (acc, el) => {
          if (!el.sceneId) return acc;
          const list = acc[el.sceneId] ?? [];
          list.push(`${el.name} (${el.category})`);
          acc[el.sceneId] = list;
          return acc;
        },
        {},
      );

      return reqs.map((req) => ({
        ...req,
        timeOfDay: (req.timeOfDay as string[] | null) ?? [],
        candidates: allCandidates
          .filter((c) => c.requirementId === req.id)
          .map((c) => ({
            id: c.id,
            name: c.name,
            address: c.address,
            status: c.status,
          })),
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

// Loads all project documents and resolves their live content via the
// active version row. The result is used to (a) inject the active doc full
// content into Cesare's prompt and (b) surface cross-doc summaries (e.g. a
// treatment edit can reference the synopsis).
const loadProjectDocuments = (
  db: Db,
  projectId: string,
): ResultAsync<ProjectDocumentRow[], CesareError> =>
  ResultAsync.fromPromise(
    (async (): Promise<ProjectDocumentRow[]> => {
      const docs = await db
        .select({
          id: documents.id,
          type: documents.type,
          content: documents.content,
          currentVersionId: documents.currentVersionId,
        })
        .from(documents)
        .where(eq(documents.projectId, projectId));

      const versionIds = docs
        .map((d) => d.currentVersionId)
        .filter((v): v is string => v !== null);

      const versionContentById = new Map<string, string>();
      if (versionIds.length > 0) {
        const rows = await db
          .select({
            id: documentVersions.id,
            content: documentVersions.content,
          })
          .from(documentVersions)
          .where(inArray(documentVersions.id, versionIds));
        for (const r of rows) versionContentById.set(r.id, r.content);
      }

      return docs.map((d) => ({
        id: d.id,
        type: d.type as DocumentType,
        content: d.currentVersionId
          ? (versionContentById.get(d.currentVersionId) ?? d.content)
          : d.content,
      }));
    })(),
    (e) =>
      new CesareError(
        `Failed to load project documents: ${e instanceof Error ? e.message : String(e)}`,
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

      // For all other pages: window around the current scene number.
      // Fallback: when no scene is selected, return the first 5 scenes so
      // Cesare always has SOME narrative context even on pages where the
      // user hasn't selected anything yet (or pages that don't track scene
      // selection at all).
      if (centerSceneNumber === null) {
        const rows = await db
          .select({
            id: scenes.id,
            number: scenes.number,
            heading: scenes.heading,
            body: scenes.notes,
            characterNames: scenes.characterNames,
          })
          .from(scenes)
          .where(eq(scenes.screenplayId, screenplayId))
          .orderBy(scenes.number)
          .limit(5);
        return rows.map((r) => ({ ...r, isCurrent: false }));
      }

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
    (e) =>
      new CesareError(
        `loadSceneWindow failed: ${e instanceof Error ? e.message : String(e)}`,
      ),
  );
};

// Loads the shot plans for a scene. Only used by the shooting-plan page so
// Cesare can avoid duplicating Piano A's structure when generating Piano B.
const loadShotPlansForScene = (
  db: Db,
  sceneId: string | null,
): ResultAsync<ShotPlanSummary[], CesareError> =>
  ResultAsync.fromPromise(
    (async (): Promise<ShotPlanSummary[]> => {
      if (!sceneId) return [];
      const plan = await db
        .select({
          id: shotPlans.id,
          activeScenarioId: shotPlans.activeScenarioId,
        })
        .from(shotPlans)
        .where(eq(shotPlans.sceneId, sceneId))
        .limit(1)
        .then((rows) => rows[0] ?? null);
      if (!plan) return [];

      const scenarioRows = await db
        .select({
          id: shotPlanScenarios.id,
          name: shotPlanScenarios.name,
          position: shotPlanScenarios.position,
        })
        .from(shotPlanScenarios)
        .where(eq(shotPlanScenarios.shotPlanId, plan.id));
      if (scenarioRows.length === 0) return [];

      const scenarioIds = scenarioRows.map((s) => s.id);
      const shotRows = await db
        .select({
          scenarioId: shots.scenarioId,
          shotSize: shots.shotSize,
          cameraMovement: shots.cameraMovement,
          estimatedMinutes: shots.estimatedMinutes,
          notes: shots.notes,
          position: shots.position,
        })
        .from(shots)
        .where(inArray(shots.scenarioId, scenarioIds));

      const shotsByScenario = new Map<string, ShotSummary[]>();
      for (const s of [...shotRows].sort((a, b) => a.position - b.position)) {
        const list = shotsByScenario.get(s.scenarioId) ?? [];
        list.push({
          shotSize: s.shotSize,
          cameraMovement: s.cameraMovement,
          durationMin: s.estimatedMinutes ?? null,
          notes: s.notes ?? null,
        });
        shotsByScenario.set(s.scenarioId, list);
      }

      return scenarioRows
        .sort((a, b) => a.position - b.position)
        .map((s) => {
          const scenarioShots = shotsByScenario.get(s.id) ?? [];
          return {
            scenarioId: s.id,
            name: s.name,
            isActive: s.id === plan.activeScenarioId,
            shotCount: scenarioShots.length,
            shots: scenarioShots,
          };
        });
    })(),
    (e) =>
      new CesareError(
        `loadShotPlansForScene failed: ${e instanceof Error ? e.message : String(e)}`,
      ),
  );

// legacy — replaced by buildGlobalContext + buildLocalContext (spec 39). Kept for reference only.
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
              const effectiveSceneId =
                pageContext.sceneId && pageContext.sceneId.length > 10
                  ? pageContext.sceneId
                  : null;
              const currentScene = effectiveSceneId
                ? (screenplay.scenes.find((s) => s.id === effectiveSceneId) ??
                  null)
                : pageContext.sceneNumber !== null
                  ? (screenplay.scenes.find(
                      (s) => s.number === pageContext.sceneNumber,
                    ) ?? null)
                  : null;

              let currentRequirement = pageContext.requirementId
                ? (locations.find((r) => r.id === pageContext.requirementId) ??
                  null)
                : null;

              // For locations: use linked scene IDs; for other pages: use number window
              let linkedSceneIds =
                currentRequirement?.linkedScenes.map((s) => s.id) ?? [];

              // Fallback: when a requirement is selected but no scenes are
              // explicitly linked in location_requirement_scenes, match its name
              // against scene headings so Cesare still gets narrative context
              // (e.g. "Ristorante - Forno" matches "INT. RISTORANTE - FORNO/CUCINA - NOTTE").
              if (currentRequirement && linkedSceneIds.length === 0) {
                const norm = (s: string): string =>
                  s
                    .toLowerCase()
                    .normalize("NFD")
                    .replace(/[̀-ͯ]/g, "")
                    .replace(/[^a-z0-9]+/g, " ")
                    .trim();
                const reqTokens = norm(currentRequirement.name)
                  .split(" ")
                  .filter((t) => t.length >= 3);
                if (reqTokens.length > 0) {
                  const matched = screenplay.scenes.filter((sc) => {
                    const h = norm(sc.heading);
                    return reqTokens.every((t) => h.includes(t));
                  });
                  linkedSceneIds = matched.map((sc) => sc.id);
                  // Inject matched scenes into currentRequirement so the
                  // system-prompt formatter shows them under "Scene del copione".
                  if (matched.length > 0) {
                    currentRequirement = {
                      ...currentRequirement,
                      linkedScenes: matched.map((sc) => ({
                        id: sc.id,
                        number: sc.number,
                        heading: sc.heading,
                        intExt: "",
                        timeOfDay: null,
                        characterNames: [],
                        notes: null,
                        breakdownElements: [],
                      })),
                    };
                  }
                }
              }

              const shotPlanSceneId =
                pageContext.page === "shooting-plan"
                  ? (currentScene?.id ?? effectiveSceneId)
                  : null;

              return loadSceneWindow(
                db,
                projectId,
                screenplay.id,
                currentScene?.number ?? pageContext.sceneNumber,
                linkedSceneIds,
              ).andThen((sceneWindow) =>
                loadProjectDocuments(db, projectId).andThen(
                  (projectDocuments) =>
                    loadShotPlansForScene(db, shotPlanSceneId).andThen(
                      (shotPlanSummaries) => {
                        const activeDocId = pageContext.documentId ?? null;
                        // Resolve the active document from the client-sent
                        // documentId. The shell sets that from `activeDocument`,
                        // which it populates asynchronously after the editor
                        // mounts — so a request fired during a slow page load can
                        // arrive with a null documentId even though the user is
                        // clearly on a document page. In that case, fall back to
                        // the project document whose type matches the page (page
                        // names are 1:1 with document types: soggetto / synopsis
                        // / outline / treatment). This defines the race out of
                        // existence: text tools like expand_section always see
                        // the open document, never an empty context.
                        const activeDocument: ActiveDocumentRow | null =
                          (() => {
                            const byId = activeDocId
                              ? projectDocuments.find(
                                  (d) => d.id === activeDocId,
                                )
                              : undefined;
                            const byPage =
                              byId ??
                              (isDocumentPage(pageContext.page)
                                ? projectDocuments.find(
                                    (d) => d.type === pageContext.page,
                                  )
                                : undefined);
                            return byPage
                              ? { ...byPage, isActive: true }
                              : null;
                          })();
                        // Load bible lazily — never block on errors (return null on failure)
                        return loadFilmBible(db, projectId)
                          .map((bible) => ({
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
                            activeDocument,
                            projectDocuments,
                            shotPlans: shotPlanSummaries,
                            bible,
                          }))
                          .orElse((bibleErr) => {
                            logger.warn(
                              { err: bibleErr.message },
                              "film bible unavailable, continuing without it",
                            );
                            return ResultAsync.fromSafePromise(
                              Promise.resolve({
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
                                activeDocument,
                                projectDocuments,
                                shotPlans: shotPlanSummaries,
                                bible: null,
                              }),
                            );
                          });
                      },
                    ),
                ),
              );
            }),
          ),
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

const formatLocationsContext = (ctx: CesareContext): string => {
  if (ctx.locations.length === 0) return "";

  const formatRequirement = (
    req: LocationRequirementRow,
    selected: boolean,
  ): string => {
    const candidateLines =
      req.candidates.length > 0
        ? req.candidates
            .map(
              (c) =>
                `    - ${c.name}${c.address ? ` (${c.address})` : ""} [${c.status}]`,
            )
            .join("\n")
        : "    Nessun candidato ancora";

    const sceneLines =
      req.linkedScenes.length > 0
        ? req.linkedScenes
            .map((s) => {
              const chars =
                s.characterNames.length > 0
                  ? `Personaggi: ${s.characterNames.join(", ")}`
                  : "";
              const els =
                s.breakdownElements.length > 0
                  ? `Elementi: ${s.breakdownElements.slice(0, 8).join(", ")}`
                  : "";
              const notes = s.notes ? `Note: ${s.notes}` : "";
              const details = [chars, els, notes].filter(Boolean).join(" | ");
              return `    - Scena ${s.number}: ${s.heading}${details ? ` — ${details}` : ""}`;
            })
            .join("\n")
        : "    Nessuna scena collegata";

    const meta = [
      req.intExt ?? "",
      req.timeOfDay.length > 0 ? req.timeOfDay.join("/") : "",
    ]
      .filter(Boolean)
      .join(" · ");

    const header = selected
      ? `LOCATION SELEZIONATA: "${req.name}"${meta ? ` [${meta}]` : ""} [${req.status}]\n  requirement_id: ${req.id}`
      : `  - "${req.name}"${meta ? ` [${meta}]` : ""} [${req.status}] (requirement_id: ${req.id})`;

    if (selected) {
      return `\n${header}\n  Candidati:\n${candidateLines}\n  Scene del copione:\n${sceneLines}\nQuando aggiungi candidati usa sempre requirement_id: ${req.id}`;
    }
    // Even when not selected, surface a short scene list per location so
    // Cesare always knows the narrative context of each requirement.
    const shortScenes =
      req.linkedScenes.length > 0
        ? req.linkedScenes
            .slice(0, 4)
            .map((s) => `Sc.${s.number} ${s.heading}`)
            .join("; ")
        : "nessuna scena";
    return `${header}\n    scene: ${shortScenes}`;
  };

  if (ctx.currentRequirement) {
    return formatRequirement(ctx.currentRequirement, true);
  }

  const summary = ctx.locations
    .map((r) => formatRequirement(r, false))
    .join("\n");
  return `\nLOCATION DEL PROGETTO (${ctx.locations.length} requisiti):\n${summary}`;
};

const DOCUMENT_LABELS: Record<DocumentType, string> = {
  logline: "Logline",
  soggetto: "Soggetto",
  synopsis: "Sinossi",
  outline: "Scaletta",
  treatment: "Trattamento",
};

const MAX_DOC_PREVIEW_CHARS = 1200;
const MAX_ACTIVE_DOC_CHARS = 8000;

const truncate = (text: string, max: number): string =>
  text.length > max ? text.slice(0, max) + "…" : text;

// #108 — the scaletta is stored as JSON. Injected verbatim, the model read a
// minified object (and, past the cap, a truncated one cut mid-structure), so the
// strings it quoted back were drawn from JSON syntax. It is rendered as the
// numbered scene list the writer sees instead; scaletta edits go through
// `edit_outline_scene`, which addresses scenes by number, so nothing here needs
// to be an exact substring of what is stored.
const formatOutlineForModel = (raw: string): string => {
  const lines: string[] = [];
  let sceneNumber = 0;
  for (const act of parseOutline(raw).acts) {
    lines.push(`## ${act.title}`);
    for (const sequence of act.sequences) {
      for (const scene of sequence.scenes) {
        sceneNumber += 1;
        lines.push(`Scena ${sceneNumber} — ${scene.heading}`);
        if (scene.description) lines.push(scene.description);
      }
    }
  }
  return lines.join("\n");
};

const formatDocumentsContext = (ctx: CesareContext): string => {
  if (!ctx.activeDocument) return "";
  // Only inject the active document verbatim (needed for apply_text_edit to
  // find exact strings). Cross-doc context is now handled by the Film Bible
  // cached block — dumping all docs here was the root cause of the "Rome" bug.
  const body =
    ctx.activeDocument.type === "outline"
      ? formatOutlineForModel(ctx.activeDocument.content)
      : ctx.activeDocument.content;
  return `\nDOCUMENTO ATTIVO — ${DOCUMENT_LABELS[ctx.activeDocument.type]}:\n---\n${truncate(
    body,
    MAX_ACTIVE_DOC_CHARS,
  )}\n---`;
};

const isDocumentPage = (page: PageContext["page"]): boolean =>
  page === "soggetto" ||
  page === "synopsis" ||
  page === "outline" ||
  page === "treatment";

const buildDocumentToolsGuidance = (ctx: CesareContext): string => {
  const activeType = ctx.activeDocument?.type ?? null;
  const label = activeType ? DOCUMENT_LABELS[activeType] : "documento";
  const targetHint = ctx.activeDocument
    ? `Il documento attivo è ${label.toUpperCase()}.`
    : "Nessun documento attivo nel contesto. Gli edit testuali (apply_text_edit, expand_section, compress_section) richiedono che l'utente apra prima un documento — se servono, chiediglielo. Gli strumenti di GENERAZIONE qui sotto restano comunque utilizzabili.";
  return `

STRUMENTI DISPONIBILI SUI DOCUMENTI (logline, sinossi, soggetto, scaletta, trattamento):
- apply_text_edit(find, replace): sostituisce una stringa esatta del documento attivo. Usa SEMPRE testo letterale presente nel DOCUMENTO ATTIVO.
- expand_section(heading): espande la sezione sotto un heading in 2-3 paragrafi.
- compress_section(heading, target_words): comprime una sezione mantenendo i beat.

${targetHint}

Quando l'utente chiede una modifica concreta (riscrivi, cambia, espandi, accorcia, sostituisci) USA SEMPRE il tool appropriato — non limitarti a suggerire il testo nel chat. Conferma in italiano cosa hai fatto dopo ogni edit.${buildDocumentGenToolsGuidance(activeType ?? "logline")}`;
};

const buildDocumentGenToolsGuidance = (activeDocType: DocumentType): string => {
  const label = DOCUMENT_LABELS[activeDocType];
  return `

GENERAZIONE DOCUMENTI (propose/accept):
Per richieste che generano un documento intero (logline, sinossi, soggetto v2, scaletta) USA I TOOLS dedicati. Tutto crea una DRAFT visibile in un banner sopra l'editor con i pulsanti "Promuovi a attiva" / "Scarta".

WORKFLOW:
- "scrivimi una logline su [premessa]" / "rendi la logline più corta/tesa" / "cambia il protagonista della logline" → write_logline({ instruction, mode? })
- "genera la logline DALLA sceneggiatura" / "estrai la logline" → propose_logline_from_screenplay({ instruction? })
- "scrivimi la sinossi" / "genera la sinossi" → propose_synopsis_from_screenplay({ instruction? })
- "fammi un v2 del soggetto più [X]" / "riscrivi il soggetto in modo [X]" → propose_soggetto_v2({ instruction: "...", label: "v2 [hint]" })
- "dato il soggetto fammi la scaletta" / "genera la scaletta dal soggetto" → propose_scaletta_from_soggetto({ target_scene_count? })
- "scrivi il trattamento" / "genera il trattamento dalla scaletta" → propose_treatment_from_narrative({ instruction? }) — SOLO per il trattamento, MAI per la sceneggiatura.
- "scrivi la sceneggiatura" / "scrivimi la prima stesura della sceneggiatura" / "partendo dal soggetto fammi la sceneggiatura" → generate_screenplay_from_narrative({ instruction?, target_page_count? }). ATTENZIONE: se l'utente nomina la SCENEGGIATURA usa QUESTO tool, NON propose_treatment_from_narrative. Vale per la prima stesura (sceneggiatura ancora vuota); per riscrivere una sceneggiatura esistente usa invece propose_screenplay_revision.

❌ SBAGLIATO:
"Ora ti scrivo la logline: …"
(Scrive il testo nella chat, non chiama il tool. NON FARE COSÌ.)
"Leggo la sceneggiatura, poi ti scrivo la sinossi qui sotto."
(Stessa cosa. Niente testo nel chat per documenti interi.)

✅ CORRETTO:
[propose_logline_from_screenplay({ instruction: "più commerciale" })]
"Ho generato una logline draft per il progetto. Vai sulla pagina logline per accettarla o scartarla dal banner sopra l'editor."

REGOLA FORTE: se il documento attivo è VUOTO o l'utente chiede "scrivi/genera/crea il [documento]", DEVI chiamare il tool propose_*. Mai scrivere il documento intero nel chat. Sei attualmente sul documento ${label}. Tutti i tool di generazione sono comunque disponibili: se l'utente chiede un documento diverso, eseguilo lo stesso e indica nel messaggio finale dove vedere la draft.`;
};

const buildBreakdownToolsGuidance = (_page: PageContext["page"]): string => {
  return `\n\nTOOLS DISPONIBILI SUL BREAKDOWN:
- tag_element(scene_number, category, name, quantity?): aggiunge un elemento allo spoglio di una scena.
- accept_ghost(occurrence_id): accetta un suggerimento ghost.
- reject_ghost(occurrence_id): rifiuta un suggerimento ghost.
- estimate_scene_cost(scene_number): calcola costo e difficoltà di una scena.
- add_to_budget(scene_number): converte la stima della scena in righe budget reali.

Quando l'utente chiede di taggare un elemento ('spoglia X', 'aggiungi X come prop', 'questa scena ha un'arma'), USA tag_element. Quando chiede una stima di costo per una scena, USA estimate_scene_cost. Quando chiede di portare i costi al budget, USA add_to_budget. Conferma sempre in italiano cosa hai fatto.`;
};

const buildScheduleToolsGuidance = (
  _page: PageContext["page"],
  activeDayNumber: number | null,
): string => {
  const activeHint = activeDayNumber
    ? `\nGiornata attiva (selezionata dall'utente): Giornata ${activeDayNumber}. Quando l'utente dice "questa giornata" si riferisce a questa.`
    : "";
  return `\n\nTOOLS DISPONIBILI SUL PIANO DI LAVORAZIONE:
- move_scene_to_day(scene_number, target_day_number): sposta una scena su un'altra giornata.
- merge_days(day_a_number, day_b_number): accorpa due giornate (le scene di B vanno in A, B viene rimossa).
- swap_scenes(scene_a_number, scene_b_number): scambia la posizione di due scene.
- lock_day(day_number) / unlock_day(day_number): blocca/sblocca tutte le strip di una giornata.
- get_weather_forecast(lat, lng, date): previsioni Open-Meteo per data + coordinate (entro 16 giorni). Usalo per valutare il rischio meteo sugli esterni — la probabilità di riuscita della giornata cala con pioggia/temporale.
- suggest_reorder(strategy?, respect_location_confirmed?): proponi una sequenza ottimizzata (es. 'minimize_location_changes') senza applicarla; l'utente conferma. Passa respect_location_confirmed=true quando vedi giornate con location ancora "pending"/"scouting" — il tool penalizza lo spostare scene verso giornate con location non confermate e restituisce locationWarnings.

Quando l'utente chiede di riorganizzare lo schedule, USA i tools — non limitarti a descrivere il cambio. Per esterni con dubbi sul meteo, chiama get_weather_forecast prima di consigliare lo spostamento. Quando alcune scene hanno location non ancora confermate, chiama suggest_reorder con respect_location_confirmed=true. Conferma sempre in italiano cosa hai fatto e l'impatto sulla difficoltà/riuscita della giornata.${activeHint}`;
};

const TOP_SHEET_LABEL_IT: Record<string, string> = {
  above_the_line: "Above the line",
  production: "Produzione",
  crew: "Troupe",
  post_production: "Post-produzione",
  contingency: "Imprevisti",
};

const MAX_BUDGET_LINES_IN_PROMPT = 60;

const formatBudgetContext = (
  ctx: CesareContext,
  page: PageContext["page"],
): string => {
  if (page !== "budget") return "";
  if (!ctx.budget) {
    return "\n\nBUDGET: nessun budget generato per il progetto. Suggerisci all'utente di generare il budget dalla pagina Budget prima di usare i tools.";
  }
  const fmt = (n: number) => Math.round(n).toLocaleString("it-IT");
  const linesByTopSheet = ctx.budget.lines.reduce<
    Record<string, BudgetLineDetail[]>
  >((acc, l) => {
    const list = acc[l.topSheet] ?? [];
    list.push(l);
    acc[l.topSheet] = list;
    return acc;
  }, {});

  const sections: string[] = [];
  let totalShown = 0;
  for (const [topSheet, lines] of Object.entries(linesByTopSheet)) {
    if (totalShown >= MAX_BUDGET_LINES_IN_PROMPT) break;
    const label = TOP_SHEET_LABEL_IT[topSheet] ?? topSheet;
    const residual = ctx.budget.residualByTopSheet[topSheet] ?? 0;
    const header = `  [${label}] residuo €${fmt(residual)}`;
    const visible = lines.slice(0, MAX_BUDGET_LINES_IN_PROMPT - totalShown);
    totalShown += visible.length;
    const lineLines = visible.map((l) => {
      const rateLabel = l.rate !== null ? `${fmt(l.rate)}€` : "n/d";
      const qtyLabel = l.quantity !== null ? `x${l.quantity}` : "";
      const estLabel = `€${fmt(l.estimated)}`;
      const actualLabel =
        l.actual !== null ? ` consuntivo €${fmt(l.actual)}` : "";
      const catLabel = l.category ? ` <${l.category}>` : "";
      return `    - id:${l.id} "${l.name}"${catLabel} ${rateLabel}${qtyLabel} stima ${estLabel}${actualLabel}`;
    });
    sections.push(`${header}\n${lineLines.join("\n")}`);
  }
  const truncated =
    ctx.budget.lines.length > totalShown
      ? `\n  …e altre ${ctx.budget.lines.length - totalShown} righe (chiedi all'utente per il dettaglio)`
      : "";

  const statusLabel = ctx.budget.status ? `status=${ctx.budget.status}` : "";
  return `\n\nBUDGET COMPLETO ${statusLabel} (totale stimato €${fmt(ctx.budget.totalAllocated)}):
${sections.join("\n")}${truncated}`;
};

const buildLocationsToolsGuidance = (
  _page: PageContext["page"],
  bible: FilmBible | null,
): string => {
  const settingPrior =
    bible !== null ? `\n\n${formatBibleForLocations(bible)}` : "";
  return `\n\nTOOLS DISPONIBILI SULLE LOCATION:
- search_places(query, location_bias?, max_results?): cerca luoghi reali su Google Places.
- list_location_requirements(scene_number?): elenca i requirement esistenti (con scene collegate + candidate_count). Usa PRIMA di add_candidate per scoprire il requirement_id senza chiederlo all'utente.
- create_location_requirement(scene_number, brief?): crea un nuovo requirement collegato a una scena (deriva nome/int_ext/time_of_day dallo slugline).
- find_or_create_requirement_for_scene(scene_number): IDEMPOTENTE. Entry point canonico — restituisce il requirement della scena (lo crea se manca). Preferisci questo quando aggiungi candidati per "scena N".
- add_candidate(requirement_id, name, address?, lat?, lng?, notes?, photo_names?): salva un candidato. Per ogni risultato di search_places passa SEMPRE i photo_names (max 3).${settingPrior}

WORKFLOW OBBLIGATORIO:
- L'utente chiede "trova candidati per la scena N" → find_or_create_requirement_for_scene({scene_number: N}) → search_places → add_candidate per ogni risultato.
- L'utente chiede "aggiungi questi candidati" (con risultati già in chat) → find_or_create_requirement_for_scene(scena rilevante) → add_candidate per ognuno. MAI chiedere UUID all'utente.
- L'utente chiede "aggiungi [nome specifico]" → find_or_create_requirement_for_scene → search_places(nome) → add_candidate sul primo risultato.

ESEMPI:

❌ SBAGLIATO:
"Mi mancano i location requirement IDs per poter salvare i candidati. Apri la sezione Locations e copiami gli UUID."
(NON chiedere mai UUID. Sei tu che li scopri/crei.)

✅ CORRETTO:
[chiama find_or_create_requirement_for_scene({scene_number: 1}) → {requirement_id: "abc"}]
[chiama search_places({query: "pizzeria forno a legna", location_bias: "Sesto San Giovanni"})]
[chiama add_candidate({requirement_id: "abc", name: "Vesuviosesto", lat:..., lng:..., notes: "...", photo_names: [...]})]
"Ho aggiunto Vesuviosesto al requirement della scena 1."

REGOLE FERREE:
- Inoltra SEMPRE 'photo_names' (max 3) quando il candidato viene da search_places.
- Mai chiedere requirement_id all'utente. Sempre risolverlo via list_location_requirements o find_or_create_requirement_for_scene.`;
};

const formatShotPlansContext = (
  ctx: CesareContext,
  page: PageContext["page"],
): string => {
  if (page !== "shooting-plan") return "";
  if (ctx.shotPlans.length === 0) {
    return "\n\nPIANI ESISTENTI PER LA SCENA CORRENTE: nessuno (la scena è scoperta — il primo piano viene creato automaticamente dalla UI).";
  }
  const lines = ctx.shotPlans.map((plan) => {
    const tag = plan.isActive ? " [ATTIVO]" : "";
    const shotLines =
      plan.shots.length > 0
        ? plan.shots
            .slice(0, 12)
            .map(
              (s, i) =>
                `      ${i + 1}. ${s.shotSize}/${s.cameraMovement}${
                  s.durationMin !== null ? ` (${s.durationMin}min)` : ""
                }${s.notes ? ` — ${s.notes}` : ""}`,
            )
            .join("\n")
        : "      (nessuno shot)";
    return `  - "${plan.name}"${tag} — ${plan.shotCount} shot (scenarioId: ${plan.scenarioId})\n${shotLines}`;
  });
  return `\n\nPIANI ESISTENTI PER LA SCENA CORRENTE:\n${lines.join("\n")}`;
};

const buildShootingPlanToolsGuidance = (
  _page: PageContext["page"],
  activeSceneId: string | null,
): string => {
  const sceneHint = activeSceneId
    ? `\nScena attiva (selezionata dall'utente): ${activeSceneId}. Usala come default per scene_id nei tool quando l'utente non specifica una scena diversa.`
    : "\nNessuna scena attiva — se l'utente non passa un scene_id, chiedigli di selezionarne una prima di operare.";
  return `\n\nTOOLS DISPONIBILI SUL PIANO INQUADRATURE (usali sempre, non descrivere soltanto):
- add_parallel_plan(scene_id, name): crea un piano parallelo (es. "Piano B"). Il primo piano (Piano A) esiste già — non ricrearlo.
- add_shot_to_plan(plan_id, shot_type, description?, duration_min?): aggiunge uno shot in coda al piano. shot_type ∈ {WS, EWS, MS, MCU, CU, ECU, INSERT, OTS, TWO_SHOT, POV}.
- set_active_plan(plan_id): rende un piano attivo (in modo atomico, disattiva gli altri della stessa scena).
- update_shot(shot_id, patch): modifica uno shot esistente.
- remove_shot(shot_id): elimina uno shot.
- generate_plan_from_description(scene_id, plan_name, description): scorciatoia — crea un piano e popola gli shot leggendo una descrizione testuale.
- propose_blocking_for_scene(scene_id?): propone un'intera disposizione di blocking (attori + camere) come ghost-pins sulla canvas 2D. NON scrive nulla — l'utente accetta dalla UI. Usa questo quando l'utente dice "suggerisci blocking", "proponi una disposizione", "dove metto attori e camere".
- propose_move_actor_position(actor_position_id, x, y, reason?): propone di spostare un singolo attore. Anteprima fantasma.
- propose_move_camera_pin(camera_pin_id, x, y, direction_deg?, reason?): propone di spostare una camera. Anteprima fantasma.

WORKFLOW per "fai il Piano B":
1. add_parallel_plan(scene_id, name: "Piano B")
2. Per ogni shot del piano: add_shot_to_plan(plan_id, shot_type, description, duration_min)
3. Solo DOPO aver salvato, scrivi il messaggio finale che riassume cosa hai creato.

❌ SBAGLIATO: "Salvo ora il Piano B" (senza chiamare i tool)
✅ CORRETTO: [add_parallel_plan, add_shot_to_plan×N, "Ho creato Piano B con N shot"]

REGOLE FERREE:
- L'utente lavora su una scena specifica — usa scene_id dal contesto come default.
- Stima duration_min realistica: 45min per setup iniziale (WS), 20-30min per shot complesso (CU/OTS), 15min per insert.
- Quando l'utente non specifica gli shot, proponi 4-6 shot coerenti col contesto narrativo della scena (vedi TESTO SCENEGGIATURA).
- Non duplicare la struttura di Piano A se stai costruendo Piano B — guarda i PIANI ESISTENTI per variare angoli e approccio.${sceneHint}`;
};

const buildBudgetToolsGuidance = (_page: PageContext["page"]): string => {
  return `\n\nTOOLS DISPONIBILI SUL BUDGET (usali sempre per modificare voci/cap/spese; conferma in italiano 'Ho aggiornato…', 'Ho aggiunto…', 'Ho ridistribuito…'):
- update_budget_line(line_id, field, value): aggiorna rate, quantity, actual o notes di una riga. Usa gli id "id:..." che vedi nel BUDGET COMPLETO.
- add_budget_line(top_sheet, description, rate, quantity?, linked_category?): aggiunge una nuova voce di costo a un top sheet esistente.
- redistribute_topsheet(from_top_sheet, to_top_sheet, amount): sposta fondi tra top sheet riducendo la riga piu grande del primo e creando/incrementando una riga "Contingenza riallocata da X" nel secondo. Se l'amount supera la riga piu grande, il tool ritorna errore e proponi un piano multi-step.
- analyze_variance(): report deterministico delle righe piu sopra/sotto budget e dei top sheet con residuo negativo. Usalo prima di proporre tagli.
- mark_line_actual(line_id, actual_amount): registra una spesa effettiva (usalo quando l'utente comunica un consuntivo).

NUOVE CAPABILITY (intelligence):
- set_budget_cap({ scope, amount_cents }): imposta un tetto budget (globale o per topsheet). Usa quando l'utente dice "non superare X" o "il cast non puo costare piu di Y". L'amount va in centesimi (€50.000 = 5000000).
- evaluate_against_cap(): leggi situazione vs tetto. Usa per "siamo dentro budget?", "quanto rimane?", "siamo nel budget?".
- propose_excessive_lines_flags(): segnala voci anomale (>150% della media della loro categoria). NON mutare nulla — l'utente decide.
- propose_missing_lines({ scene_ids? }): proponi voci potenzialmente mancanti dal breakdown delle scene. NON mutare nulla.

Linee guida:
- Prima di tagliare/redistribuire grosse cifre, chiama analyze_variance() per capire dove c'e davvero margine.
- Non toccare cast/troupe a livello di risorsa: opera solo su righe budget_lines.
- Quando ridistribuisci, spiega in 1-2 frasi il razionale ("Sposto €X dalla post-produzione alla contingenza perche…").
- Per i tool che iniziano con propose_* o evaluate_*: ritorna sempre il riepilogo numerico all'utente in chiaro. Sono read-only e non scrivono nel DB.`;
};

const buildScreenplayToolsGuidance = (_page: PageContext["page"]): string => {
  return `\n\nTOOLS DISPONIBILI SULLA SCENEGGIATURA — ogni modifica al testo DEVE passare per un tool propose_/rewrite_/merge_/delete_, MAI scrivere il testo nuovo nel chat.

NUMERAZIONE SCENE (REGOLA TASSATIVA): il parametro \`scene_number\` di OGNI tool (rewrite_scene, delete_scene, merge_scenes, tag_element, ecc.) è SEMPRE la posizione ORDINALE della scena nell'INDICE SCENEGGIATURA qui sopra (1 = prima scena del documento, 2 = seconda, e così via). NON è l'etichetta che compare accanto allo slugline nell'editor (che può essere "5A", avere buchi, o essere stata rinumerata a mano): quell'etichetta è puramente cosmetica e non va MAI usata come \`scene_number\`. Quando l'utente nomina una scena — anche con un'etichetta tipo "scena 5A" o "l'ultima scena" — mappala tu alla posizione ordinale contando le voci nell'INDICE SCENEGGIATURA. Nel dubbio, usa read_scene(N) per verificare di aver individuato la scena giusta PRIMA di riscriverla.

TOOLS DISPONIBILI SULLA SCENEGGIATURA:
- rewrite_scene({ scene_number, new_content }): il tool UNIVERSALE per modificare UNA scena. Vale per QUALSIASI cambiamento al testo di quella scena — aggiungere/togliere una battuta, aggiungere un personaggio, spostare un momento, cambiare una parola, rendere più intensa, dare un'alternativa. Leggi PRIMA la scena con read_scene(N), poi restituisci in new_content il Fountain COMPLETO della scena come deve risultare dopo la modifica (non un frammento, non un diff). ESATTAMENTE UNO slugline (INT./EXT.). Applica inline (overlay verde) formattando cue e dialoghi correttamente.
- merge_scenes({ from, to, hint? }): FONDE più scene consecutive in una sola. Usa quando l'utente dice "unisci le scene N-M", "queste due scene sono in realtà una", "compatta queste scene". Il numero finale di scene cala.
- delete_scene({ scene_number }): ELIMINA una scena. Usa quando l'utente dice "togli questa scena", "elimina sc.N", "rimuovi". Le scene successive vengono rinumerate.
- propose_screenplay_revision({ scope, instruction, label }): riscrittura macro libera su PIÙ scene o l'intera sceneggiatura. Usa quando l'utente chiede "scrivi una v2", "riscrivi l'Atto II", "ambienta in un ristorante stellato", "tutto in una stanza", "rendi più tesa l'intera sceneggiatura". Crea una DRAFT version visibile nel drawer Versioni con diff side-by-side. Lo 'scope' può essere { kind: "scene_range", from, to } o { kind: "whole_screenplay" }.
- propose_rename_entity({ kind: "character" | "location", from, to }): trova tutte le occorrenze di un personaggio o di una location nella sceneggiatura e propone il rename globale in una sola operazione. Usa per "rinomina X in Y".

ROUTING TOOL — REGOLE DI SCELTA:
- QUALSIASI modifica a UNA scena — "aggiungi/togli una battuta o un personaggio in scena N", "cambia/sostituisci [parola/battuta] in scena N", "sposta [momento] in scena N", "riscrivi la scena N", "opzione B per scena N", "rendi più intensa la scena N" → rewrite_scene (leggi prima read_scene(N), poi new_content = scena INTERA aggiornata, UN solo slugline!)
- "unisci scene N e M" / "fondi sc.N-M" / "queste due scene sono una sola" → merge_scenes
- "elimina/togli sc.N" (l'intera scena) → delete_scene
- "riscrivi atto II" / "ambienta tutto in X" / cambio su un RANGE di >1 scena → propose_screenplay_revision
- "rinomina/cambia il nome di un personaggio o una location" (in QUALSIASI forma: "cambia nome di X", "chiamiamolo Y", "X diventa Y", anche se dice "nella scena N") → propose_rename_entity: prende OGNI occorrenza (cue, azione, dialogo, parentetica) in una sola proposta globale. NON usare rewrite_scene per un rename globale (cambierebbe solo una scena).

COERENZA DEI NOMI (REGOLA TASSATIVA): quando riscrivi una scena (rewrite_scene) o una revisione (propose_screenplay_revision), usa ESCLUSIVAMENTE i personaggi e le location già presenti nel progetto — vedi l'elenco PERSONAGGI qui nel contesto e, se serve, leggi le scene con read_scene/read_scene_range per verificare i nomi esatti (cue, dialoghi, azione). NON inventare MAI un nome nuovo per un personaggio o una location che esiste già: riferisciti a chi c'è con il suo nome canonico. Introduci un nome nuovo solo se l'utente lo chiede esplicitamente. Nel dubbio su chi sia in scena, leggi la scena prima di riscriverla.

COMPRENSIONE PRIMA DI MODIFICARE (REGOLA TASSATIVA per rewrite_scene): nel contesto hai i RIASSUNTI DELLE SCENE (cosa succede, funzione narrativa) e il FILM BIBLE (archi dei personaggi, conflitto). PRIMA di riscrivere una scena: (1) leggi il suo testo esatto con read_scene(N), (2) capisci la sua FUNZIONE NARRATIVA e cosa contiene, (3) fai SOLO la modifica richiesta preservando ogni altra battuta, azione e momento. Una scena riscritta più corta dell'originale — quando l'utente non ha chiesto di tagliare — significa che hai perso contenuto: RICOSTRUISCI la scena completa. La comprensione della scena serve proprio a non distruggerla: sai cosa c'è, quindi lo mantieni.

REGOLA TASSATIVA: per QUALSIASI richiesta che produca testo nuovo lungo (più di 2-3 righe Fountain), DEVI chiamare un tool propose_/rewrite_/merge_/delete_. Mai scrivere il Fountain risultante nel chat.

❌ SBAGLIATO:
"Ecco la versione 2 ambientata in un ristorante stellato:
\`\`\`fountain
Title: NON FA RIDERE (v2)
...
\`\`\`"
(Scrive l'intera sceneggiatura nel chat. NON FARE COSÌ.)

✅ CORRETTO:
[propose_screenplay_revision({ scope: { kind: "whole_screenplay" }, instruction: "ambienta tutta la sceneggiatura in un ristorante stellato, mantenendo i personaggi e la struttura", label: "v2 — Lo Stellato" })]
"Ho preparato la versione 2 'Lo Stellato' come draft. Apri il drawer Versioni per confrontarla con l'attuale e promuoverla se ti convince."

Quando l'utente chiede una modifica ambigua, fai PRIMA una domanda di chiarimento sullo scope, POI chiama il tool. Mai produrre Fountain inline.`;
};

const ROLE_TEXT = `Sei Cesare, l'assistente AI di Oh Writers, ispirato a Cesare Zavattini.
Non sei un chatbot generico. Sei un LAYER SOPRA il prodotto: vedi e modifichi tutta la produzione — sceneggiatura, soggetto, breakdown, schedule, budget, piano inquadrature, location. Conosci l'intera produzione del film su cui stai lavorando.

Indossi più cappelli a seconda della richiesta: DRAMATURG (sceneggiatura, soggetto), LINE PRODUCER (budget), 1st AD (schedule), LOCATION SCOUTER (location), DIRETTORE DELLA FOTOGRAFIA (piano inquadrature). Quando l'utente chiede qualcosa, usa il cappello giusto per QUELLA richiesta — non quello della pagina in cui si trova. Esempi: sulla pagina BUDGET può chiederti di riscrivere una scena (cappello dramaturg → rewrite_scene); sulla pagina LOCATIONS può chiederti una modifica al soggetto (cappello dramaturg → apply_text_edit). MAI rispondere "non ho tool per questo" se esiste un tool in qualsiasi area: il prodotto è uno solo.

Rispondi in italiano. Sii concreto e specifico — non generare testo generico.
Quando suggerisci modifiche alla sceneggiatura, usa il formato Fountain.
Quando parli di costi, usa i numeri reali dal budget.
Quando parli di disponibilità, usa i dati reali dello schedule.
Quando parli di location, aiuta il regista a valutare i candidati in base al contesto narrativo della scena.
Quando hai il testo della sceneggiatura, citalo esplicitamente nelle tue risposte.`;

const LAZY_READ_GUIDANCE = `\n\nLETTURA LAZY (read tools):
Quando ti serve il testo letterale di una scena, il contenuto di un documento, le righe del budget, gli elementi del breakdown, i dettagli di un requirement di location o le strip di una giornata di ripresa, USA i tool \`read_*\` (es. read_scene, read_scene_range, read_document, read_budget_lines, read_breakdown, read_location_requirement, read_shooting_day). NON attendere che il dato compaia nel system prompt: il system prompt contiene solo metadati e indici; il dettaglio lo recuperi tu su richiesta.`;

const buildProductionContextBlock = (ctx: CesareContext): string => {
  const sceneList =
    ctx.scenes.length > 0
      ? ctx.scenes
          .slice(0, 200)
          .map((s) => `  ${s.number}. ${s.heading}`)
          .join("\n")
      : "  (nessuna scena)";

  const truncationNote =
    ctx.scenes.length > 200
      ? `\n  …e altre ${ctx.scenes.length - 200} scene (usa read_scene/read_scene_range per il dettaglio)`
      : "";

  const characters =
    ctx.characters.length > 0 ? ctx.characters.join(", ") : "(nessuno)";

  const projectDocSummary =
    ctx.projectDocuments.length > 0
      ? ctx.projectDocuments
          .map((d) => `  - ${DOCUMENT_LABELS[d.type]} (id: ${d.id})`)
          .join("\n")
      : "  (nessun documento)";

  return `PROGETTO: "${ctx.projectTitle}"

INDICE SCENEGGIATURA (${ctx.scenes.length} scene totali):
${sceneList}${truncationNote}

PERSONAGGI: ${characters}

DOCUMENTI DEL PROGETTO:
${projectDocSummary}`;
};

const buildToolGuidanceBlock = (
  ctx: CesareContext,
  page: PageContext["page"],
  activeShootingDayNumber: number | null,
  activeSceneId: string | null,
): string => {
  const documentToolsGuidance = buildDocumentToolsGuidance(ctx);
  // Spec 43: every tool is always callable regardless of page. The page
  // value here is *contextual hint*, not a gate. The user being on page X
  // shifts the default subject ("the user is on Locations looking at SC.1")
  // but never restricts which tools you can invoke.
  return `GUIDA AGLI STRUMENTI — sei un layer SOPRA il SaaS: vedi e modifichi tutto, anche cross-pagina.
L'utente si trova attualmente sulla pagina "${page}" (informazione di contesto, NON un filtro sui tool).
Quando ha senso, usa tool di un'altra area (es. dalle Locations puoi modificare una scena con rewrite_scene, o leggere il soggetto con read_document) — il prodotto è un unico spazio di lavoro.${buildLocationsToolsGuidance(
    page,
    ctx.bible,
  )}${documentToolsGuidance}${buildBreakdownToolsGuidance(
    page,
  )}${buildScheduleToolsGuidance(
    page,
    activeShootingDayNumber,
  )}${buildBudgetToolsGuidance(page)}${buildShootingPlanToolsGuidance(
    page,
    activeSceneId,
  )}${buildScreenplayToolsGuidance(page)}${LAZY_READ_GUIDANCE}`;
};

const buildDynamicStateBlock = (
  ctx: CesareContext,
  page: PageContext["page"],
  activeShootingDayNumber: number | null,
): string => {
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
  // Headings-only window: bodies are excluded from the prompt to save tokens —
  // Cesare can call read_scene(N) if it needs the body. Keep the marker for
  // the current scene so Cesare knows which one the user is focused on.
  const sceneWindowCtx = formatSceneWindowHeadings(ctx.sceneWindow);
  const documentsCtx = formatDocumentsContext(ctx);
  const budgetCtx = formatBudgetContext(ctx, page);
  const shotPlansCtx = formatShotPlansContext(ctx, page);

  const activeDayHint = activeShootingDayNumber
    ? `\n- Giornata attiva: ${activeShootingDayNumber}`
    : "";

  return `STATO CORRENTE (dinamico, non in cache):
- Scena corrente: ${ctx.currentScene?.heading ?? "nessuna"}
- Budget: €${totalBudget} totale, €${residualBudget} residuo
- Schedule: ${shootingDaysLabel} giorni di ripresa${activeDayHint}
${breakdownCtx}${locationsCtx}${sceneWindowCtx}${documentsCtx}${budgetCtx}${shotPlansCtx}`;
};

const formatSceneWindowHeadings = (window: SceneBodyRow[]): string => {
  if (window.length === 0) return "";
  const lines = window.map((s) => {
    const label = s.isCurrent ? "→ SCENA CORRENTE" : "  ";
    const chars =
      s.characterNames.length > 0 ? ` [${s.characterNames.join(", ")}]` : "";
    return `${label} Sc.${s.number} ${s.heading}${chars}`;
  });
  return `\nFINESTRA SCENE (solo heading — usa read_scene/read_scene_range per il corpo):\n${lines.join("\n")}`;
};

// legacy — replaced by assembleSystemPromptV2 (spec 39). Kept for reference only.
const buildSystemPrompt = (
  ctx: CesareContext,
  page: PageContext["page"],
  activeShootingDayNumber: number | null = null,
  activeSceneId: string | null = null,
): SystemPromptBlock[] => {
  // Block positions are fixed so Anthropic cache checkpoints never shift.
  // Position 1 is always the bible block (empty sentinel when no bible yet).
  const bibleText =
    ctx.bible !== null
      ? formatGlobalContext(ctx.bible)
      : "[FILM BIBLE]\n(not yet distilled)";

  const blocks: SystemPromptBlock[] = [
    { type: "text", text: ROLE_TEXT, cache_control: { type: "ephemeral" } },
    { type: "text", text: bibleText, cache_control: { type: "ephemeral" } },
    {
      type: "text",
      text: buildProductionContextBlock(ctx),
      cache_control: { type: "ephemeral" },
    },
    {
      type: "text",
      // No cache breakpoint here: this block varies by page, active scene and
      // active shooting day, so it churns turn-to-turn and would mostly miss.
      // Anthropic caps a request at 4 cache breakpoints; that budget is better
      // spent on the static tool array (see withCachedTools in cesare-tools.ts),
      // so this slot is intentionally left uncached.
      text: buildToolGuidanceBlock(
        ctx,
        page,
        activeShootingDayNumber,
        activeSceneId,
      ),
    },
    {
      type: "text",
      text: buildDynamicStateBlock(ctx, page, activeShootingDayNumber),
    },
  ];

  return blocks;
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

const mockResponse = (
  pageContext: PageContext,
): ResultAsync<string, CesareError> =>
  ResultAsync.fromSafePromise(
    Promise.resolve(
      MOCK_RESPONSES[pageContext.page] ?? MOCK_RESPONSES["default"]!,
    ),
  );

// ─── Text-only call (no tools) ────────────────────────────────────────────────
// Used by the legacy V1 handler (handleAskCesare). Kept for reference; the
// active V2 path goes through runUnifiedToolLoop / callCesareV2.

const callCesare = (
  systemPrompt: SystemPromptBlock[],
  conversationHistory: ConversationMessage[],
  message: string,
  model: string,
): ResultAsync<string, CesareError> => {
  const messages = [
    ...conversationHistory.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content as string,
    })),
    { role: "user" as const, content: message },
  ];
  return ResultAsync.fromPromise(
    generateText({
      model: anthropic(model),
      system: systemPrompt.map((b) => b.text).join("\n\n"),
      messages,
      maxOutputTokens: 1024,
      experimental_telemetry: aiTelemetry("cesare-text-only"),
    }).then((r) => repairMojibake(r.text)),
    (e) =>
      new CesareError(
        `Cesare text call failed: ${e instanceof Error ? e.message : String(e)}`,
      ),
  );
};

// ─── Agentic tool loop callers ────────────────────────────────────────────────
// Client construction is now handled inside cesare-tools.ts (via generateText
// from @ai-sdk/anthropic for production, or the mock legacy client for MOCK_AI).
// These callCesare* functions are thin wrappers that assemble the messages array
// and delegate to the appropriate run*ToolLoop.

const callCesareWithTools = (
  systemPrompt: SystemPromptBlock[],
  conversationHistory: ConversationMessage[],
  message: string,
  db: Db,
  projectId: string,
  requirementId: string | null | undefined,
  model: string,
): ResultAsync<string, CesareError> => {
  const messages = [
    ...conversationHistory.map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: message },
  ];
  return runToolLoop(
    systemPrompt,
    messages,
    db,
    projectId,
    model,
    requirementId ?? null,
  );
};

const SCREENPLAY_PROPOSE_TOOLS = new Set<string>([
  "transform_document",
  "propose_screenplay_revision",
  "propose_rename_entity",
  "rewrite_scene",
  "merge_scenes",
  "delete_scene",
]);

// Bug #4 — the document-generation tools the intent classifier may force on a
// narrative document page. Universal dispatch (spec 47b) exposes these on every
// page; the classifier nudge only forces one when the request clearly asks to
// write/generate a document, so free natural-language requests dispatch reliably.
const DOCUMENT_GEN_TOOLS = new Set<string>([
  "transform_document",
  "write_logline",
  "propose_soggetto_v2",
  "propose_synopsis_from_screenplay",
  "propose_scaletta_from_soggetto",
  "propose_treatment_from_narrative",
  "generate_screenplay_from_narrative",
]);

// The screenplay page is ALSO the page a Cesare SESSION resolves to by default
// (`deriveCesarePage` falls back to "screenplay" on /sessions/*). A session is the
// primary surface for a Cesare-only writer, who freely asks for any document
// there. So the classifier on the screenplay page must be able to force BOTH the
// screenplay propose_* tools AND the document generators — universal dispatch
// (spec 47b) already exposes the document generators on every page, so forcing one
// is safe. The union keeps screenplay mutations working while making
// free-language document requests from a session dispatch reliably.
const SCREENPLAY_PAGE_CLASSIFIER_TOOLS = new Set<string>([
  ...SCREENPLAY_PROPOSE_TOOLS,
  ...DOCUMENT_GEN_TOOLS,
]);

// Pages on which the intent classifier runs (it is a no-op elsewhere): the
// screenplay page (screenplay mutations + document generation — sessions default
// here) and the narrative document pages (generation).
const CLASSIFIER_TOOLS_BY_PAGE: Readonly<Record<string, ReadonlySet<string>>> =
  {
    screenplay: SCREENPLAY_PAGE_CLASSIFIER_TOOLS,
    soggetto: DOCUMENT_GEN_TOOLS,
    synopsis: DOCUMENT_GEN_TOOLS,
    outline: DOCUMENT_GEN_TOOLS,
    treatment: DOCUMENT_GEN_TOOLS,
  };

const callCesareWithScreenplayTools = (
  systemPrompt: SystemPromptBlock[],
  conversationHistory: ConversationMessage[],
  message: string,
  db: Db,
  projectId: string,
  model: string,
): ResultAsync<string, CesareError> => {
  const messages = [
    ...conversationHistory.map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: message },
  ];
  // Run the semantic intent classifier first (cheap Haiku call). On any
  // error or low confidence, the classifier returns a no-op intent and we
  // fall back to `tool_choice: auto`.
  return classifyIntent({
    userMessage: message,
    page: "screenplay",
    availableTools: SCREENPLAY_PROPOSE_TOOLS,
  })
    .map((intent) => intent.suggestedTool)
    .orElse(() =>
      ResultAsync.fromSafePromise(
        Promise.resolve<string | undefined>(undefined),
      ),
    )
    .andThen((forcedFirstTool) =>
      runScreenplayToolLoop(
        systemPrompt,
        messages,
        db,
        projectId,
        model,
        forcedFirstTool,
      ),
    );
};

const callCesareWithDocumentTools = (
  systemPrompt: SystemPromptBlock[],
  conversationHistory: ConversationMessage[],
  message: string,
  db: Db,
  projectId: string,
  docContext: DocumentContext,
  model: string,
  userIdFallback: string | null,
): ResultAsync<string, CesareError> => {
  const messages = [
    ...conversationHistory.map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: message },
  ];
  return runDocumentToolLoop(
    systemPrompt,
    messages,
    db,
    projectId,
    model,
    docContext,
    userIdFallback,
  );
};

const callCesareWithBreakdownTools = (
  systemPrompt: SystemPromptBlock[],
  conversationHistory: ConversationMessage[],
  message: string,
  db: Db,
  projectId: string,
  model: string,
): ResultAsync<string, CesareError> => {
  const messages = [
    ...conversationHistory.map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: message },
  ];
  return runBreakdownToolLoop(systemPrompt, messages, db, projectId, model);
};

const callCesareWithScheduleTools = (
  systemPrompt: SystemPromptBlock[],
  conversationHistory: ConversationMessage[],
  message: string,
  db: Db,
  projectId: string,
  activeDayNumber: number | null,
  model: string,
): ResultAsync<string, CesareError> => {
  const messages = [
    ...conversationHistory.map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: message },
  ];
  const scheduleContext: ScheduleToolContext = { projectId, activeDayNumber };
  return runScheduleToolLoop(
    systemPrompt,
    messages,
    db,
    projectId,
    model,
    scheduleContext,
  );
};

const callCesareWithShootingPlanTools = (
  systemPrompt: SystemPromptBlock[],
  conversationHistory: ConversationMessage[],
  message: string,
  db: Db,
  projectId: string,
  activeSceneId: string | null,
  model: string,
): ResultAsync<string, CesareError> => {
  const messages = [
    ...conversationHistory.map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: message },
  ];
  const shootingPlanContext: ShootingPlanToolContext = {
    projectId,
    activeSceneId,
  };
  return runShootingPlanToolLoop(
    systemPrompt,
    messages,
    db,
    projectId,
    model,
    shootingPlanContext,
  );
};

const callCesareWithBudgetTools = (
  systemPrompt: SystemPromptBlock[],
  conversationHistory: ConversationMessage[],
  message: string,
  db: Db,
  projectId: string,
  model: string,
): ResultAsync<string, CesareError> => {
  const messages = [
    ...conversationHistory.map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: message },
  ];
  return runBudgetToolLoop(systemPrompt, messages, db, projectId, model);
};

// ─── Universal dispatch (spec 43) ───────────────────────────────────────────
// Cesare is a layer above the SaaS: every tool always available, page is
// just where the user is, not a gate. This replaces the seven page-specific
// callCesareWith* functions above. They stay registered for now to avoid
// touching MOCK-AI scenario tests that may import the named symbols, but
// handleAskCesare always routes here.

const callCesareUniversal = (
  systemPrompt: SystemPromptBlock[],
  conversationHistory: ConversationMessage[],
  message: string,
  db: Db,
  ctx: {
    projectId: string;
    documentContext: DocumentContext | null;
    activeSceneId: string | null;
    activeDayNumber: number | null;
    userIdFallback: string | null;
    page: string;
    sessionId: string | null;
  },
  model: string,
): ResultAsync<string, CesareError> => {
  const messages = [
    ...conversationHistory.map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: message },
  ];

  // Intent classifier hint (only on screenplay page where the tool surface
  // is dense enough to benefit). On other pages we skip the cheap-but-not-
  // free Haiku call and let `tool_choice: auto` work.
  if (ctx.page === "screenplay") {
    return classifyIntent({
      userMessage: message,
      page: "screenplay",
      availableTools: SCREENPLAY_PROPOSE_TOOLS,
    })
      .map((intent) => intent.suggestedTool)
      .orElse(() =>
        ResultAsync.fromSafePromise(
          Promise.resolve<string | undefined>(undefined),
        ),
      )
      .andThen((forcedFirstTool) =>
        runUniversalToolLoop(
          systemPrompt,
          messages,
          db,
          {
            projectId: ctx.projectId,
            documentContext: ctx.documentContext,
            activeSceneId: ctx.activeSceneId,
            activeDayNumber: ctx.activeDayNumber,
            userIdFallback: ctx.userIdFallback,
            sessionId: ctx.sessionId,
            userInstruction: message,
          },
          model,
          forcedFirstTool,
        ),
      );
  }

  return runUniversalToolLoop(
    systemPrompt,
    messages,
    db,
    {
      projectId: ctx.projectId,
      documentContext: ctx.documentContext,
      activeSceneId: ctx.activeSceneId,
      activeDayNumber: ctx.activeDayNumber,
      userIdFallback: ctx.userIdFallback,
      userInstruction: message,
      sessionId: ctx.sessionId,
    },
    model,
  );
};

// ─── Handler body ─────────────────────────────────────────────────────────────

// Pages that have agentic tools — when MOCK_AI=true these still run through
// the tool loop (against the mock LLM client) so end-to-end side effects on
// the DB are exercised. Non-agentic pages keep the cheap string fallback.
const AGENTIC_PAGES = new Set<string>([
  "locations",
  "breakdown",
  "schedule",
  "budget",
  "shooting-plan",
  "screenplay",
  "soggetto",
  "synopsis",
  "outline",
  "treatment",
]);

// legacy — replaced by handleAskCesareV2 (spec 39). Kept for reference only.
const handleAskCesare = (
  data: CesareInput,
  db: Db,
  access: ProjectAccess,
): ResultAsync<string, CesareError> => {
  if (
    process.env["MOCK_AI"] === "true" &&
    !AGENTIC_PAGES.has(data.pageContext.page)
  ) {
    return mockResponse(data.pageContext);
  }

  const tier = routeModel({
    userMessage: data.message,
    page: data.pageContext.page,
    conversationLength: data.conversationHistory.length,
  });
  const model = tierToModel(tier);

  if (process.env["CESARE_DEBUG"] === "true") {
    logger.debug(
      {
        tier,
        model,
        page: data.pageContext.page,
        convLen: data.conversationHistory.length,
        msg: data.message.slice(0, 60),
      },
      "cesare request routing",
    );
  }

  return assembleContext(db, data.projectId, data.pageContext).andThen(
    (ctx) => {
      const activeSceneIdForPrompt =
        ctx.currentScene?.id ?? data.pageContext.sceneId ?? null;
      const systemPrompt = buildSystemPrompt(
        ctx,
        data.pageContext.page,
        data.pageContext.shootingDayNumber ?? null,
        activeSceneIdForPrompt,
      );
      // Spec 43: universal dispatch — every tool always available, page is
      // just contextual prompting. The classifier still fires on screenplay
      // page to nudge tool_choice toward the right propose_* tool when the
      // user intent is unambiguous.
      const documentContext: DocumentContext | null =
        isDocumentPage(data.pageContext.page) && ctx.activeDocument
          ? {
              documentId: ctx.activeDocument.id,
              documentType: ctx.activeDocument.type,
              content: ctx.activeDocument.content,
            }
          : null;

      // Pages that have no agentic tooling at all (rare leftover) still get
      // the cheap text-only fallback. Today this branch is only hit when no
      // page context was provided.
      if (!AGENTIC_PAGES.has(data.pageContext.page)) {
        return callCesare(
          systemPrompt,
          data.conversationHistory,
          data.message,
          model,
        );
      }

      return callCesareUniversal(
        systemPrompt,
        data.conversationHistory,
        data.message,
        db,
        {
          projectId: data.projectId,
          documentContext,
          activeSceneId: activeSceneIdForPrompt,
          activeDayNumber: data.pageContext.shootingDayNumber ?? null,
          userIdFallback: access.user.id,
          page: data.pageContext.page,
          sessionId: data.sessionId ?? null,
        },
        model,
      );
    },
  );
};

// Intent classifier hint. The classifier fires on the screenplay page
// (mutations) and on the narrative document pages (generation — Bug #4: free
// natural-language writing requests must reliably select a generator instead
// of falling through to "no tools to invoke"). Universal dispatch exposes the
// tools on every page; the classifier only FORCES one when the request clearly
// asks for that mutation/generation, so a genuine chat question still answers
// in chat. Other pages (budget, schedule, locations) keep good adherence with
// their narrower scope, so we skip the extra Haiku call there. On any error /
// low confidence / MOCK_AI the classifier falls back to "auto" too.
//
// Depends only on (message, page) — NOT on context/prompt assembly — so the
// caller kicks this off in parallel with buildGlobalContext/buildLocalContext
// instead of waiting for the whole chain to finish first (Task 3b).
export interface TurnPlan {
  readonly forcedFirstTool: string | undefined;
  readonly tier: ModelTier;
  readonly model: string;
}

export const resolveTurnPlan = (
  message: string,
  page: string,
  conversationLength: number,
  byok?: { userId: string; db: Db },
): ResultAsync<TurnPlan, CesareError> => {
  // One decision point for the whole turn: the classified intent yields BOTH
  // the forced first tool AND the model tier. The classifier is an LLM, so it
  // absorbs any language, phrasing or typo — which is why the tier must come
  // from it and not from text heuristics patched one user report at a time
  // (#118: "versione in ingelse" sailed past every regex onto the fast tier,
  // whose model then promised background work it cannot do).
  const plan = (
    forcedFirstTool: string | undefined,
    intentScale?: "scoped" | "document",
  ): TurnPlan => {
    const tier = routeModel({
      userMessage: message,
      page: page as Parameters<typeof routeModel>[0]["page"],
      conversationLength,
      intentScale,
    });
    const model = tierToModel(tier);
    if (process.env["CESARE_DEBUG"] === "true") {
      logger.debug(
        {
          tier,
          model,
          intentScale,
          page,
          convLen: conversationLength,
          msg: message.slice(0, 60),
        },
        "cesare-v2 request routing",
      );
    }
    return { forcedFirstTool, tier, model };
  };

  const classifierTools = CLASSIFIER_TOOLS_BY_PAGE[page];
  if (!classifierTools) {
    // No classifier on this page: the structural rules (length, depth) decide.
    return ResultAsync.fromSafePromise(Promise.resolve(plan(undefined)));
  }

  return classifyIntent({
    userMessage: message,
    page,
    availableTools: classifierTools,
    userId: byok?.userId,
    db: byok?.db,
  })
    .map((intent) => {
      // #119 — publish the classified intent (versionDirective included) to
      // the ambient turn-signals cell; the tool executors read it when they
      // resolve the version action. The loop awaits this plan before any tool
      // runs, so readers always see the final value.
      setTurnClassifiedIntent(intent);
      return plan(intent.suggestedTool, INTENT_SCALE[intent.type]);
    })
    .orElse((error) => {
      // The fallback is deliberate (a broken classifier must never block the
      // writer) but it must never be SILENT again: a dead platform API key
      // 401'd every classification for weeks and the only symptom was Cesare
      // interviewing instead of acting (#118).
      logger.warn(
        { page, error: error.message },
        "cesare-v2 intent classifier failed — falling back to tool_choice auto",
      );
      return ResultAsync.fromSafePromise(Promise.resolve(plan(undefined)));
    });
};

// ─── Unified tool loop caller (spec 39) ──────────────────────────────────────

const callCesareV2 = (
  systemPrompt: SystemPromptBlock[],
  conversationHistory: ConversationMessage[],
  message: string,
  db: Db,
  projectId: string,
  access: ProjectAccess,
  executor: import("./skills/types").SkillExecutor,
  tools: readonly import("./skills/types").AnthropicTool[],
  turnPlan: ResultAsync<TurnPlan, CesareError>,
  onStreamEvent?: (event: CesareStreamEvent) => void,
  abortSignal?: AbortSignal,
): ResultAsync<{ reply: string; model: string }, CesareError> => {
  const messages = [
    ...conversationHistory.map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: message },
  ];

  // The loop already waited here for the classifier's forced-first-tool, so
  // the model decision riding along adds nothing to the critical path.
  return turnPlan.andThen(({ forcedFirstTool, model }) =>
    runUnifiedToolLoop(
      systemPrompt,
      messages,
      tools as readonly unknown[],
      executor,
      db,
      projectId,
      access,
      model,
      onStreamEvent,
      forcedFirstTool,
      abortSignal,
    ).map((reply) => ({ reply, model })),
  );
};

// ─── V2 handler — stratified context (spec 39) ────────────────────────────────

const handleAskCesareV2 = (
  data: CesareInput,
  db: Db,
  access: ProjectAccess,
  onStreamEvent?: (event: CesareStreamEvent) => void,
  abortSignal?: AbortSignal,
): ResultAsync<string, CesareError> => {
  // #119 — must run in this synchronous frame (before any await) so the whole
  // turn, tool loop included, inherits the turn-signals cell that
  // resolveTurnPlan fills with the classified intent.
  openTurnSignalsScope();
  if (
    process.env["MOCK_AI"] === "true" &&
    !AGENTIC_PAGES.has(data.pageContext.page)
  ) {
    return mockResponse(data.pageContext);
  }

  // Task 3b: kick off the turn plan (classifier + model routing) NOW, in
  // parallel with buildGlobalContext/buildLocalContext below — it depends only
  // on (message, page), not on context/prompt assembly. Calling the function
  // starts its underlying promise immediately; `callCesareV2` only awaits the
  // already-in-flight result once the tool loop needs it, so deriving the
  // model from the classified intent costs zero extra latency.
  const turnPlan = resolveTurnPlan(
    data.message,
    data.pageContext.page,
    data.conversationHistory.length,
    { userId: access.user.id, db },
  );

  // Step 1: build global context (60s memo cache)
  return buildGlobalContext(db, data.projectId)
    .mapErr(
      (e) =>
        new CesareError(
          `buildGlobalContext failed: ${"message" in e ? e.message : String(e)}`,
        ),
    )
    .andThen((globalCtx) => {
      const page = data.pageContext.page as import("./skills/types").PageType;

      // Step 2: preliminary skill build context (no docCtx yet)
      const prelimBuildCtx: SkillBuildContext = {
        bible: globalCtx.bible,
        activeSceneId: data.pageContext.sceneId ?? null,
        activeDayNumber: data.pageContext.shootingDayNumber ?? null,
        requirementId: data.pageContext.requirementId ?? null,
      };

      // Step 3: preliminary registry. `selectForPage` now returns the FULL
      // universal skill superset (spec 47b) so any tool is dispatchable from any
      // page; the page only orders which guidance leads. `userIdFallback` lets
      // the always-available document-gen skill attribute auto-created versions.
      const prelimRegistry = buildSkillRegistry(
        prelimBuildCtx,
        {},
        access.user.id,
        data.sessionId ?? null,
        data.message,
      );
      const prelimSkills = prelimRegistry.selectForPage(page, null);

      // Step 4: lean local context. We scope DB loading to the PAGE-PRIMARY
      // skills (not the universal set) so round-trips stay proportional to the
      // page. Cross-domain write tools (e.g. propose_soggetto_v2) resolve their
      // own target data inside the executor, so they need no pre-loaded context.
      const contextSkills = prelimRegistry.primarySkillsForPage(page);
      const pageCtx = {
        sceneId: data.pageContext.sceneId ?? null,
        sceneNumber: data.pageContext.sceneNumber ?? null,
        requirementId: data.pageContext.requirementId ?? null,
        documentId: data.pageContext.documentId ?? null,
        shootingDayId: data.pageContext.shootingDayId ?? null,
        shootingDayNumber: data.pageContext.shootingDayNumber ?? null,
      };

      return buildLocalContext(db, data.projectId, pageCtx, contextSkills, page)
        .mapErr(
          (e) =>
            new CesareError(
              `buildLocalContext failed: ${"message" in e ? e.message : String(e)}`,
            ),
        )
        .andThen((localCtx) => {
          // Step 5: for document pages, inject live document into document-edit skill
          let finalSkills = prelimSkills;
          let finalRegistry = prelimRegistry;

          if (
            isDocumentPage(data.pageContext.page) &&
            localCtx.activeDocument
          ) {
            const docCtx: DocumentContext = {
              documentId: localCtx.activeDocument.id,
              documentType: localCtx.activeDocument.type as DocumentType,
              content: localCtx.activeDocument.content,
            };
            const docEditSkill = buildDocumentEditSkill(
              prelimBuildCtx,
              docCtx,
              access.user.id,
              data.sessionId ?? null,
              data.message,
            );
            finalRegistry = buildSkillRegistry(
              prelimBuildCtx,
              { "document-edit": docEditSkill },
              access.user.id,
              data.sessionId ?? null,
              data.message,
            );
            finalSkills = finalRegistry.selectForPage(page, null);
          }

          // Step 6: load the bounded "what we changed before" history (Spec 51,
          // DERIVED). It degrades to null on any failure, so it never breaks a
          // turn; assemble the stratified system prompt with it appended.
          return loadHistoryContextSummary(db, data.projectId).andThen(
            (historyContext) => {
              const systemPrompt = assembleSystemPromptV2(
                globalCtx,
                finalSkills,
                localCtx,
                historyContext,
              );

              const tools = finalRegistry.allTools(finalSkills);
              const executor = finalRegistry.combinedExecutor(finalSkills);

              // Step 7: invoke the unified tool loop
              const startMs = Date.now();
              return callCesareV2(
                systemPrompt,
                data.conversationHistory,
                data.message,
                db,
                data.projectId,
                access,
                executor,
                tools,
                turnPlan,
                onStreamEvent,
                abortSignal,
              ).map(({ reply, model }) => {
                emitCesareMetricEvent(
                  data.pageContext.page,
                  data.projectId,
                  model,
                  Date.now() - startMs,
                  reply,
                );
                return reply;
              });
            },
          );
        });
    });
};

// ─── Metric events ────────────────────────────────────────────────────────────
// Structured product events emitted as console.info JSON. These are the
// "metrics" channel (how often, how costly, how slow) — distinct from OTEL
// traces (Langfuse, per-call detail) and Pino logs (system anomalies).
// A future PostHog integration will replace console.info with a real sink.

const DOCUMENT_PAGE_TYPES = new Set<string>([
  "soggetto",
  "synopsis",
  "outline",
  "treatment",
  "logline",
]);

const emitCesareMetricEvent = (
  page: string,
  projectId: string,
  model: string,
  durationMs: number,
  reply: string,
): void => {
  if (DOCUMENT_PAGE_TYPES.has(page)) {
    // Check if the reply contains a propose_* tool invocation marker — if the
    // model called a document generation tool the reply embeds <!--ohw:tools=N-->
    // with N > 0. We treat any completed document-page response as a generation.
    console.info(
      JSON.stringify({
        event: "cesare.document.generated",
        type: page,
        projectId,
        durationMs,
      }),
    );
    return;
  }

  if (page === "screenplay") {
    // Inline edits and macro revisions are both reported here. The reply
    // always embeds <!--ohw:tools=N--> when a propose_* tool was called.
    const toolCount = extractToolCountFromMarker(reply);
    if (toolCount > 0) {
      console.info(
        JSON.stringify({
          event: "cesare.inline_edit.proposed",
          projectId,
          durationMs,
        }),
      );
    }
    return;
  }

  if (page === "breakdown" || page === "schedule" || page === "budget") {
    // No dedicated metric event for these pages in Phase 1. Covered by OTEL traces.
    return;
  }
};

// Parses the tool-execution count embedded by runGenericToolLoop in the reply.
// Returns 0 when the marker is absent or malformed.
const extractToolCountFromMarker = (reply: string): number => {
  const match = /<!--ohw:tools=(\d+)-->/.exec(reply);
  return match ? parseInt(match[1] ?? "0", 10) : 0;
};

// ─── Server function ──────────────────────────────────────────────────────────

export const askCesare = createServerFn({ method: "POST" })
  .validator(CesareInputSchema)
  .handler(async ({ data }) =>
    toShape(
      // "edit": a Cesare turn can fire mutating tools (persistDocumentContent,
      // breakdown/budget/location/schedule/screenplay writers), so a read-only
      // VIEWER must not reach the turn. Gating here also makes commitOrAsk /
      // applyVersionLive unreachable by viewers. See issue #60.
      await withProjectAccess(data.projectId, "edit", ({ db, access }) =>
        handleAskCesareV2(data, db, access),
      ),
    ),
  );

// ─── Streaming entry (spec 47a / A2) ──────────────────────────────────────────
// Shared by the `/api/cesare/stream` route. Re-exports the input schema so the
// route validates against the same contract `askCesare` uses, and runs the SAME
// V2 handler with a live step-event sink. Auth is gated through
// `withProjectAccess` exactly like `askCesare`, so the Anthropic key never
// reaches the client and project access is enforced identically.
export { CesareInputSchema };

// The ambient request context (`getWebRequest`) is only available while the
// route handler is executing — NOT inside the `ReadableStream.start` callback,
// which the runtime pulls asynchronously after the Response is returned. So the
// route resolves project access eagerly (`resolveCesareStreamAccess`) WHILE the
// context is live, then runs the tool loop with the resolved handle inside the
// stream (`runCesareStreamWithAccess`). This keeps auth identical to `askCesare`
// without leaking the request context into the stream body.
export type CesareStreamAccess = WithProjectAccessCtx;

export const resolveCesareStreamAccess = (
  projectId: string,
  headers: Headers,
): ResultAsync<
  CesareStreamAccess,
  import("~/server/access").ProjectAccessError
> =>
  // "edit" — same reason as askCesare (#60): streaming turns mutate too.
  withProjectAccessHeaders(projectId, "edit", headers, (ctx) =>
    ResultAsync.fromSafePromise(Promise.resolve(ctx)),
  );

export const runCesareStreamWithAccess = (
  data: CesareInput,
  access: CesareStreamAccess,
  onStreamEvent: (event: CesareStreamEvent) => void,
  abortSignal?: AbortSignal,
): ResultAsync<string, CesareError> =>
  handleAskCesareV2(data, access.db, access.access, onStreamEvent, abortSignal);

// Test-only mock-context setter lives in the API route
// `/api/test/mock-context` so it can be hit from Playwright without going
// through TanStack's server-fn invoke protocol. See:
// apps/web/app/routes/api/test/mock-context.ts
