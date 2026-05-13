import { createServerFn } from "@tanstack/start";
import { z } from "zod";
import { eq, asc, and, inArray } from "drizzle-orm";
import { ResultAsync, ok, err } from "neverthrow";
import { queryOptions } from "@tanstack/react-query";
import {
  shotPlans,
  shotPlanScenarios,
  shots,
  transitionSlots,
  schedules,
  strips,
  scenes,
} from "@oh-writers/db/schema";
import {
  ShotEffortWeightsSchema,
  DEFAULT_SHOT_EFFORT_WEIGHTS,
  resolveShotMinutes,
  computeScenarioTotal,
  inferTransitions,
  type ShotEffortWeights,
  type ShotSize,
  type CameraMovement,
  type TransitionType,
} from "@oh-writers/domain";
import { toShape, type ResultShape } from "@oh-writers/utils";
import { requireUser } from "~/server/context";
import { getDb, type Db } from "~/server/db";
import {
  ForbiddenError,
  DbError,
  ShotPlanNotFoundError,
  ScenarioNotFoundError,
  ShotNotFoundError,
} from "../shooting-plan.errors";

// ─── View types ───────────────────────────────────────────────────────────────

export interface ShotView {
  id: string;
  scenarioId: string;
  position: number;
  shotSize: ShotSize;
  cameraMovement: CameraMovement;
  cameraLabel: string;
  estimatedMinutes: number | null;
  resolvedMinutes: number;
  notes: string | null;
}

export interface TransitionSlotView {
  id: string;
  afterShotId: string;
  type: TransitionType;
  estimatedMinutes: number | null;
  ruleId: string | null;
  isManual: boolean;
  label: string | null;
}

export interface ScenarioView {
  id: string;
  shotPlanId: string;
  name: string;
  position: number;
  shots: ShotView[];
  transitions: TransitionSlotView[];
  totalMinutes: number;
}

