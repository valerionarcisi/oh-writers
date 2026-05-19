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
  documents,
  documentVersions,
  shotPlans,
  shotPlanScenarios,
  shots,
} from "@oh-writers/db/schema";
import type { DocumentType } from "@oh-writers/domain";
import { toShape } from "@oh-writers/utils";
import { withProjectAccess } from "~/server/pipeline";
import type { Db } from "~/server/db";
import type { ProjectAccess } from "~/server/access";
import { loadAnthropicStreamingClient } from "~/features/ai";
import {
  runToolLoop,
  runDocumentToolLoop,
  runBreakdownToolLoop,
  runScheduleToolLoop,
  runBudgetToolLoop,
  runShootingPlanToolLoop,
} from "./cesare-tools";
import type {
  DocumentContext,
  ScheduleToolContext,
  ShootingPlanToolContext,
} from "./cesare-tools";
import { createMockAnthropicClient } from "./_mocks/cesare-tool-loop.mock";
import { routeModel, tierToModel } from "./cesare-model-router";

// ─── System prompt blocks ─────────────────────────────────────────────────────

export interface SystemPromptBlock {
  readonly type: "text";
  readonly text: string;
  readonly cache_control?: { readonly type: "ephemeral" };
}

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
                    loadShotPlansForScene(db, shotPlanSceneId).map(
                      (shotPlanSummaries) => {
                        const activeDocId = pageContext.documentId ?? null;
                        const activeDocument: ActiveDocumentRow | null =
                          activeDocId
                            ? (() => {
                                const found = projectDocuments.find(
                                  (d) => d.id === activeDocId,
                                );
                                return found
                                  ? { ...found, isActive: true }
                                  : null;
                              })()
                            : null;
                        return {
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
                        };
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

const formatDocumentsContext = (ctx: CesareContext): string => {
  const others = ctx.projectDocuments.filter(
    (d) => d.id !== ctx.activeDocument?.id && d.content.trim().length > 0,
  );

  const sections: string[] = [];

  if (ctx.activeDocument) {
    sections.push(
      `\nDOCUMENTO ATTIVO — ${DOCUMENT_LABELS[ctx.activeDocument.type]}:\n---\n${truncate(
        ctx.activeDocument.content,
        MAX_ACTIVE_DOC_CHARS,
      )}\n---`,
    );
  }

  if (others.length > 0) {
    const lines = others.map(
      (d) =>
        `\n[${DOCUMENT_LABELS[d.type]}]\n${truncate(d.content, MAX_DOC_PREVIEW_CHARS)}`,
    );
    sections.push(`\nALTRI DOCUMENTI DEL PROGETTO:${lines.join("\n")}`);
  }

  return sections.join("\n");
};

const isDocumentPage = (page: PageContext["page"]): boolean =>
  page === "soggetto" ||
  page === "synopsis" ||
  page === "outline" ||
  page === "treatment";

const buildDocumentToolsGuidance = (ctx: CesareContext): string => {
  if (!ctx.activeDocument) return "";
  const label = DOCUMENT_LABELS[ctx.activeDocument.type];
  return `

STRUMENTI DISPONIBILI SU QUESTO ${label.toUpperCase()}:
- apply_text_edit(find, replace): sostituisce una stringa esatta del documento. Usa SEMPRE testo letterale presente nel DOCUMENTO ATTIVO sopra.
- expand_section(heading): espande la sezione sotto un heading in 2-3 paragrafi.
- compress_section(heading, target_words): comprime una sezione mantenendo i beat.

Quando l'utente chiede una modifica concreta (riscrivi, cambia, espandi, accorcia, sostituisci) USA SEMPRE il tool appropriato — non limitarti a suggerire il testo nel chat. Conferma in italiano cosa hai fatto dopo ogni edit.${buildDocumentGenToolsGuidance(ctx.activeDocument.type)}`;
};

const buildDocumentGenToolsGuidance = (activeDocType: DocumentType): string => {
  const label = DOCUMENT_LABELS[activeDocType];
  return `

GENERAZIONE DOCUMENTI (propose/accept):
Per richieste che generano un documento intero (logline, sinossi, soggetto v2, scaletta) USA I TOOLS dedicati. Tutto crea una DRAFT visibile in un banner sopra l'editor con i pulsanti "Promuovi a attiva" / "Scarta".

WORKFLOW:
- "genera la logline" / "scrivimi la logline" → propose_logline_from_screenplay({ instruction? })
- "scrivimi la sinossi" / "genera la sinossi" → propose_synopsis_from_screenplay({ instruction? })
- "fammi un v2 del soggetto più [X]" / "riscrivi il soggetto in modo [X]" → propose_soggetto_v2({ instruction: "...", label: "v2 [hint]" })
- "dato il soggetto fammi la scaletta" / "genera la scaletta dal soggetto" → propose_scaletta_from_soggetto({ target_scene_count? })

❌ SBAGLIATO:
"Ora ti scrivo la logline: …"
(Scrive il testo nella chat, non chiama il tool. NON FARE COSÌ.)

✅ CORRETTO:
[propose_logline_from_screenplay({ instruction: "più commerciale" })]
"Ho generato una logline draft per il progetto. Vai sulla pagina logline per accettarla o scartarla dal banner sopra l'editor."

Sei attualmente sul documento ${label}. Tutti e quattro i tool sono comunque disponibili: se l'utente chiede un documento diverso, eseguilo lo stesso e indica nel messaggio finale dove vedere la draft.`;
};

const buildBreakdownToolsGuidance = (page: PageContext["page"]): string => {
  if (page !== "breakdown") return "";
  return `\n\nTOOLS DISPONIBILI SUL BREAKDOWN:
- tag_element(scene_number, category, name, quantity?): aggiunge un elemento allo spoglio di una scena.
- accept_ghost(occurrence_id): accetta un suggerimento ghost.
- reject_ghost(occurrence_id): rifiuta un suggerimento ghost.
- estimate_scene_cost(scene_number): calcola costo e difficoltà di una scena.
- add_to_budget(scene_number): converte la stima della scena in righe budget reali.

Quando l'utente chiede di taggare un elemento ('spoglia X', 'aggiungi X come prop', 'questa scena ha un'arma'), USA tag_element. Quando chiede una stima di costo per una scena, USA estimate_scene_cost. Quando chiede di portare i costi al budget, USA add_to_budget. Conferma sempre in italiano cosa hai fatto.`;
};

const buildScheduleToolsGuidance = (
  page: PageContext["page"],
  activeDayNumber: number | null,
): string => {
  if (page !== "schedule") return "";
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
  production: "Production",
  crew: "Troupe",
  post_production: "Post-produzione",
  contingency: "Contingenza",
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

const buildLocationsToolsGuidance = (page: PageContext["page"]): string => {
  if (page !== "locations") return "";
  return `\n\nRUOLO: in questa pagina sei un LOCATION SCOUTER esperto. Quando l'utente ti chiede di trovare o aggiungere candidati, DEVI usare i tools — non descrivere cosa faresti, FAI.

STOP. Prima di scrivere QUALSIASI testo di risposta, devi prima chiamare i tools. Il testo arriva DOPO le chiamate tool, non al posto loro.

WORKFLOW OBBLIGATORIO:
- L'utente chiede "trova candidati" o "cerca [posto]" → chiama search_places PRIMA, poi add_candidate per ogni risultato rilevante, poi scrivi il messaggio di riepilogo.
- L'utente chiede "aggiungi [nome specifico]" → chiama search_places con quel nome specifico, prendi il primo risultato, chiama add_candidate, poi scrivi "Ho aggiunto [nome]".
- L'utente chiede informazioni o opinioni (es. "quale visitare per primo?") → solo testo, niente tools.

ESEMPI DI COMPORTAMENTO:

❌ SBAGLIATO:
"Cerco subito l'Oasi del Gusto per trovare i dettagli precisi da salvare."
(Solo testo, nessun tool chiamato. NON FARE COSÌ.)

✅ CORRETTO:
[chiama search_places({ query: "Oasi del Gusto", location_bias: "Falerone FM" })]
[chiama add_candidate({ requirement_id: "...", name: "Oasi del Gusto", lat: 43.x, lng: 13.y, notes: "...", photo_names: [...] })]
"Ho aggiunto Oasi del Gusto ai candidati di Ristorante - Forno."

❌ SBAGLIATO:
"Ora salvo i 3 candidati più rilevanti."
(Promette senza fare. NON FARE COSÌ.)

✅ CORRETTO:
[chiama add_candidate per il candidato 1]
[chiama add_candidate per il candidato 2]
[chiama add_candidate per il candidato 3]
"Ho aggiunto 3 candidati: Nome 1, Nome 2, Nome 3."

REGOLE FERREE:
- Per ogni add_candidate inoltra il 'requirement_id' della LOCATION SELEZIONATA (vedilo nel system context come "requirement_id: ...").
- Inoltra SEMPRE 'photo_names' (i 'name' da photos[] del risultato search_places, max 3).
- Aggiungi 2-3 candidati per ricerca quando l'utente chiede "trova candidati"; aggiungi SOLO quello richiesto quando l'utente specifica un nome.`;
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
  page: PageContext["page"],
  activeSceneId: string | null,
): string => {
  if (page !== "shooting-plan") return "";
  const sceneHint = activeSceneId
    ? `\nScena attiva (selezionata dall'utente): ${activeSceneId}. Usala come default per scene_id nei tool quando l'utente non specifica una scena diversa.`
    : "\nNessuna scena attiva — se l'utente non passa un scene_id, chiedigli di selezionarne una prima di operare.";
  return `\n\nRUOLO: in questa pagina sei un DIRETTORE DELLA FOTOGRAFIA. Quando l'utente ti chiede di costruire o salvare un piano, USA I TOOLS per farlo davvero — non descrivere soltanto.

TOOLS DISPONIBILI SUL PIANO INQUADRATURE:
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

const buildBudgetToolsGuidance = (page: PageContext["page"]): string => {
  if (page !== "budget") return "";
  return `\n\nRUOLO: in questa pagina sei un LINE PRODUCER esperto del cinema italiano. Quando l'utente ti chiede di aggiustare il budget, USA I TOOLS per farlo direttamente — non limitarti a descrivere come si potrebbe fare. Conferma SEMPRE in italiano l'azione eseguita nel messaggio finale ('Ho aggiornato…', 'Ho aggiunto…', 'Ho ridistribuito…').

TOOLS DISPONIBILI SUL BUDGET:
- update_budget_line(line_id, field, value): aggiorna rate, quantity, actual o notes di una riga. Usa gli id "id:..." che vedi nel BUDGET COMPLETO.
- add_budget_line(top_sheet, description, rate, quantity?, linked_category?): aggiunge una nuova voce di costo a un top sheet esistente.
- redistribute_topsheet(from_top_sheet, to_top_sheet, amount): sposta fondi tra top sheet riducendo la riga piu grande del primo e creando/incrementando una riga "Contingenza riallocata da X" nel secondo. Se l'amount supera la riga piu grande, il tool ritorna errore e proponi un piano multi-step.
- analyze_variance(): report deterministico delle righe piu sopra/sotto budget e dei top sheet con residuo negativo. Usalo prima di proporre tagli.
- mark_line_actual(line_id, actual_amount): registra una spesa effettiva (usalo quando l'utente comunica un consuntivo).

Linee guida:
- Prima di tagliare/redistribuire grosse cifre, chiama analyze_variance() per capire dove c'e davvero margine.
- Non toccare cast/troupe a livello di risorsa: opera solo su righe budget_lines.
- Quando ridistribuisci, spiega in 1-2 frasi il razionale ("Sposto €X dalla post-produzione alla contingenza perche…").`;
};

const ROLE_TEXT = `Sei Cesare, l'assistente AI di Oh Writers, ispirato a Cesare Zavattini.
Non sei un chatbot generico. Conosci l'intera produzione del film su cui stai lavorando.

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
  return `GUIDA AGLI STRUMENTI per la pagina "${page}":${buildLocationsToolsGuidance(
    page,
  )}${documentToolsGuidance}${buildBreakdownToolsGuidance(
    page,
  )}${buildScheduleToolsGuidance(
    page,
    activeShootingDayNumber,
  )}${buildBudgetToolsGuidance(page)}${buildShootingPlanToolsGuidance(
    page,
    activeSceneId,
  )}${LAZY_READ_GUIDANCE}`;
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

const buildSystemPrompt = (
  ctx: CesareContext,
  page: PageContext["page"],
  activeShootingDayNumber: number | null = null,
  activeSceneId: string | null = null,
): SystemPromptBlock[] => [
  { type: "text", text: ROLE_TEXT, cache_control: { type: "ephemeral" } },
  {
    type: "text",
    text: buildProductionContextBlock(ctx),
    cache_control: { type: "ephemeral" },
  },
  {
    type: "text",
    text: buildToolGuidanceBlock(
      ctx,
      page,
      activeShootingDayNumber,
      activeSceneId,
    ),
    cache_control: { type: "ephemeral" },
  },
  {
    type: "text",
    text: buildDynamicStateBlock(ctx, page, activeShootingDayNumber),
  },
];

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

// ─── Anthropic streaming call ─────────────────────────────────────────────────

const callCesare = (
  systemPrompt: SystemPromptBlock[],
  conversationHistory: ConversationMessage[],
  message: string,
  model: string,
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
        model,
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
  // MOCK_AI escape hatch: return a scripted client so the tool loop runs end-to-end
  // (including the real tool executors against the test DB) without any HTTP call.
  if (process.env["MOCK_AI"] === "true") {
    return createMockAnthropicClient() as unknown as {
      messages: {
        create(args: Record<string, unknown>): Promise<{
          content: unknown[];
          stop_reason?: string | null;
        }>;
      };
    };
  }
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
  systemPrompt: SystemPromptBlock[],
  conversationHistory: ConversationMessage[],
  message: string,
  db: Db,
  projectId: string,
  requirementId: string | null | undefined,
  model: string,
): ResultAsync<string, CesareError> =>
  ResultAsync.fromPromise(
    loadAnthropicNonStreaming(),
    (e) =>
      new CesareError(
        `Failed to load Anthropic client: ${e instanceof Error ? e.message : String(e)}`,
      ),
  ).andThen((client) => {
    const messages = [
      ...conversationHistory.map((m) => ({ role: m.role, content: m.content })),
      { role: "user" as const, content: message },
    ];
    return runToolLoop(
      client,
      systemPrompt,
      messages,
      db,
      projectId,
      model,
      requirementId ?? null,
    );
  });

const callCesareWithDocumentTools = (
  systemPrompt: SystemPromptBlock[],
  conversationHistory: ConversationMessage[],
  message: string,
  db: Db,
  projectId: string,
  docContext: DocumentContext,
  model: string,
  userIdFallback: string | null,
): ResultAsync<string, CesareError> =>
  ResultAsync.fromPromise(
    loadAnthropicNonStreaming(),
    (e) =>
      new CesareError(
        `Failed to load Anthropic client: ${e instanceof Error ? e.message : String(e)}`,
      ),
  ).andThen((client) => {
    const messages = [
      ...conversationHistory.map((m) => ({ role: m.role, content: m.content })),
      { role: "user" as const, content: message },
    ];
    return runDocumentToolLoop(
      client,
      systemPrompt,
      messages,
      db,
      projectId,
      model,
      docContext,
      userIdFallback,
    );
  });

const callCesareWithBreakdownTools = (
  systemPrompt: SystemPromptBlock[],
  conversationHistory: ConversationMessage[],
  message: string,
  db: Db,
  projectId: string,
  model: string,
): ResultAsync<string, CesareError> =>
  ResultAsync.fromPromise(
    loadAnthropicNonStreaming(),
    (e) =>
      new CesareError(
        `Failed to load Anthropic client: ${e instanceof Error ? e.message : String(e)}`,
      ),
  ).andThen((client) => {
    const messages = [
      ...conversationHistory.map((m) => ({ role: m.role, content: m.content })),
      { role: "user" as const, content: message },
    ];
    return runBreakdownToolLoop(
      client,
      systemPrompt,
      messages,
      db,
      projectId,
      model,
    );
  });

const callCesareWithScheduleTools = (
  systemPrompt: SystemPromptBlock[],
  conversationHistory: ConversationMessage[],
  message: string,
  db: Db,
  projectId: string,
  activeDayNumber: number | null,
  model: string,
): ResultAsync<string, CesareError> =>
  ResultAsync.fromPromise(
    loadAnthropicNonStreaming(),
    (e) =>
      new CesareError(
        `Failed to load Anthropic client: ${e instanceof Error ? e.message : String(e)}`,
      ),
  ).andThen((client) => {
    const messages = [
      ...conversationHistory.map((m) => ({ role: m.role, content: m.content })),
      { role: "user" as const, content: message },
    ];
    const scheduleContext: ScheduleToolContext = {
      projectId,
      activeDayNumber,
    };
    return runScheduleToolLoop(
      client,
      systemPrompt,
      messages,
      db,
      projectId,
      model,
      scheduleContext,
    );
  });

const callCesareWithShootingPlanTools = (
  systemPrompt: SystemPromptBlock[],
  conversationHistory: ConversationMessage[],
  message: string,
  db: Db,
  projectId: string,
  activeSceneId: string | null,
  model: string,
): ResultAsync<string, CesareError> =>
  ResultAsync.fromPromise(
    loadAnthropicNonStreaming(),
    (e) =>
      new CesareError(
        `Failed to load Anthropic client: ${e instanceof Error ? e.message : String(e)}`,
      ),
  ).andThen((client) => {
    const messages = [
      ...conversationHistory.map((m) => ({ role: m.role, content: m.content })),
      { role: "user" as const, content: message },
    ];
    const shootingPlanContext: ShootingPlanToolContext = {
      projectId,
      activeSceneId,
    };
    return runShootingPlanToolLoop(
      client,
      systemPrompt,
      messages,
      db,
      projectId,
      model,
      shootingPlanContext,
    );
  });

const callCesareWithBudgetTools = (
  systemPrompt: SystemPromptBlock[],
  conversationHistory: ConversationMessage[],
  message: string,
  db: Db,
  projectId: string,
  model: string,
): ResultAsync<string, CesareError> =>
  ResultAsync.fromPromise(
    loadAnthropicNonStreaming(),
    (e) =>
      new CesareError(
        `Failed to load Anthropic client: ${e instanceof Error ? e.message : String(e)}`,
      ),
  ).andThen((client) => {
    const messages = [
      ...conversationHistory.map((m) => ({ role: m.role, content: m.content })),
      { role: "user" as const, content: message },
    ];
    return runBudgetToolLoop(
      client,
      systemPrompt,
      messages,
      db,
      projectId,
      model,
    );
  });

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
  "soggetto",
  "synopsis",
  "outline",
  "treatment",
]);

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
    console.warn(
      `[cesare] tier=${tier} model=${model} page=${data.pageContext.page} convLen=${data.conversationHistory.length} msg="${data.message.slice(0, 60)}"`,
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
      if (data.pageContext.page === "locations") {
        return callCesareWithTools(
          systemPrompt,
          data.conversationHistory,
          data.message,
          db,
          data.projectId,
          data.pageContext.requirementId,
          model,
        );
      }
      if (data.pageContext.page === "breakdown") {
        return callCesareWithBreakdownTools(
          systemPrompt,
          data.conversationHistory,
          data.message,
          db,
          data.projectId,
          model,
        );
      }
      if (data.pageContext.page === "schedule") {
        return callCesareWithScheduleTools(
          systemPrompt,
          data.conversationHistory,
          data.message,
          db,
          data.projectId,
          data.pageContext.shootingDayNumber ?? null,
          model,
        );
      }
      if (data.pageContext.page === "budget") {
        return callCesareWithBudgetTools(
          systemPrompt,
          data.conversationHistory,
          data.message,
          db,
          data.projectId,
          model,
        );
      }
      if (data.pageContext.page === "shooting-plan") {
        return callCesareWithShootingPlanTools(
          systemPrompt,
          data.conversationHistory,
          data.message,
          db,
          data.projectId,
          activeSceneIdForPrompt,
          model,
        );
      }
      if (isDocumentPage(data.pageContext.page) && ctx.activeDocument) {
        const docContext: DocumentContext = {
          documentId: ctx.activeDocument.id,
          documentType: ctx.activeDocument.type,
          content: ctx.activeDocument.content,
        };
        return callCesareWithDocumentTools(
          systemPrompt,
          data.conversationHistory,
          data.message,
          db,
          data.projectId,
          docContext,
          model,
          access.user.id,
        );
      }
      return callCesare(
        systemPrompt,
        data.conversationHistory,
        data.message,
        model,
      );
    },
  );
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

// Test-only mock-context setter lives in the API route
// `/api/test/mock-context` so it can be hit from Playwright without going
// through TanStack's server-fn invoke protocol. See:
// apps/web/app/routes/api/test/mock-context.ts
