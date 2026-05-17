import { createServerFn } from "@tanstack/start";
import { ResultAsync } from "neverthrow";
import { eq, sql } from "drizzle-orm";
import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import {
  DocumentTypes,
  type DocumentType,
  TeamRoles,
  type TeamRole,
} from "@oh-writers/domain";
import { toShape } from "@oh-writers/utils";
import type { ResultShape } from "@oh-writers/utils";
import {
  projects,
  documents,
  screenplays,
  scenes,
  characters,
  budgets,
  budgetLines,
  schedules,
  shootingDays,
  strips,
  breakdownSceneState,
  teamMembers,
  users,
  locationRequirements,
  type Project,
} from "@oh-writers/db/schema";
import type { Db } from "~/server/db";
import { withProjectAccess } from "~/server/pipeline";
import {
  ProjectNotFoundError,
  ForbiddenError,
  DbError,
} from "../projects.errors";

// ─── Types ────────────────────────────────────────────────────────────────────
//
// `ProjectOverview` is the single aggregate the overview route consumes. The
// shape is intentionally flat at the top level: each sub-summary nests its own
// fields so the client can pick which sections it renders without re-shaping.

export interface DocumentSummary {
  readonly id: string;
  readonly type: DocumentType;
  readonly title: string;
  readonly preview: string;
  readonly wordCount: number;
  readonly hasContent: boolean;
  readonly updatedAt: string;
}

export interface ScreenplaySummary {
  readonly id: string;
  readonly title: string;
  readonly pageCount: number;
  readonly sceneCount: number;
  readonly characterCount: number;
  readonly locationCount: number;
  readonly draftColor: string | null;
  readonly draftLabel: string | null;
  readonly versionLabel: string | null;
  readonly updatedAt: string;
}

export interface BreakdownSummary {
  readonly scenesBrokenDown: number;
  readonly totalScenes: number;
  readonly hasAny: boolean;
}

export interface BudgetSummary {
  readonly totalEUR: number;
  readonly lineCount: number;
  readonly status: "draft" | "estimated" | "locked";
  readonly hasAny: boolean;
}

export interface ScheduleSummary {
  readonly shootingDayCount: number;
  readonly scheduledScenes: number;
  readonly totalScenes: number;
  readonly totalHours: number;
  readonly hasAny: boolean;
}

export interface LocationsSummary {
  readonly totalRequirements: number;
  readonly confirmedCount: number;
  readonly hasAny: boolean;
}

export interface KpiSummary {
  readonly pageCount: number;
  readonly sceneCount: number;
  readonly characterCount: number;
  readonly locationCount: number;
  readonly estimatedMinutes: number;
  readonly lastEditedAt: string;
  readonly idleDays: number;
}

export type ActivityKind =
  | "document_edit"
  | "screenplay_save"
  | "breakdown_change"
  | "ai_suggestion"
  | "project_created"
  | "member_added";

export interface ActivityItem {
  readonly id: string;
  readonly kind: ActivityKind;
  readonly summary: string;
  readonly actorName: string | null;
  readonly actorKind: "user" | "ai";
  readonly at: string;
}

export interface CollaboratorEntry {
  readonly id: string;
  readonly name: string;
  readonly role: TeamRole | "ai" | "owner";
  readonly avatarSeed: string;
}

export interface NextStep {
  readonly suggestion: string;
  readonly actionLabel: string;
  readonly actionHref: string;
}

export interface ProjectOverview {
  readonly project: Project;
  readonly kpi: KpiSummary;
  readonly documents: DocumentSummary[];
  readonly screenplay: ScreenplaySummary | null;
  readonly breakdown: BreakdownSummary;
  readonly budget: BudgetSummary;
  readonly schedule: ScheduleSummary;
  readonly locations: LocationsSummary;
  readonly activity: ActivityItem[];
  readonly collaborators: CollaboratorEntry[];
  readonly nextStep: NextStep | null;
}

export type ProjectOverviewError =
  | ProjectNotFoundError
  | ForbiddenError
  | DbError;

// ─── Pure helpers ─────────────────────────────────────────────────────────────

const PREVIEW_LIMIT = 220;

