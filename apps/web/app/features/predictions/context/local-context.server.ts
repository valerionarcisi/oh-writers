// Lean context loader for Spec 39 — loads only the data declared by the
// active skills' requiredData. The full assembleContext in cesare.server.ts
// is kept intact; buildLocalContext is the new parallel path.

import { ResultAsync } from "neverthrow";
import { and, count, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import {
  breakdownElements,
  breakdownOccurrences,
  budgetLines,
  budgets,
  documentVersions,
  documents,
  locationCandidates,
  locationRequirements,
  locationRequirementScenes,
  projects,
  scenes,
  schedules,
  screenplays,
  shootingDays,
  shotPlanScenarios,
  shotPlans,
  shots,
  strips,
} from "@oh-writers/db/schema";
import type {
  ActiveDocumentRow,
  LocalContext,
  SceneBodyRow,
  SceneMetaRow,
  SceneSummaryRow,
} from "@oh-writers/domain";
import { SceneSummarySchema } from "@oh-writers/domain";
import { DbError } from "@oh-writers/utils";
import type { Db } from "~/server/db";
import type { DataRequirement, PageType, Skill } from "../skills/types";

// ─── Page context (local subset of CesareInput.pageContext) ──────────────────
// This mirrors the relevant fields of the inferred PageContextSchema type in
// cesare.server.ts without creating a cross-dependency on that file.

export interface LocalPageContext {
  readonly sceneId: string | null;
  readonly sceneNumber: number | null;
  readonly requirementId?: string | null;
  readonly documentId?: string | null;
  readonly shootingDayId?: string | null;
  readonly shootingDayNumber?: number | null;
}

// ─── Internal row shapes used only inside this file ──────────────────────────

interface BreakdownElementRow {
  readonly category: string;
  readonly name: string;
}

interface LocationCandidateRow {
  readonly id: string;
  readonly name: string;
  readonly address: string | null;
  readonly status: string;
}

interface LinkedSceneRow {
  readonly id: string;
  readonly number: number;
  readonly heading: string;
  readonly intExt: string;
  readonly timeOfDay: string | null;
  readonly characterNames: string[];
  readonly notes: string | null;
  readonly breakdownElements: string[];
}

interface LocationRequirementRow {
  readonly id: string;
  readonly name: string;
  readonly intExt: string | null;
  readonly timeOfDay: string[];
  readonly status: string;
  readonly candidates: LocationCandidateRow[];
  readonly linkedScenes: LinkedSceneRow[];
}

interface BudgetLineDetail {
  readonly id: string;
  readonly topSheet: string;
  readonly name: string;
  readonly category: string | null;
  readonly rate: number | null;
  readonly quantity: number | null;
  readonly estimated: number;
  readonly actual: number | null;
  readonly residual: number;
}

interface BudgetSummary {
  readonly totalAllocated: number;
  readonly residualByTopSheet: Record<string, number>;
  readonly lines: BudgetLineDetail[];
  readonly status: string | null;
}

interface ScheduleSummary {
  readonly totalShootingDays: number;
  readonly lockedDays: number;
}

interface ShotSummary {
  readonly shotSize: string;
  readonly cameraMovement: string;
  readonly durationMin: number | null;
  readonly notes: string | null;
}

interface ShotPlanSummary {
  readonly scenarioId: string;
  readonly name: string;
  readonly isActive: boolean;
  readonly shotCount: number;
  readonly shots: ShotSummary[];
}

interface ShootingDayRow {
  readonly id: string;
  readonly dayNumber: number;
  readonly date: string | null;
  readonly dayType: string;
  readonly notes: string | null;
}

// ─── LocalContext extended for concrete internal types ───────────────────────
// The domain LocalContext uses `unknown | null` for currentRequirement and
// activeShootingDay to avoid coupling the domain package to DB types.
// Internally we work with the concrete shapes and assign via `as LocalContext`.

interface LocalContextConcrete extends Omit<
  LocalContext,
  "currentRequirement" | "activeShootingDay"
> {
  readonly currentRequirement: LocationRequirementRow | null;
  readonly activeShootingDay: ShootingDayRow | null;
  // Extra fields used by the system prompt formatters (not in domain LocalContext)
  readonly breakdownElements: BreakdownElementRow[];
  readonly budget: BudgetSummary | null;
  readonly schedule: ScheduleSummary | null;
  readonly locations: LocationRequirementRow[];
  readonly projectDocuments: ProjectDocumentRow[];
  readonly shotPlans: ShotPlanSummary[];
}

// ─── Summary window strategy ──────────────────────────────────────────────────
// Each page type declares which scenes' summaries are relevant.
// "none" means no summaries needed (e.g. budget reasons at category level).

type SummaryWindowStrategy =
  | "requirement-linked" // scenes linked to the open requirement
  | "numeric-window-3" // open scene ± 3
  | "numeric-window-5" // open scene ± 5
  | "shooting-day" // scenes in the open shooting day
  | "current-only" // only the open scene
  | "act-aggregate" // all scenes (for document pages — act grouping in formatter)
  | "none";

const SUMMARY_WINDOW: Record<PageType, SummaryWindowStrategy> = {
  locations: "requirement-linked",
  breakdown: "numeric-window-3",
  budget: "none",
  schedule: "shooting-day",
  "shooting-plan": "current-only",
  screenplay: "numeric-window-5",
  soggetto: "act-aggregate",
  synopsis: "act-aggregate",
  outline: "act-aggregate",
  treatment: "act-aggregate",
};

// Pure function — no DB, no side effects. Returns the scene IDs to load summaries for.
export const computeSummaryWindow = (
  pageType: PageType,
  pageContext: LocalPageContext,
  sceneMeta: SceneMetaRow[],
  linkedSceneIds: string[],
): string[] => {
  const strategy = SUMMARY_WINDOW[pageType];

  switch (strategy) {
    case "none":
      return [];

    case "current-only": {
      const id = pageContext.sceneId ?? null;
      return id ? [id] : [];
    }

    case "requirement-linked":
      return linkedSceneIds;

    case "act-aggregate":
      return sceneMeta.map((s) => s.id);

    case "numeric-window-3":
    case "numeric-window-5": {
      const windowSize = strategy === "numeric-window-3" ? 3 : 5;
      const center = pageContext.sceneNumber;
      if (center === null)
        return sceneMeta.slice(0, windowSize * 2 + 1).map((s) => s.id);
      const min = center - windowSize;
      const max = center + windowSize;
      return sceneMeta
        .filter((s) => s.number >= min && s.number <= max)
        .map((s) => s.id);
    }

    case "shooting-day":
      // sceneIds for the shooting day are resolved by the caller after loading
      // the strip board — we return a sentinel that the caller replaces.
      // When no shootingDayId is available, fall back to current scene ± 3.
      if (!pageContext.shootingDayId) {
        const center = pageContext.sceneNumber;
        if (center === null) return [];
        return sceneMeta
          .filter((s) => s.number >= center - 3 && s.number <= center + 3)
          .map((s) => s.id);
      }
      // Return empty here — shooting-day scene IDs come from the strips query
      // and are resolved in buildLocalContext after loadStripSceneIds runs.
      return [];
  }
};

interface ProjectDocumentRow {
  readonly id: string;
  readonly type: string;
  readonly content: string;
}

// ─── Always-loaded loaders ───────────────────────────────────────────────────
// These run unconditionally — they are lean (metadata-only or small data).

const loadScenesMetadata = (
  db: Db,
  projectId: string,
): Promise<{
  title: string;
  scenes: SceneMetaRow[];
  screenplayId: string | null;
  characters: string[];
}> =>
  (async () => {
    const [screenplay] = await db
      .select({ id: screenplays.id, title: screenplays.title })
      .from(screenplays)
      .where(eq(screenplays.projectId, projectId))
      .limit(1);

    if (!screenplay) {
      return {
        title: "Senza titolo",
        scenes: [],
        screenplayId: null,
        characters: [],
      };
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
      screenplayId: screenplay.id,
      characters: uniqueChars,
    };
  })();

const loadSceneWindow = (
  db: Db,
  screenplayId: string | null,
  centerSceneNumber: number | null,
  linkedSceneIds: string[],
  windowSize = 2,
): Promise<SceneBodyRow[]> =>
  (async (): Promise<SceneBodyRow[]> => {
    if (!screenplayId) return [];

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
      return rows.map((r) => ({ ...r, body: r.body ?? null, isCurrent: true }));
    }

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
      return rows.map((r) => ({
        ...r,
        body: r.body ?? null,
        isCurrent: false,
      }));
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
      body: r.body ?? null,
      isCurrent: r.number === centerSceneNumber,
    }));
  })();