export interface ShotPlanView {
  id: string;
  projectId: string;
  sceneId: string;
  activeScenarioId: string | null;
  scenarios: ScenarioView[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const resolveWeights = (
  db: Db,
  projectId: string,
): ResultAsync<ShotEffortWeights, DbError> =>
  ResultAsync.fromPromise(
    db.query.schedules
      .findFirst({ where: eq(schedules.projectId, projectId) })
      .then((r) => r ?? null),
    (e) => new DbError("resolveWeights/loadSchedule", e),
  ).map((schedule) => {
    if (!schedule?.effortWeights) return DEFAULT_SHOT_EFFORT_WEIGHTS;
    const parsed = ShotEffortWeightsSchema.safeParse(schedule.effortWeights);
    return parsed.success ? parsed.data : DEFAULT_SHOT_EFFORT_WEIGHTS;
  });

const buildScenarioView = (
  scenario: typeof shotPlanScenarios.$inferSelect,
  rawShots: (typeof shots.$inferSelect)[],
  rawTransitions: (typeof transitionSlots.$inferSelect)[],
  weights: ShotEffortWeights,
): ScenarioView => {
  const scenarioShots = rawShots
    .filter((s) => s.scenarioId === scenario.id)
    .sort((a, b) => a.position - b.position);

  const scenarioTransitions = rawTransitions.filter(
    (t) => t.scenarioId === scenario.id,
  );

  const shotViews: ShotView[] = scenarioShots.map((s) => ({
    id: s.id,
    scenarioId: s.scenarioId,
    position: s.position,
    shotSize: s.shotSize as ShotSize,
    cameraMovement: s.cameraMovement as CameraMovement,
    cameraLabel: s.cameraLabel,
    estimatedMinutes: s.estimatedMinutes ?? null,
    resolvedMinutes: resolveShotMinutes(
      {
        shotSize: s.shotSize as ShotSize,
        cameraMovement: s.cameraMovement as CameraMovement,
        estimatedMinutes: s.estimatedMinutes ?? null,
      },
      weights,
    ),
    notes: s.notes ?? null,
  }));

  const transitionViews: TransitionSlotView[] = scenarioTransitions.map(
    (t) => ({
      id: t.id,
      afterShotId: t.afterShotId,
      type: t.type as TransitionType,
      estimatedMinutes: t.estimatedMinutes ?? null,
      ruleId: t.ruleId ?? null,
      isManual: t.isManual,
      label: t.label ?? null,
    }),
  );

  const totalMinutes = computeScenarioTotal(
    shotViews.map((s) => ({
      shotSize: s.shotSize,
      cameraMovement: s.cameraMovement,
      estimatedMinutes: s.estimatedMinutes,
    })),
    transitionViews.map((t) => ({
      estimatedMinutes: t.estimatedMinutes,
      ruleId: t.ruleId,
    })),
    weights,
  );

  return {
    id: scenario.id,
    shotPlanId: scenario.shotPlanId,
    name: scenario.name,
    position: scenario.position,
    shots: shotViews,
    transitions: transitionViews,
    totalMinutes,
  };
};

// ─── Internal helpers ─────────────────────────────────────────────────────────

const insertAutoTransitions = async (
  db: Db,
  prevShot: typeof shots.$inferSelect,
  newShot: typeof shots.$inferSelect,
  scenarioId: string,
  projectId: string,
): Promise<void> => {
  const schedule = await db.query.schedules.findFirst({
    where: eq(schedules.projectId, projectId),
  });
  const rawWeights = schedule?.effortWeights ?? null;
  const parsed = rawWeights
    ? ShotEffortWeightsSchema.safeParse(rawWeights)
    : null;
  const weights = parsed?.success ? parsed.data : DEFAULT_SHOT_EFFORT_WEIGHTS;

  const inferred = inferTransitions(
    {
      id: prevShot.id,
      shotSize: prevShot.shotSize as ShotSize,
      cameraMovement: prevShot.cameraMovement as CameraMovement,
    },
    {
      id: newShot.id,
      shotSize: newShot.shotSize as ShotSize,
      cameraMovement: newShot.cameraMovement as CameraMovement,
    },
    [],
    weights,
  );

  if (inferred.length > 0) {
    await db.insert(transitionSlots).values(
      inferred.map((t) => ({
        scenarioId,
        afterShotId: t.afterShotId,
        type: t.type,
        estimatedMinutes: t.estimatedMinutes,
        ruleId: t.ruleId,
        isManual: false,
        label: t.label,
      })),
    );
  }
};

const rebuildAutoTransitions = async (
  db: Db,
  scenarioId: string,
  projectId: string,
): Promise<void> => {
  // Delete existing non-manual transitions
  await db
    .delete(transitionSlots)
    .where(
      and(
        eq(transitionSlots.scenarioId, scenarioId),
        eq(transitionSlots.isManual, false),
      ),
    );

  const orderedShots = await db
    .select()
    .from(shots)
    .where(eq(shots.scenarioId, scenarioId))
    .orderBy(asc(shots.position));

  for (let i = 0; i < orderedShots.length - 1; i++) {
    await insertAutoTransitions(
      db,
      orderedShots[i]!,
      orderedShots[i + 1]!,
      scenarioId,
      projectId,
    );
  }
};

const syncStripEffort = async (
  db: Db,
  shotPlanId: string,
  projectId: string,
): Promise<void> => {
  const plan = await db.query.shotPlans.findFirst({
    where: eq(shotPlans.id, shotPlanId),
  });
  if (!plan?.activeScenarioId) return;

  const schedule = await db.query.schedules.findFirst({
    where: eq(schedules.projectId, projectId),
  });
  const rawWeights = schedule?.effortWeights ?? null;
  const parsed = rawWeights
    ? ShotEffortWeightsSchema.safeParse(rawWeights)
    : null;
  const weights = parsed?.success ? parsed.data : DEFAULT_SHOT_EFFORT_WEIGHTS;

  const activeShots = await db
    .select()
    .from(shots)
    .where(eq(shots.scenarioId, plan.activeScenarioId))
    .orderBy(asc(shots.position));

  const activeTransitions = await db
    .select()
    .from(transitionSlots)
    .where(eq(transitionSlots.scenarioId, plan.activeScenarioId));

  const totalMinutes = computeScenarioTotal(
    activeShots.map((s) => ({
      shotSize: s.shotSize as ShotSize,
      cameraMovement: s.cameraMovement as CameraMovement,
      estimatedMinutes: s.estimatedMinutes ?? null,
    })),
    activeTransitions.map((t) => ({
      estimatedMinutes: t.estimatedMinutes ?? null,
      ruleId: t.ruleId ?? null,
    })),
    weights,
  );

  const estimatedHours = totalMinutes / 60;

  if (schedule) {
    await db
      .update(strips)
      .set({ estimatedHours, updatedAt: new Date() })
      .where(
        and(
          eq(strips.scheduleId, schedule.id),
          eq(strips.sceneId, plan.sceneId),
        ),
      );
  }
};

// ─── Read server functions ────────────────────────────────────────────────────

export const getShotPlan = createServerFn({ method: "GET" })
  .validator(
    z.object({
      sceneId: z.string().uuid(),
      projectId: z.string().uuid(),
    }),
  )
  .handler(
    async ({
      data,
    }): Promise<ResultShape<ShotPlanView | null, ForbiddenError | DbError>> => {
      await requireUser();
      const db = await getDb();

      const result = await resolveWeights(db, data.projectId).andThen(
        (weights) =>
          ResultAsync.fromPromise(
            db.query.shotPlans
              .findFirst({ where: eq(shotPlans.sceneId, data.sceneId) })
              .then((r) => r ?? null),
            (e) => new DbError("getShotPlan/loadPlan", e),
          ).andThen((plan) => {
            if (!plan) return ok(null);

            return ResultAsync.fromPromise(
              db
                .select()
                .from(shotPlanScenarios)
                .where(eq(shotPlanScenarios.shotPlanId, plan.id))
                .orderBy(asc(shotPlanScenarios.position)),
              (e) => new DbError("getShotPlan/loadScenarios", e),
            )
              .andThen((scenarios) => {
                const scenarioIds = scenarios.map((s) => s.id);
                if (scenarioIds.length === 0) {
                  return ok({
                    plan,
                    scenarios,
                    rawShots: [],
                    rawTransitions: [],
                  });
                }

                return ResultAsync.fromPromise(
                  Promise.all([
                    db
                      .select()
                      .from(shots)
                      .where(inArray(shots.scenarioId, scenarioIds))
                      .orderBy(asc(shots.position)),
                    db
                      .select()
                      .from(transitionSlots)
                      .where(inArray(transitionSlots.scenarioId, scenarioIds)),
                  ]),
                  (e) => new DbError("getShotPlan/loadShotsTransitions", e),
                ).andThen(([rawShots, rawTransitions]) =>
                  ok({ plan, scenarios, rawShots, rawTransitions }),
                );
              })
              .map(({ plan, scenarios, rawShots, rawTransitions }) => {
                const scenarioViews = scenarios.map((scenario) =>
                  buildScenarioView(
                    scenario,
                    rawShots,
                    rawTransitions,
                    weights,
                  ),
                );

                return {
                  id: plan.id,
                  projectId: plan.projectId,
                  sceneId: plan.sceneId,
                  activeScenarioId: plan.activeScenarioId,
                  scenarios: scenarioViews,
                } satisfies ShotPlanView;
              });
          }),
      );

      return toShape(result);
    },
  );

export const shotPlanQueryOptions = (sceneId: string, projectId: string) =>
  queryOptions({
    queryKey: ["shot-plan", sceneId, projectId],
    queryFn: () => getShotPlan({ data: { sceneId, projectId } }),
  });

export const getEffortWeights = createServerFn({ method: "GET" })
  .validator(z.object({ projectId: z.string().uuid() }))
  .handler(
    async ({ data }): Promise<ResultShape<ShotEffortWeights, DbError>> => {
      await requireUser();
      const db = await getDb();

      const result = await resolveWeights(db, data.projectId);

      return toShape(result);
    },
  );

export const effortWeightsQueryOptions = (projectId: string) =>
  queryOptions({
    queryKey: ["effort-weights", projectId],
    queryFn: () => getEffortWeights({ data: { projectId } }),
  });

// ─── Write server functions ───────────────────────────────────────────────────

export const createShotPlanAndScenario = createServerFn({ method: "POST" })
  .validator(
    z.object({
      sceneId: z.string().uuid(),
      projectId: z.string().uuid(),
      scenarioName: z.string().min(1).max(100).optional(),
    }),
  )
  .handler(
    async ({
      data,
    }): Promise<ResultShape<ShotPlanView, ForbiddenError | DbError>> => {
      await requireUser();
      const db = await getDb();

      const result = await resolveWeights(db, data.projectId).andThen(
        (weights) =>
          ResultAsync.fromPromise(
            db.transaction(async (tx) => {
              // Upsert shot plan
              const existing = await tx.query.shotPlans.findFirst({
                where: eq(shotPlans.sceneId, data.sceneId),
              });

              let plan: typeof shotPlans.$inferSelect;
              if (existing) {
                plan = existing;
              } else {
                const rows = await tx
                  .insert(shotPlans)
                  .values({ sceneId: data.sceneId, projectId: data.projectId })
                  .returning();
                plan = rows[0]!;
              }

              // Count existing scenarios
              const existingScenarios = await tx
                .select()
                .from(shotPlanScenarios)
                .where(eq(shotPlanScenarios.shotPlanId, plan.id));

              const position = existingScenarios.length;
              const name =
                data.scenarioName ??
                `Plan ${String.fromCharCode(65 + position)}`;

              const scenarioRows = await tx
                .insert(shotPlanScenarios)
                .values({ shotPlanId: plan.id, name, position })
                .returning();
              const scenario = scenarioRows[0]!;

              // Set as active if first scenario
              let activeScenarioId = plan.activeScenarioId;
              if (position === 0) {
                await tx
                  .update(shotPlans)
                  .set({ activeScenarioId: scenario.id, updatedAt: new Date() })
                  .where(eq(shotPlans.id, plan.id));
                activeScenarioId = scenario.id;
              }

              return {
                id: plan.id,
                projectId: plan.projectId,
                sceneId: plan.sceneId,
                activeScenarioId,
                scenarios: [
                  buildScenarioView(scenario, [], [], weights),
                  ...existingScenarios.map((s) =>
                    buildScenarioView(s, [], [], weights),
                  ),
                ],
              } satisfies ShotPlanView;
            }),
            (e) => new DbError("createShotPlanAndScenario/transaction", e),
          ),
      );

      return toShape(result);
    },
  );

export const setActiveScenario = createServerFn({ method: "POST" })
  .validator(
    z.object({
      shotPlanId: z.string().uuid(),
      scenarioId: z.string().uuid(),
      projectId: z.string().uuid(),
    }),
  )
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<void, ForbiddenError | ScenarioNotFoundError | DbError>
    > => {
      await requireUser();
      const db = await getDb();

      const result = await ResultAsync.fromPromise(
        db.query.shotPlanScenarios
          .findFirst({ where: eq(shotPlanScenarios.id, data.scenarioId) })
          .then((r) => r ?? null),
        (e) => new DbError("setActiveScenario/load", e),
      )
        .andThen((scenario) => {
          if (!scenario) return err(new ScenarioNotFoundError(data.scenarioId));
          if (scenario.shotPlanId !== data.shotPlanId)
            return err(new ForbiddenError("set active scenario"));
          return ok(scenario);
        })
        .andThen(() =>
          ResultAsync.fromPromise(
            db
              .update(shotPlans)
              .set({ activeScenarioId: data.scenarioId, updatedAt: new Date() })
              .where(eq(shotPlans.id, data.shotPlanId))
              .then(() => syncStripEffort(db, data.shotPlanId, data.projectId)),
            (e) => new DbError("setActiveScenario/update", e),
          ),
        );

      return toShape(result);
    },
  );

export const addShot = createServerFn({ method: "POST" })
  .validator(
    z.object({
      scenarioId: z.string().uuid(),
      shotPlanId: z.string().uuid(),
      projectId: z.string().uuid(),
      shotSize: z.enum([
        "EWS",
        "WS",
        "MS",
        "MCU",
        "CU",
        "ECU",
        "INSERT",
        "OTS",
        "TWO_SHOT",
        "POV",
      ]),
      cameraMovement: z.enum([
        "STATIC",
        "PAN",
        "TILT",
        "DOLLY",
        "HANDHELD",
        "STEADICAM",
        "CRANE",
        "DRONE",
        "ZOOM",
      ]),
      cameraLabel: z.enum(["A", "B", "C", "D"]).optional(),
      estimatedMinutes: z.number().min(0).nullable().optional(),
      notes: z.string().nullable().optional(),
    }),
  )
  .handler(
    async ({ data }): Promise<ResultShape<void, ForbiddenError | DbError>> => {
      await requireUser();
      const db = await getDb();

      const result = await ResultAsync.fromPromise(
        db.transaction(async (tx) => {
          const existingShots = await tx
            .select()
            .from(shots)
            .where(eq(shots.scenarioId, data.scenarioId))
            .orderBy(asc(shots.position));

          const position = existingShots.length;

          const newShotRows = await tx
            .insert(shots)
            .values({
              scenarioId: data.scenarioId,
              position,
              shotSize: data.shotSize,
              cameraMovement: data.cameraMovement,
              cameraLabel: data.cameraLabel ?? "A",
              estimatedMinutes: data.estimatedMinutes ?? null,
              notes: data.notes ?? null,
            })
            .returning();
          const newShot = newShotRows[0]!;

          const prevShot =
            existingShots.length > 0
              ? existingShots[existingShots.length - 1]!
              : null;

          if (prevShot) {
            await insertAutoTransitions(
              tx as unknown as Db,
              prevShot,
              newShot,
              data.scenarioId,
              data.projectId,
            );
          }
        }),
        (e) => new DbError("addShot/transaction", e),
      ).andThen(() =>
        ResultAsync.fromPromise(
          syncStripEffort(db, data.shotPlanId, data.projectId),
          (e) => new DbError("addShot/syncStrip", e),
        ),
      );

      return toShape(result);
    },
  );

export const updateShot = createServerFn({ method: "POST" })
  .validator(
    z.object({
      shotId: z.string().uuid(),
      shotPlanId: z.string().uuid(),
      projectId: z.string().uuid(),
      patch: z.object({
        shotSize: z
          .enum([
            "EWS",
            "WS",
            "MS",
            "MCU",
            "CU",
            "ECU",
            "INSERT",
            "OTS",
            "TWO_SHOT",
            "POV",
          ])
          .optional(),
        cameraMovement: z
          .enum([
            "STATIC",
            "PAN",
            "TILT",
            "DOLLY",
            "HANDHELD",
            "STEADICAM",
            "CRANE",
            "DRONE",
            "ZOOM",
          ])
          .optional(),
        cameraLabel: z.enum(["A", "B", "C", "D"]).optional(),
        estimatedMinutes: z.number().min(0).nullable().optional(),
        notes: z.string().nullable().optional(),
      }),
    }),
  )
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<void, ForbiddenError | ShotNotFoundError | DbError>
    > => {
      await requireUser();
      const db = await getDb();

      const result = await ResultAsync.fromPromise(
        db.query.shots
          .findFirst({ where: eq(shots.id, data.shotId) })
          .then((r) => r ?? null),
        (e) => new DbError("updateShot/load", e),
      )
        .andThen((shot) => {
          if (!shot) return err(new ShotNotFoundError(data.shotId));
          return ok(shot);
        })
        .andThen(() =>
          ResultAsync.fromPromise(
            db
              .update(shots)
              .set({ ...data.patch, updatedAt: new Date() })
              .where(eq(shots.id, data.shotId)),
            (e) => new DbError("updateShot/update", e),
          ),
        )
        .andThen(() =>
          ResultAsync.fromPromise(
            syncStripEffort(db, data.shotPlanId, data.projectId),
            (e) => new DbError("updateShot/syncStrip", e),
          ),
        );

      return toShape(result);
    },
  );