export const toPreview = (raw: string): string => {
  const trimmed = raw.trim();
  if (trimmed.length <= PREVIEW_LIMIT) return trimmed;
  return `${trimmed.slice(0, PREVIEW_LIMIT - 1)}…`;
};

export const countWords = (raw: string): number => {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return 0;
  return trimmed.split(/\s+/u).length;
};

export const daysSince = (iso: string, now: Date = new Date()): number => {
  const then = new Date(iso).getTime();
  const ms = now.getTime() - then;
  if (ms <= 0) return 0;
  return Math.floor(ms / 86_400_000);
};

// One screenplay page ≈ one minute of screen time is the industry-standard
// heuristic; rounded down because partial pages don't add a full minute.
export const estimateMinutes = (pageCount: number): number =>
  Math.max(0, Math.floor(pageCount));

// Mock generator for the Cesare next-step. The suggestion is derived from
// real signals (page count, breakdown state, idle time) so the heuristic is
// stable; the surface stays mock until Spec 11 wires the LLM in.
export const buildNextStep = (input: {
  hasScreenplay: boolean;
  pageCount: number;
  sceneCount: number;
  breakdown: BreakdownSummary;
  budget: BudgetSummary;
  idleDays: number;
  projectId: string;
}): NextStep | null => {
  if (!input.hasScreenplay) return null;
  if (input.sceneCount > 0 && !input.breakdown.hasAny) {
    const idleNote =
      input.idleDays > 1
        ? `Lo screenplay è fermo da ${input.idleDays} giorni a pagina ${input.pageCount}.`
        : `Hai ${input.sceneCount} scene pronte.`;
    return {
      suggestion: `${idleNote} Posso fare una prima passata di spoglio così quando torni hai già un breakdown grezzo da rivedere.`,
      actionLabel: "Avvia spoglio",
      actionHref: `/projects/${input.projectId}/breakdown`,
    };
  }
  if (input.breakdown.hasAny && !input.budget.hasAny) {
    return {
      suggestion: `Hai ${input.breakdown.scenesBrokenDown} scene spogliate. Posso generare un primo preventivo a partire dagli elementi.`,
      actionLabel: "Genera budget",
      actionHref: `/projects/${input.projectId}/budget`,
    };
  }
  return null;
};

// ─── DB helpers ───────────────────────────────────────────────────────────────

const loadDocuments = (
  db: Db,
  projectId: string,
): ResultAsync<DocumentSummary[], DbError> =>
  ResultAsync.fromPromise(
    db
      .select({
        id: documents.id,
        type: documents.type,
        title: documents.title,
        content: documents.content,
        updatedAt: documents.updatedAt,
      })
      .from(documents)
      .where(eq(documents.projectId, projectId)),
    (e) => new DbError("projectOverview.documents", e),
  ).map((rows) =>
    rows
      .filter((row) => row.type !== DocumentTypes.LOGLINE)
      .map(
        (row): DocumentSummary => ({
          id: row.id,
          type: row.type as DocumentType,
          title: row.title,
          preview: toPreview(row.content),
          wordCount: countWords(row.content),
          hasContent: row.content.trim().length > 0,
          updatedAt: row.updatedAt.toISOString(),
        }),
      ),
  );

interface ScreenplayRow {
  readonly id: string;
  readonly title: string;
  readonly pageCount: number;
  readonly updatedAt: Date;
}

const loadScreenplay = (
  db: Db,
  projectId: string,
): ResultAsync<ScreenplayRow | null, DbError> =>
  ResultAsync.fromPromise(
    db
      .select({
        id: screenplays.id,
        title: screenplays.title,
        pageCount: screenplays.pageCount,
        updatedAt: screenplays.updatedAt,
      })
      .from(screenplays)
      .where(eq(screenplays.projectId, projectId))
      .then((rows) => rows[0] ?? null),
    (e) => new DbError("projectOverview.screenplay", e),
  );

interface SceneAggregateRow {
  readonly sceneCount: number;
  readonly locationCount: number;
}