const loadProjectTitle = (db: Db, projectId: string): Promise<string> =>
  db
    .select({ title: projects.title })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1)
    .then((rows) => rows[0]?.title ?? "Senza titolo");

// ─── Conditional loaders ─────────────────────────────────────────────────────
// Loaded only when the active skills declare the corresponding DataRequirement.

const loadBudgetSummary = (
  db: Db,
  projectId: string,
): Promise<BudgetSummary | null> =>
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
  })();

const loadScheduleSummary = (
  db: Db,
  projectId: string,
): Promise<ScheduleSummary | null> =>
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

    const totalShootingDays = totals?.total ?? 0;

    return {
      totalShootingDays: Number(totalShootingDays),
      lockedDays: 0,
    };
  })();

const loadLocationsContext = (
  db: Db,
  projectId: string,
): Promise<LocationRequirementRow[]> =>
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
            .innerJoin(scenes, eq(locationRequirementScenes.sceneId, scenes.id))
            .innerJoin(
              locationRequirements,
              eq(
                locationRequirementScenes.requirementId,
                locationRequirements.id,
              ),
            )
            .where(eq(locationRequirements.projectId, projectId));

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
  })();

const loadBreakdownElements = (
  db: Db,
  projectId: string,
  sceneId: string | null,
): Promise<BreakdownElementRow[]> =>
  (async () => {
    if (!sceneId) {
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
  })();

const loadProjectDocuments = (
  db: Db,
  projectId: string,
): Promise<ProjectDocumentRow[]> =>
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
      type: d.type,
      content: d.currentVersionId
        ? (versionContentById.get(d.currentVersionId) ?? d.content)
        : d.content,
    }));
  })();