export const deleteShot = createServerFn({ method: "POST" })
  .validator(
    z.object({
      shotId: z.string().uuid(),
      shotPlanId: z.string().uuid(),
      projectId: z.string().uuid(),
    }),
  )
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<void, ForbiddenError | ShotNotFoundError | DbError>
    > => {
      await requireUser();
      const db = await getDb();

      const result = await ResultAsync.fromPromise(
        db.query.shots
          .findFirst({ where: eq(shots.id, data.shotId) })
          .then((r) => r ?? null),
        (e) => new DbError("deleteShot/load", e),
      )
        .andThen((shot) => {
          if (!shot) return err(new ShotNotFoundError(data.shotId));
          return ok(shot);
        })
        .andThen((shot) =>
          ResultAsync.fromPromise(
            db.delete(shots).where(eq(shots.id, shot.id)),
            (e) => new DbError("deleteShot/delete", e),
          ),
        )
        .andThen(() =>
          ResultAsync.fromPromise(
            syncStripEffort(db, data.shotPlanId, data.projectId),
            (e) => new DbError("deleteShot/syncStrip", e),
          ),
        );

      return toShape(result);
    },
  );

export const reorderShots = createServerFn({ method: "POST" })
  .validator(
    z.object({
      scenarioId: z.string().uuid(),
      shotPlanId: z.string().uuid(),
      projectId: z.string().uuid(),
      orderedShotIds: z.array(z.string().uuid()),
    }),
  )
  .handler(
    async ({ data }): Promise<ResultShape<void, ForbiddenError | DbError>> => {
      await requireUser();
      const db = await getDb();

      const result = await ResultAsync.fromPromise(
        db.transaction(async (tx) => {
          for (let i = 0; i < data.orderedShotIds.length; i++) {
            await tx
              .update(shots)
              .set({ position: i, updatedAt: new Date() })
              .where(eq(shots.id, data.orderedShotIds[i]!));
          }

          await rebuildAutoTransitions(
            tx as unknown as Db,
            data.scenarioId,
            data.projectId,
          );
        }),
        (e) => new DbError("reorderShots/transaction", e),
      ).andThen(() =>
        ResultAsync.fromPromise(
          syncStripEffort(db, data.shotPlanId, data.projectId),
          (e) => new DbError("reorderShots/syncStrip", e),
        ),
      );

      return toShape(result);
    },
  );