const loadSceneAggregate = (
  db: Db,
  screenplayId: string | null,
): ResultAsync<SceneAggregateRow, DbError> => {
  if (!screenplayId) {
    return ResultAsync.fromSafePromise(
      Promise.resolve({ sceneCount: 0, locationCount: 0 }),
    );
  }
  return ResultAsync.fromPromise(
    db
      .select({
        sceneCount: sql<number>`count(*)::int`,
        locationCount: sql<number>`count(distinct ${scenes.location})::int`,
      })
      .from(scenes)
      .where(eq(scenes.screenplayId, screenplayId))
      .then((rows) => rows[0] ?? { sceneCount: 0, locationCount: 0 }),
    (e) => new DbError("projectOverview.scenes", e),
  );
};

const loadCharacterCount = (
  db: Db,
  screenplayId: string | null,
): ResultAsync<number, DbError> => {
  if (!screenplayId) {
    return ResultAsync.fromSafePromise(Promise.resolve(0));
  }
  return ResultAsync.fromPromise(
    db
      .select({ value: sql<number>`count(*)::int` })
      .from(characters)
      .where(eq(characters.screenplayId, screenplayId))
      .then((rows) => rows[0]?.value ?? 0),
    (e) => new DbError("projectOverview.characters", e),
  );
};

const loadBreakdown = (
  db: Db,
  screenplayId: string | null,
  totalScenes: number,
): ResultAsync<BreakdownSummary, DbError> => {
  if (!screenplayId) {
    return ResultAsync.fromSafePromise(
      Promise.resolve<BreakdownSummary>({
        scenesBrokenDown: 0,
        totalScenes,
        hasAny: false,
      }),
    );
  }
  return ResultAsync.fromPromise(
    db
      .select({ value: sql<number>`count(*)::int` })
      .from(breakdownSceneState)
      .innerJoin(scenes, eq(scenes.id, breakdownSceneState.sceneId))
      .where(eq(scenes.screenplayId, screenplayId))
      .then((rows) => rows[0]?.value ?? 0),
    (e) => new DbError("projectOverview.breakdown", e),
  ).map(
    (scenesBrokenDown): BreakdownSummary => ({
      scenesBrokenDown,
      totalScenes,
      hasAny: scenesBrokenDown > 0,
    }),
  );
};

const loadBudget = (
  db: Db,
  projectId: string,
): ResultAsync<BudgetSummary, DbError> =>
  ResultAsync.fromPromise(
    db
      .select({
        id: budgets.id,
        status: budgets.status,
      })
      .from(budgets)
      .where(eq(budgets.projectId, projectId))
      .then((rows) => rows[0] ?? null),
    (e) => new DbError("projectOverview.budget", e),
  ).andThen((budget) => {
    if (!budget) {
      return ResultAsync.fromSafePromise(
        Promise.resolve<BudgetSummary>({
          totalEUR: 0,
          lineCount: 0,
          status: "draft",
          hasAny: false,
        }),
      );
    }
    return ResultAsync.fromPromise(
      db
        .select({
          totalEUR: sql<number>`coalesce(sum(coalesce(${budgetLines.actual}::numeric, coalesce(${budgetLines.quantity}::numeric, 0) * coalesce(${budgetLines.rate}::numeric, 0))), 0)::float`,
          lineCount: sql<number>`count(*)::int`,
        })
        .from(budgetLines)
        .where(eq(budgetLines.budgetId, budget.id))
        .then(
          (rows) => rows[0] ?? { totalEUR: 0, lineCount: 0 },
        ),
      (e) => new DbError("projectOverview.budget.lines", e),
    ).map(
      (agg): BudgetSummary => ({
        totalEUR: agg.totalEUR,
        lineCount: agg.lineCount,
        status: budget.status,
        hasAny: agg.lineCount > 0,
      }),
    );
  });