const loadShotPlans = (
  db: Db,
  sceneId: string | null,
): Promise<ShotPlanSummary[]> =>
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
  })();

// Loads scene IDs assigned to a specific shooting day via the strips table.
// Used to compute the summary window for schedule page.
const loadStripSceneIds = (db: Db, shootingDayId: string): Promise<string[]> =>
  db
    .select({ sceneId: strips.sceneId })
    .from(strips)
    .where(eq(strips.shootingDayId, shootingDayId))
    .then((rows) => rows.map((r) => r.sceneId));

// Loads scene_summary rows for the given scene IDs.
// Skips scenes where scene_summary is NULL (not yet generated by Spec 38).
const loadSceneSummaries = (
  db: Db,
  sceneIds: string[],
): Promise<SceneSummaryRow[]> =>
  (async (): Promise<SceneSummaryRow[]> => {
    if (sceneIds.length === 0) return [];

    const rows = await db
      .select({
        id: scenes.id,
        number: scenes.number,
        heading: scenes.heading,
        sceneSummary: scenes.sceneSummary,
      })
      .from(scenes)
      .where(inArray(scenes.id, sceneIds));

    const result: SceneSummaryRow[] = [];
    for (const row of rows) {
      if (!row.sceneSummary) continue;
      const parsed = SceneSummarySchema.safeParse(row.sceneSummary);
      if (!parsed.success) continue;
      result.push({
        sceneId: row.id,
        sceneNumber: row.number,
        sceneHeading: row.heading,
        settingDescription: parsed.data.settingDescription,
        timeOfDay: parsed.data.timeOfDay,
        presentCharacters: parsed.data.presentCharacters,
        keyActions: parsed.data.keyActions,
        productionNotes: parsed.data.productionNotes,
      });
    }

    return result.sort((a, b) => a.sceneNumber - b.sceneNumber);
  })();