export const addManualTransition = createServerFn({ method: "POST" })
  .validator(
    z.object({
      scenarioId: z.string().uuid(),
      shotPlanId: z.string().uuid(),
      projectId: z.string().uuid(),
      afterShotId: z.string().uuid(),
      type: z.enum(["SETUP_CHANGE", "MAKEUP_COSTUME", "BREAK", "TRAVEL"]),
      estimatedMinutes: z.number().min(0).nullable().optional(),
      label: z.string().nullable().optional(),
    }),
  )
  .handler(
    async ({ data }): Promise<ResultShape<void, ForbiddenError | DbError>> => {
      await requireUser();
      const db = await getDb();

      const result = await ResultAsync.fromPromise(
        db.insert(transitionSlots).values({
          scenarioId: data.scenarioId,
          afterShotId: data.afterShotId,
          type: data.type,
          estimatedMinutes: data.estimatedMinutes ?? null,
          isManual: true,
          label: data.label ?? null,
        }),
        (e) => new DbError("addManualTransition/insert", e),
      ).andThen(() =>
        ResultAsync.fromPromise(
          syncStripEffort(db, data.shotPlanId, data.projectId),
          (e) => new DbError("addManualTransition/syncStrip", e),
        ),
      );

      return toShape(result);
    },
  );