const loadSchedule = (
  db: Db,
  projectId: string,
  totalScenes: number,
): ResultAsync<ScheduleSummary, DbError> =>
  ResultAsync.fromPromise(
    db
      .select({ id: schedules.id })
      .from(schedules)
      .where(eq(schedules.projectId, projectId))
      .then((rows) => rows[0] ?? null),
    (e) => new DbError("projectOverview.schedule", e),
  ).andThen((schedule) => {
    if (!schedule) {
      return ResultAsync.fromSafePromise(
        Promise.resolve<ScheduleSummary>({
          shootingDayCount: 0,
          scheduledScenes: 0,
          totalScenes,
          totalHours: 0,
          hasAny: false,
        }),
      );
    }
    const dayCountAsync: ResultAsync<number, DbError> = ResultAsync.fromPromise(
      db
        .select({ value: sql<number>`count(*)::int` })
        .from(shootingDays)
        .where(eq(shootingDays.scheduleId, schedule.id))
        .then((rows) => rows[0]?.value ?? 0),
      (e) => new DbError("projectOverview.schedule.days", e),
    );
    interface StripAgg {
      readonly scheduledScenes: number;
      readonly totalHours: number;
    }
    const stripAggAsync: ResultAsync<StripAgg, DbError> = ResultAsync.fromPromise(
      db
        .select({
          scheduledScenes: sql<number>`count(*)::int`,
          totalHours: sql<number>`coalesce(sum(${strips.estimatedHours}), 0)::float`,
        })
        .from(strips)
        .where(eq(strips.scheduleId, schedule.id))
        .then(
          (rows): StripAgg =>
            rows[0] ?? { scheduledScenes: 0, totalHours: 0 },
        ),
      (e) => new DbError("projectOverview.schedule.strips", e),
    );
    return dayCountAsync.andThen((dayCount) =>
      stripAggAsync.map(
        (stripAgg): ScheduleSummary => ({
          shootingDayCount: dayCount,
          scheduledScenes: stripAgg.scheduledScenes,
          totalScenes,
          totalHours: stripAgg.totalHours,
          hasAny: dayCount > 0,
        }),
      ),
    );
  });

const loadLocations = (
  db: Db,
  projectId: string,
): ResultAsync<LocationsSummary, DbError> =>
  ResultAsync.fromPromise(
    db
      .select({ id: locationRequirements.id, status: locationRequirements.status })
      .from(locationRequirements)
      .where(eq(locationRequirements.projectId, projectId)),
    (e) => new DbError("projectOverview.locations", e),
  ).map((rows): LocationsSummary => ({
    totalRequirements: rows.length,
    confirmedCount: rows.filter((r) => r.status === "confirmed").length,
    hasAny: rows.length > 0,
  }));

const loadCollaborators = (
  db: Db,
  project: Project,
): ResultAsync<CollaboratorEntry[], DbError> => {
  if (!project.teamId) {
    if (!project.ownerId) {
      return ResultAsync.fromSafePromise(Promise.resolve([]));
    }
    return ResultAsync.fromPromise(
      db
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(eq(users.id, project.ownerId))
        .then((rows) => rows[0] ?? null),
      (e) => new DbError("projectOverview.owner", e),
    ).map((owner): CollaboratorEntry[] =>
      owner
        ? [
            {
              id: owner.id,
              name: owner.name || owner.email,
              role: "owner",
              avatarSeed: owner.name || owner.email,
            },
          ]
        : [],
    );
  }
  return ResultAsync.fromPromise(
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: teamMembers.role,
      })
      .from(teamMembers)
      .innerJoin(users, eq(users.id, teamMembers.userId))
      .where(eq(teamMembers.teamId, project.teamId)),
    (e) => new DbError("projectOverview.members", e),
  ).map((rows) =>
    rows.map(
      (row): CollaboratorEntry => ({
        id: row.id,
        name: row.name || row.email,
        role: row.role as TeamRole,
        avatarSeed: row.name || row.email,
      }),
    ),
  );
};

// Activity feed: stub data until Spec 09 wires the event log. We synthesize
// items from the freshest signals already in the DB (last screenplay save,
// last document edit) so day-zero projects don't look empty.
const buildActivityFeed = (input: {
  documents: DocumentSummary[];
  screenplay: ScreenplayRow | null;
  project: Project;
  ownerName: string | null;
}): ActivityItem[] => {
  const items: ActivityItem[] = [];
  if (input.screenplay) {
    items.push({
      id: `act-screenplay-${input.screenplay.id}`,
      kind: "screenplay_save",
      summary: `Sceneggiatura aggiornata (${input.screenplay.pageCount} pagine).`,
      actorName: input.ownerName,
      actorKind: "user",
      at: input.screenplay.updatedAt.toISOString(),
    });
  }
  for (const doc of input.documents) {
    if (!doc.hasContent) continue;
    items.push({
      id: `act-doc-${doc.id}`,
      kind: "document_edit",
      summary: `${doc.title} aggiornato.`,
      actorName: input.ownerName,
      actorKind: "user",
      at: doc.updatedAt,
    });
  }
  items.push({
    id: `act-created-${input.project.id}`,
    kind: "project_created",
    summary: "Progetto creato.",
    actorName: input.ownerName,
    actorKind: "user",
    at: input.project.createdAt.toISOString(),
  });
  return items
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 7);
};