// Loads the active shooting day by its UUID from pageContext.shootingDayId.
// Only loaded when skills declare "schedule" in requiredData.
const loadActiveShootingDay = (
  db: Db,
  shootingDayId: string | null | undefined,
): Promise<ShootingDayRow | null> =>
  (async (): Promise<ShootingDayRow | null> => {
    if (!shootingDayId) return null;

    const [day] = await db
      .select({
        id: shootingDays.id,
        dayNumber: shootingDays.dayNumber,
        date: shootingDays.date,
        dayType: shootingDays.dayType,
        notes: shootingDays.notes,
      })
      .from(shootingDays)
      .where(eq(shootingDays.id, shootingDayId))
      .limit(1);

    return day ?? null;
  })();

// ─── buildLocalContext ────────────────────────────────────────────────────────
// Lean alternative to assembleContext. Loads only the data declared by the
// active skills' requiredData, keeping the DB round-trips proportional to
// the actual page and intent rather than always fetching everything.

export const buildLocalContext = (
  db: Db,
  projectId: string,
  pageContext: LocalPageContext,
  skills: ReadonlyArray<Skill>,
  pageType: PageType = "screenplay",
): ResultAsync<LocalContextConcrete, DbError> => {
  const needed = new Set<DataRequirement>(
    skills.flatMap((s) => [...s.requiredData]),
  );

  return ResultAsync.fromPromise(
    (async (): Promise<LocalContextConcrete> => {
      // Phase 1: always load screenplay metadata (small: ids + headings only).
      // All other loaders that depend on screenplayId run in phase 2.
      const screenplayData = await loadScenesMetadata(db, projectId);
      const { scenes: sceneMeta, screenplayId, characters } = screenplayData;

      // Resolve currentScene from the page context
      const effectiveSceneId =
        pageContext.sceneId && pageContext.sceneId.length > 10
          ? pageContext.sceneId
          : null;

      const currentScene: SceneMetaRow | null = effectiveSceneId
        ? (sceneMeta.find((s) => s.id === effectiveSceneId) ?? null)
        : pageContext.sceneNumber !== null
          ? (sceneMeta.find((s) => s.number === pageContext.sceneNumber) ??
            null)
          : null;

      // Determine linked scene IDs for the scene window (locations page uses
      // requirement-linked scenes instead of the numeric window).
      // We pre-compute this here so the scene window loader can run in phase 2.
      // For non-locations pages, linkedSceneIds is empty — the window loader
      // falls back to the numeric window around centerSceneNumber.
      const requirementIdForWindow = pageContext.requirementId ?? null;

      // Phase 2: run always-needed lean loaders and conditional loaders in
      // parallel. Each conditional loader resolves to a null / empty default
      // when its DataRequirement is not in the needed set.
      const [
        projectTitle,
        projectDocuments,
        budget,
        schedule,
        activeShootingDay,
        locations,
        breakdownElementRows,
        shotPlanSummaries,
      ] = await Promise.all([
        loadProjectTitle(db, projectId),
        needed.has("documents")
          ? loadProjectDocuments(db, projectId)
          : Promise.resolve([] as ProjectDocumentRow[]),
        needed.has("budget")
          ? loadBudgetSummary(db, projectId)
          : Promise.resolve(null),
        needed.has("schedule")
          ? loadScheduleSummary(db, projectId)
          : Promise.resolve(null),
        needed.has("schedule")
          ? loadActiveShootingDay(db, pageContext.shootingDayId)
          : Promise.resolve(null),
        needed.has("locations")
          ? loadLocationsContext(db, projectId)
          : Promise.resolve([] as LocationRequirementRow[]),
        needed.has("breakdown")
          ? loadBreakdownElements(db, projectId, effectiveSceneId)
          : Promise.resolve([] as BreakdownElementRow[]),
        needed.has("shot-plans")
          ? loadShotPlans(db, effectiveSceneId)
          : Promise.resolve([] as ShotPlanSummary[]),
      ]);

      // Resolve currentRequirement from the loaded locations list
      let currentRequirement: LocationRequirementRow | null =
        requirementIdForWindow
          ? (locations.find((r) => r.id === requirementIdForWindow) ?? null)
          : null;

      // Fallback: match requirement name against scene headings when no
      // explicit scene links are registered (same logic as assembleContext).
      let linkedSceneIds: string[] =
        currentRequirement?.linkedScenes.map((s) => s.id) ?? [];

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
          const matched = sceneMeta.filter((sc) => {
            const h = norm(sc.heading);
            return reqTokens.every((t) => h.includes(t));
          });
          linkedSceneIds = matched.map((sc) => sc.id);
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

      // Phase 3: scene window + scene summaries — depend on screenplayId +
      // linkedSceneIds from phase 2. All three loaders run in parallel.
      const shootingDayId = pageContext.shootingDayId ?? null;

      const [sceneWindow, stripSceneIds] = await Promise.all([
        loadSceneWindow(
          db,
          screenplayId,
          currentScene?.number ?? pageContext.sceneNumber,
          linkedSceneIds,
        ),
        // For schedule page: load strip scene IDs to build the summary window.
        // Runs in parallel with sceneWindow — no serial waterfall.
        pageType === "schedule" && shootingDayId
          ? loadStripSceneIds(db, shootingDayId)
          : Promise.resolve([] as string[]),
      ]);

      // Resolve summary window.
      // Schedule page: prefer strip scene IDs when the day has scenes; fall back
      // to numeric ±3 around sceneNumber when the day is newly created (no strips).
      // All other pages: use computeSummaryWindow (pure function, no DB).
      const summarySceneIds: string[] = (() => {
        if (pageType === "schedule") {
          if (stripSceneIds.length > 0) return stripSceneIds;
          // Empty shooting day: fall back to sceneNumber window so Cesare still
          // gets narrative context even when no strips are assigned yet.
          const center = pageContext.sceneNumber;
          if (center === null) return [];
          return sceneMeta
            .filter((s) => s.number >= center - 3 && s.number <= center + 3)
            .map((s) => s.id);
        }
        return computeSummaryWindow(
          pageType,
          pageContext,
          sceneMeta,
          linkedSceneIds,
        );
      })();

      const sceneSummaries = await (needed.has("scene-summaries") &&
      summarySceneIds.length > 0
        ? loadSceneSummaries(db, summarySceneIds)
        : Promise.resolve([] as SceneSummaryRow[]));

      // Resolve activeDocument from the documents list
      const activeDocId = pageContext.documentId ?? null;
      const activeDocument: ActiveDocumentRow | null = activeDocId
        ? (() => {
            const found = projectDocuments.find((d) => d.id === activeDocId);
            return found
              ? ({ ...found, isActive: true } as ActiveDocumentRow)
              : null;
          })()
        : null;

      return {
        projectTitle,
        scenes: sceneMeta,
        currentScene,
        sceneWindow,
        sceneSummaries,
        characters,
        activeDocument,
        currentRequirement,
        activeShootingDay,
        breakdownElements: breakdownElementRows,
        budget,
        schedule,
        locations,
        projectDocuments,
        shotPlans: shotPlanSummaries,
      };
    })(),
    (e) => new DbError("buildLocalContext", e),
  );
};