export const updateTransition = createServerFn({ method: "POST" })
  .validator(
    z.object({
      transitionId: z.string().uuid(),
      shotPlanId: z.string().uuid(),
      projectId: z.string().uuid(),
      patch: z.object({
        type: z
          .enum(["SETUP_CHANGE", "MAKEUP_COSTUME", "BREAK", "TRAVEL"])
          .optional(),
        estimatedMinutes: z.number().min(0).nullable().optional(),
        label: z.string().nullable().optional(),
      }),
    }),
  )
  .handler(
    async ({ data }): Promise<ResultShape<void, ForbiddenError | DbError>> => {
      await requireUser();
      const db = await getDb();

      const result = await ResultAsync.fromPromise(
        db
          .update(transitionSlots)
          .set({ ...data.patch, updatedAt: new Date() })
          .where(eq(transitionSlots.id, data.transitionId)),
        (e) => new DbError("updateTransition/update", e),
      ).andThen(() =>
        ResultAsync.fromPromise(
          syncStripEffort(db, data.shotPlanId, data.projectId),
          (e) => new DbError("updateTransition/syncStrip", e),
        ),
      );

      return toShape(result);
    },
  );

export const deleteTransition = createServerFn({ method: "POST" })
  .validator(
    z.object({
      transitionId: z.string().uuid(),
      shotPlanId: z.string().uuid(),
      projectId: z.string().uuid(),
    }),
  )
  .handler(
    async ({ data }): Promise<ResultShape<void, ForbiddenError | DbError>> => {
      await requireUser();
      const db = await getDb();

      const result = await ResultAsync.fromPromise(
        db
          .delete(transitionSlots)
          .where(eq(transitionSlots.id, data.transitionId)),
        (e) => new DbError("deleteTransition/delete", e),
      ).andThen(() =>
        ResultAsync.fromPromise(
          syncStripEffort(db, data.shotPlanId, data.projectId),
          (e) => new DbError("deleteTransition/syncStrip", e),
        ),
      );

      return toShape(result);
    },
  );

export const updateEffortWeights = createServerFn({ method: "POST" })
  .validator(
    z.object({
      projectId: z.string().uuid(),
      weights: ShotEffortWeightsSchema,
    }),
  )
  .handler(
    async ({
      data,
    }): Promise<ResultShape<ShotEffortWeights, ForbiddenError | DbError>> => {
      await requireUser();
      const db = await getDb();

      const result = await ResultAsync.fromPromise(
        db.query.schedules
          .findFirst({ where: eq(schedules.projectId, data.projectId) })
          .then((r) => r ?? null),
        (e) => new DbError("updateEffortWeights/loadSchedule", e),
      ).andThen((schedule) => {
        if (!schedule)
          return ResultAsync.fromPromise(
            Promise.resolve(data.weights),
            (e) => new DbError("updateEffortWeights/noSchedule", e),
          );

        return ResultAsync.fromPromise(
          db
            .update(schedules)
            .set({
              effortWeights: data.weights as Record<string, number>,
              updatedAt: new Date(),
            })
            .where(eq(schedules.id, schedule.id))
            .then(() => data.weights),
          (e) => new DbError("updateEffortWeights/update", e),
        );
      });

      return toShape(result);
    },
  );