// ─── Aggregator ───────────────────────────────────────────────────────────────

const buildOverview = (
  db: Db,
  project: Project,
): ResultAsync<ProjectOverview, DbError> =>
  ResultAsync.combine([
    loadDocuments(db, project.id),
    loadScreenplay(db, project.id),
    loadCollaborators(db, project),
  ]).andThen(([docs, screenplayRow, collaborators]) => {
    const screenplayId = screenplayRow?.id ?? null;
    return ResultAsync.combine([
      loadSceneAggregate(db, screenplayId),
      loadCharacterCount(db, screenplayId),
    ]).andThen(([sceneAgg, characterCount]) =>
      ResultAsync.combine([
        loadBreakdown(db, screenplayId, sceneAgg.sceneCount),
        loadBudget(db, project.id),
        loadSchedule(db, project.id, sceneAgg.sceneCount),
        loadLocations(db, project.id),
      ]).map(([breakdown, budget, schedule, locations]): ProjectOverview => {
        const ownerCollab =
          collaborators.find((c) => c.role === "owner") ??
          collaborators.find(
            (c) => (c.role as string) === TeamRoles.OWNER,
          ) ??
          collaborators[0] ??
          null;
        const candidates: string[] = [project.updatedAt.toISOString()];
        if (screenplayRow) candidates.push(screenplayRow.updatedAt.toISOString());
        for (const doc of docs) candidates.push(doc.updatedAt);
        const lastEditedAt = candidates.sort((a, b) => b.localeCompare(a))[0]!;
        const pageCount = screenplayRow?.pageCount ?? 0;
        const kpi: KpiSummary = {
          pageCount,
          sceneCount: sceneAgg.sceneCount,
          characterCount,
          locationCount: sceneAgg.locationCount,
          estimatedMinutes: estimateMinutes(pageCount),
          lastEditedAt,
          idleDays: daysSince(lastEditedAt),
        };
        const screenplay: ScreenplaySummary | null = screenplayRow
          ? {
              id: screenplayRow.id,
              title: screenplayRow.title,
              pageCount: screenplayRow.pageCount,
              sceneCount: sceneAgg.sceneCount,
              characterCount,
              locationCount: sceneAgg.locationCount,
              draftColor: null,
              draftLabel: null,
              versionLabel: null,
              updatedAt: screenplayRow.updatedAt.toISOString(),
            }
          : null;
        const nextStep = buildNextStep({
          hasScreenplay: !!screenplayRow,
          pageCount,
          sceneCount: sceneAgg.sceneCount,
          breakdown,
          budget,
          idleDays: kpi.idleDays,
          projectId: project.id,
        });
        const activity = buildActivityFeed({
          documents: docs,
          screenplay: screenplayRow,
          project,
          ownerName: ownerCollab?.name ?? null,
        });
        return {
          project,
          kpi,
          documents: docs,
          screenplay,
          breakdown,
          budget,
          schedule,
          locations,
          activity,
          collaborators,
          nextStep,
        };
      }),
    );
  });

// ─── Server function ──────────────────────────────────────────────────────────

export const getProjectOverview = createServerFn({ method: "GET" })
  .validator(z.object({ projectId: z.string().uuid() }))
  .handler(
    async ({
      data,
    }): Promise<ResultShape<ProjectOverview, ProjectOverviewError>> =>
      toShape(
        await withProjectAccess(data.projectId, "view", ({ db, access }) =>
          buildOverview(db, access.project),
        ),
      ),
  );

export const projectOverviewQueryOptions = (projectId: string) =>
  queryOptions({
    queryKey: ["projects", projectId, "overview"] as const,
    queryFn: () => getProjectOverview({ data: { projectId } }),
  });
