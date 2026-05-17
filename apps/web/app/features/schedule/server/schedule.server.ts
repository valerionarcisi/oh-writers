import { createServerFn } from "@tanstack/start";
import { z } from "zod";
import { and, eq, asc, isNull } from "drizzle-orm";
import { ResultAsync, ok, err, errAsync } from "neverthrow";
import {
  schedules,
  shootingDays,
  strips,
  scenes,
  screenplays,
} from "@oh-writers/db/schema";
import {
  generateStrips,
  assignDates,
  resolveEffortHours,
  type CountryCode,
  type BannerColor,
} from "@oh-writers/domain";
import { toShape, type ResultShape } from "@oh-writers/utils";
import { getDb, type Db } from "~/server/db";
import { withProjectAccess } from "~/server/pipeline";
import { requireProjectAccess } from "~/server/access";
import {
  ScheduleNotFoundError,
  StripNotFoundError,
  ShootingDayNotFoundError,
  ScheduleLockedError,
  NoScenesError,
  ForbiddenError,
  DbError,
} from "../schedule.errors";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StripView {
  id: string;
  shootingDayId: string | null;
  sceneId: string;
  position: number;
  bannerColor: BannerColor;
  isLocked: boolean;
  estimatedHours: number | null;
  resolvedHours: number;
  // Denormalized scene data for display
  sceneNumber: number;
  sceneHeading: string;
  location: string;
  intExt: string;
  timeOfDay: string | null;
  pageCount: number;
}

export interface ShootingDayView {
  id: string;
  dayNumber: number;
  date: string | null;
  dayType: "shoot" | "travel" | "rest" | "prep";
  notes: string | null;
  crewCallTime: string | null;
  shootStartTime: string | null;
  wrapTime: string | null;
  strips: StripView[];
  totalPageCount: number;
  totalHours: number;
}

export interface ScheduleView {
  id: string;
  projectId: string;
  name: string;
  startDate: string | null;
  countryCode: string;
  status: "draft" | "locked";
  screenplayId: string | null;
  screenplayVersionId: string | null;
  shootingDays: ShootingDayView[];
  unscheduledStrips: StripView[];
}

// ─── Query helper ─────────────────────────────────────────────────────────────

const loadScheduleView = async (
  db: Db,
  scheduleId: string,
): Promise<ScheduleView | null> => {
  const schedule = await db.query.schedules.findFirst({
    where: eq(schedules.id, scheduleId),
  });
  if (!schedule) return null;

  const screenplay = await db.query.screenplays.findFirst({
    where: eq(screenplays.projectId, schedule.projectId),
  });
  const screenplayId = screenplay?.id ?? null;
  const screenplayVersionId = screenplay?.currentVersionId ?? null;

  const days = await db
    .select()
    .from(shootingDays)
    .where(eq(shootingDays.scheduleId, scheduleId))
    .orderBy(asc(shootingDays.dayNumber));

  const allStrips = await db
    .select({
      id: strips.id,
      shootingDayId: strips.shootingDayId,
      sceneId: strips.sceneId,
      position: strips.position,
      bannerColor: strips.bannerColor,
      isLocked: strips.isLocked,
      estimatedHours: strips.estimatedHours,
      sceneNumber: scenes.number,
      sceneHeading: scenes.heading,
      location: scenes.location,
      intExt: scenes.intExt,
      timeOfDay: scenes.timeOfDay,
      pageStart: scenes.pageStart,
      pageEnd: scenes.pageEnd,
    })
    .from(strips)
    .innerJoin(scenes, eq(strips.sceneId, scenes.id))
    .where(eq(strips.scheduleId, scheduleId))
    .orderBy(asc(strips.position));

  const toStripView = (s: (typeof allStrips)[number]): StripView => {
    const pageCount =
      s.pageStart != null && s.pageEnd != null && s.pageEnd >= s.pageStart
        ? Math.max(1, s.pageEnd - s.pageStart)
        : 1;
    return {
      id: s.id,
      shootingDayId: s.shootingDayId,
      sceneId: s.sceneId,
      position: s.position,
      bannerColor: s.bannerColor as BannerColor,
      isLocked: s.isLocked,
      estimatedHours: s.estimatedHours,
      resolvedHours: resolveEffortHours(pageCount, s.estimatedHours),
      sceneNumber: s.sceneNumber,
      sceneHeading: s.sceneHeading,
      location: s.location,
      intExt: s.intExt,
      timeOfDay: s.timeOfDay,
      pageCount,
    };
  };

  const stripsByDay = new Map<string, StripView[]>();
  const unscheduled: StripView[] = [];

  for (const s of allStrips) {
    const view = toStripView(s);
    if (!s.shootingDayId) {
      unscheduled.push(view);
    } else {
      const arr = stripsByDay.get(s.shootingDayId) ?? [];
      arr.push(view);
      stripsByDay.set(s.shootingDayId, arr);
    }
  }

  const dayViews: ShootingDayView[] = days.map((d) => {
    const dayStrips = stripsByDay.get(d.id) ?? [];
    return {
      id: d.id,
      dayNumber: d.dayNumber,
      date: d.date,
      dayType: d.dayType as ShootingDayView["dayType"],
      notes: d.notes,
      crewCallTime: d.crewCallTime ?? null,
      shootStartTime: d.shootStartTime ?? null,
      wrapTime: d.wrapTime ?? null,
      strips: dayStrips,
      totalPageCount: dayStrips.reduce((sum, s) => sum + s.pageCount, 0),
      totalHours: dayStrips.reduce((sum, s) => sum + s.resolvedHours, 0),
    };
  });

  return {
    id: schedule.id,
    projectId: schedule.projectId,
    name: schedule.name,
    startDate: schedule.startDate,
    countryCode: schedule.countryCode,
    status: schedule.status as "draft" | "locked",
    screenplayId,
    screenplayVersionId,
    shootingDays: dayViews,
    unscheduledStrips: unscheduled,
  };
};

// ─── Server functions ─────────────────────────────────────────────────────────

export const getSchedule = createServerFn({ method: "GET" })
  .validator(z.object({ projectId: z.string().uuid() }))
  .handler(
    async ({ data }) =>
      toShape(
        await withProjectAccess(data.projectId, "view", ({ db }) =>
          ResultAsync.fromPromise(
            db.query.schedules
              .findFirst({ where: eq(schedules.projectId, data.projectId) })
              .then((r) => r ?? null),
            (e) => new DbError("getSchedule/find", e),
          ).andThen((schedule) => {
            if (!schedule) return ok(null);
            return ResultAsync.fromPromise(
              loadScheduleView(db, schedule.id),
              (e) => new DbError("getSchedule/loadView", e),
            );
          }),
        ),
      ),
  );

export const generateSchedule = createServerFn({ method: "POST" })
  .validator(
    z.object({
      projectId: z.string().uuid(),
      startDate: z.string().nullable().optional(),
    }),
  )
  .handler(
    async ({ data }) =>
      toShape(
        await withProjectAccess(data.projectId, "edit", ({ db }) =>
          // Load screenplay for this project
          ResultAsync.fromPromise(
            db.query.screenplays
              .findFirst({ where: eq(screenplays.projectId, data.projectId) })
              .then((r) => r ?? null),
            (e) => new DbError("generateSchedule/loadScreenplay", e),
          )
            .andThen((screenplay) => {
              if (!screenplay) return errAsync(new NoScenesError());
              return ResultAsync.fromPromise(
                db
                  .select()
                  .from(scenes)
                  .where(eq(scenes.screenplayId, screenplay.id))
                  .orderBy(asc(scenes.number)),
                (e) => new DbError("generateSchedule/loadScenes", e),
              );
            })
            .andThen((sceneRows) => {
              if (sceneRows.length === 0) return errAsync(new NoScenesError());

              const generatedStrips = generateStrips(
                sceneRows.map((s) => ({
                  id: s.id,
                  number: s.number,
                  location: s.location,
                  intExt: s.intExt as "INT" | "EXT" | "INT/EXT",
                  timeOfDay: s.timeOfDay,
                  pageStart: s.pageStart,
                  pageEnd: s.pageEnd,
                  hasSpecialEffect: s.hasSpecialEffect,
                  estimatedHours: null,
                })),
              );

              const dayCount =
                generatedStrips.reduce(
                  (max, s) => Math.max(max, s.dayIndex ?? -1),
                  -1,
                ) + 1;

              const startDate = data.startDate ? new Date(data.startDate) : null;
              const dates =
                startDate && dayCount > 0
                  ? assignDates(dayCount, startDate, "IT" as CountryCode)
                  : [];

              return ResultAsync.fromPromise(
                db.transaction(async (tx) => {
                  // Delete existing schedule for this project (idempotent)
                  const existing = await tx.query.schedules.findFirst({
                    where: eq(schedules.projectId, data.projectId),
                  });
                  if (existing) {
                    await tx
                      .delete(schedules)
                      .where(eq(schedules.id, existing.id));
                  }

                  // Create new schedule
                  const scheduleRows = await tx
                    .insert(schedules)
                    .values({
                      projectId: data.projectId,
                      startDate: startDate
                        ? startDate.toISOString().slice(0, 10)
                        : null,
                    })
                    .returning();
                  const schedule = scheduleRows[0]!;

                  // Create shooting days
                  const dayRows = await tx
                    .insert(shootingDays)
                    .values(
                      Array.from({ length: dayCount }, (_, i) => ({
                        scheduleId: schedule.id,
                        dayNumber: i + 1,
                        date: dates[i]
                          ? dates[i].toISOString().slice(0, 10)
                          : null,
                      })),
                    )
                    .returning();

                  // Create strips — map dayIndex to dayRow id
                  const dayIdByIndex = new Map(dayRows.map((d, i) => [i, d.id]));

                  if (generatedStrips.length > 0) {
                    await tx.insert(strips).values(
                      generatedStrips.map((s) => ({
                        scheduleId: schedule.id,
                        shootingDayId:
                          s.dayIndex !== null
                            ? (dayIdByIndex.get(s.dayIndex) ?? null)
                            : null,
                        sceneId: s.sceneId,
                        position: s.position,
                        bannerColor: s.bannerColor,
                      })),
                    );
                  }

                  return schedule.id;
                }),
                (e) => new DbError("generateSchedule/transaction", e),
              );
            })
            .andThen((scheduleId) =>
              ResultAsync.fromPromise(
                loadScheduleView(db, scheduleId).then((v) => v!),
                (e) => new DbError("generateSchedule/loadView", e),
              ),
            ),
        ),
      ),
  );

export const moveStrip = createServerFn({ method: "POST" })
  .validator(
    z.object({
      stripId: z.string().uuid(),
      targetDayId: z.string().uuid().nullable(),
      targetPosition: z.number().int().min(0),
    }),
  )
  .handler(
    async ({ data }) =>
      toShape(
        await ResultAsync.fromSafePromise(getDb()).andThen((db) =>
          ResultAsync.fromPromise(
            db.query.strips
              .findFirst({ where: eq(strips.id, data.stripId) })
              .then((r) => r ?? null),
            (e) => new DbError("moveStrip/loadStrip", e),
          )
            .andThen((strip) => {
              if (!strip) return err(new StripNotFoundError(data.stripId));
              if (strip.isLocked) return err(new ScheduleLockedError());
              return ok(strip);
            })
            .andThen((strip) =>
              ResultAsync.fromPromise(
                db.query.schedules
                  .findFirst({ where: eq(schedules.id, strip.scheduleId) })
                  .then((r) => r ?? null),
                (e) => new DbError("moveStrip/loadSchedule", e),
              ).andThen((schedule) => {
                if (!schedule)
                  return err(new DbError("moveStrip", "schedule not found"));
                return ok({ strip, schedule });
              }),
            )
            .andThen(({ strip, schedule }) =>
              requireProjectAccess(db, schedule.projectId, "edit").andThen(
                () => {
                  if (schedule.status === "locked")
                    return err(new ScheduleLockedError());
                  return ok({ strip, schedule });
                },
              ),
            )
            .andThen(({ strip, schedule }) =>
              ResultAsync.fromPromise(
                db.transaction(async (tx) => {
                  const movingToDifferentDay =
                    strip.shootingDayId !== data.targetDayId;

                  // Re-index the source day (removes the strip from its old slot)
                  if (movingToDifferentDay && strip.shootingDayId !== null) {
                    const sourceStrips = await tx
                      .select()
                      .from(strips)
                      .where(
                        and(
                          eq(strips.scheduleId, schedule.id),
                          eq(strips.shootingDayId, strip.shootingDayId),
                        ),
                      )
                      .orderBy(asc(strips.position));

                    const withoutMoved = sourceStrips.filter(
                      (s) => s.id !== strip.id,
                    );
                    for (let i = 0; i < withoutMoved.length; i++) {
                      await tx
                        .update(strips)
                        .set({ position: i, updatedAt: new Date() })
                        .where(eq(strips.id, withoutMoved[i]!.id));
                    }
                  }

                  // Load current strips in the target day (excluding the moving strip)
                  const targetStrips = await tx
                    .select()
                    .from(strips)
                    .where(
                      and(
                        eq(strips.scheduleId, schedule.id),
                        data.targetDayId
                          ? eq(strips.shootingDayId, data.targetDayId)
                          : isNull(strips.shootingDayId),
                      ),
                    )
                    .orderBy(asc(strips.position));

                  const withoutMoving = targetStrips.filter(
                    (s) => s.id !== strip.id,
                  );
                  withoutMoving.splice(data.targetPosition, 0, {
                    ...strip,
                    shootingDayId: data.targetDayId,
                  });

                  // Update the moved strip's day and position
                  await tx
                    .update(strips)
                    .set({
                      shootingDayId: data.targetDayId,
                      position: data.targetPosition,
                      updatedAt: new Date(),
                    })
                    .where(eq(strips.id, strip.id));

                  // Reindex all strips in the target day
                  for (let i = 0; i < withoutMoving.length; i++) {
                    const s = withoutMoving[i]!;
                    if (s.id === strip.id) continue;
                    await tx
                      .update(strips)
                      .set({ position: i, updatedAt: new Date() })
                      .where(eq(strips.id, s.id));
                  }
                }),
                (e) => new DbError("moveStrip/transaction", e),
              ).map(() => schedule.id),
            )
            .andThen((scheduleId) =>
              ResultAsync.fromPromise(
                loadScheduleView(db, scheduleId).then((v) => v!),
                (e) => new DbError("moveStrip/loadView", e),
              ),
            ),
        ),
      ),
  );

export const updateShootingDay = createServerFn({ method: "POST" })
  .validator(
    z.object({
      dayId: z.string().uuid(),
      patch: z.object({
        date: z.string().nullable().optional(),
        dayType: z.enum(["shoot", "travel", "rest", "prep"]).optional(),
        notes: z.string().nullable().optional(),
        crewCallTime: z.string().nullable().optional(),
        shootStartTime: z.string().nullable().optional(),
        wrapTime: z.string().nullable().optional(),
      }),
    }),
  )
  .handler(
    async ({ data }) =>
      toShape(
        await ResultAsync.fromSafePromise(getDb()).andThen((db) =>
          ResultAsync.fromPromise(
            db.query.shootingDays
              .findFirst({ where: eq(shootingDays.id, data.dayId) })
              .then((r) => r ?? null),
            (e) => new DbError("updateShootingDay/load", e),
          )
            .andThen((day) => {
              if (!day) return err(new ShootingDayNotFoundError(data.dayId));
              return ok(day);
            })
            .andThen((day) =>
              ResultAsync.fromPromise(
                db.query.schedules
                  .findFirst({ where: eq(schedules.id, day.scheduleId) })
                  .then((r) => r ?? null),
                (e) => new DbError("updateShootingDay/loadSchedule", e),
              ).andThen((schedule) => {
                if (!schedule)
                  return err(
                    new DbError("updateShootingDay", "schedule not found"),
                  );
                return ok({ day, schedule });
              }),
            )
            .andThen(({ day, schedule }) =>
              requireProjectAccess(db, schedule.projectId, "edit").andThen(
                () => ok({ day, schedule }),
              ),
            )
            .andThen(({ day, schedule }) =>
              ResultAsync.fromPromise(
                db
                  .update(shootingDays)
                  .set({ ...data.patch, updatedAt: new Date() })
                  .where(eq(shootingDays.id, day.id)),
                (e) => new DbError("updateShootingDay/update", e),
              ).map(() => schedule.id),
            )
            .andThen((scheduleId) =>
              ResultAsync.fromPromise(
                loadScheduleView(db, scheduleId).then((v) => v!),
                (e) => new DbError("updateShootingDay/loadView", e),
              ),
            ),
        ),
      ),
  );

export const addShootingDay = createServerFn({ method: "POST" })
  .validator(
    z.object({
      scheduleId: z.string().uuid(),
      afterDayNumber: z.number().int().min(0).optional(),
    }),
  )
  .handler(
    async ({ data }) =>
      toShape(
        await ResultAsync.fromSafePromise(getDb()).andThen((db) =>
          ResultAsync.fromPromise(
            db.query.schedules
              .findFirst({ where: eq(schedules.id, data.scheduleId) })
              .then((r) => r ?? null),
            (e) => new DbError("addShootingDay/loadSchedule", e),
          )
            .andThen((schedule) => {
              if (!schedule)
                return err(new ScheduleNotFoundError(data.scheduleId));
              return ok(schedule);
            })
            .andThen((schedule) =>
              requireProjectAccess(db, schedule.projectId, "edit").andThen(
                () => ok(schedule),
              ),
            )
            .andThen((schedule) =>
              ResultAsync.fromPromise(
                db.transaction(async (tx) => {
                  const allDays = await tx
                    .select()
                    .from(shootingDays)
                    .where(eq(shootingDays.scheduleId, schedule.id))
                    .orderBy(asc(shootingDays.dayNumber));

                  const insertAfter = data.afterDayNumber ?? allDays.length;
                  const newDayNumber = insertAfter + 1;

                  // Shift days after insertion point
                  const toShift = allDays.filter(
                    (d) => d.dayNumber >= newDayNumber,
                  );
                  for (const d of toShift) {
                    await tx
                      .update(shootingDays)
                      .set({
                        dayNumber: d.dayNumber + 1,
                        updatedAt: new Date(),
                      })
                      .where(eq(shootingDays.id, d.id));
                  }

                  await tx.insert(shootingDays).values({
                    scheduleId: schedule.id,
                    dayNumber: newDayNumber,
                  });
                }),
                (e) => new DbError("addShootingDay/transaction", e),
              ).map(() => schedule.id),
            )
            .andThen((scheduleId) =>
              ResultAsync.fromPromise(
                loadScheduleView(db, scheduleId).then((v) => v!),
                (e) => new DbError("addShootingDay/loadView", e),
              ),
            ),
        ),
      ),
  );

export const removeShootingDay = createServerFn({ method: "POST" })
  .validator(z.object({ dayId: z.string().uuid() }))
  .handler(
    async ({ data }) =>
      toShape(
        await ResultAsync.fromSafePromise(getDb()).andThen((db) =>
          ResultAsync.fromPromise(
            db.query.shootingDays
              .findFirst({ where: eq(shootingDays.id, data.dayId) })
              .then((r) => r ?? null),
            (e) => new DbError("removeShootingDay/load", e),
          )
            .andThen((day) => {
              if (!day) return err(new ShootingDayNotFoundError(data.dayId));
              return ok(day);
            })
            .andThen((day) =>
              ResultAsync.fromPromise(
                db.query.schedules
                  .findFirst({ where: eq(schedules.id, day.scheduleId) })
                  .then((r) => r ?? null),
                (e) => new DbError("removeShootingDay/loadSchedule", e),
              ).andThen((schedule) => {
                if (!schedule)
                  return err(
                    new DbError("removeShootingDay", "schedule not found"),
                  );
                return ok({ day, schedule });
              }),
            )
            .andThen(({ day, schedule }) =>
              requireProjectAccess(db, schedule.projectId, "edit").andThen(
                () => ok({ day, schedule }),
              ),
            )
            .andThen(({ day, schedule }) =>
              ResultAsync.fromPromise(
                db.transaction(async (tx) => {
                  // Move strips to unscheduled
                  await tx
                    .update(strips)
                    .set({ shootingDayId: null, updatedAt: new Date() })
                    .where(eq(strips.shootingDayId, day.id));

                  // Delete the day
                  await tx
                    .delete(shootingDays)
                    .where(eq(shootingDays.id, day.id));

                  // Renumber remaining days
                  const remaining = await tx
                    .select()
                    .from(shootingDays)
                    .where(eq(shootingDays.scheduleId, schedule.id))
                    .orderBy(asc(shootingDays.dayNumber));

                  for (let i = 0; i < remaining.length; i++) {
                    const d = remaining[i]!;
                    if (d.dayNumber !== i + 1) {
                      await tx
                        .update(shootingDays)
                        .set({ dayNumber: i + 1, updatedAt: new Date() })
                        .where(eq(shootingDays.id, d.id));
                    }
                  }
                }),
                (e) => new DbError("removeShootingDay/transaction", e),
              ).map(() => schedule.id),
            )
            .andThen((scheduleId) =>
              ResultAsync.fromPromise(
                loadScheduleView(db, scheduleId).then((v) => v!),
                (e) => new DbError("removeShootingDay/loadView", e),
              ),
            ),
        ),
      ),
  );

export const toggleStripLock = createServerFn({ method: "POST" })
  .validator(z.object({ stripId: z.string().uuid() }))
  .handler(
    async ({ data }) =>
      toShape(
        await ResultAsync.fromSafePromise(getDb()).andThen((db) =>
          ResultAsync.fromPromise(
            db.query.strips
              .findFirst({ where: eq(strips.id, data.stripId) })
              .then((r) => r ?? null),
            (e) => new DbError("toggleStripLock/load", e),
          )
            .andThen((strip) => {
              if (!strip) return err(new StripNotFoundError(data.stripId));
              return ok(strip);
            })
            .andThen((strip) =>
              ResultAsync.fromPromise(
                db.query.schedules
                  .findFirst({ where: eq(schedules.id, strip.scheduleId) })
                  .then((r) => r ?? null),
                (e) => new DbError("toggleStripLock/loadSchedule", e),
              ).andThen((schedule) => {
                if (!schedule)
                  return err(
                    new DbError("toggleStripLock", "schedule not found"),
                  );
                return ok({ strip, schedule });
              }),
            )
            .andThen(({ strip, schedule }) =>
              requireProjectAccess(db, schedule.projectId, "edit").andThen(
                () => ok({ strip, schedule }),
              ),
            )
            .andThen(({ strip, schedule }) =>
              ResultAsync.fromPromise(
                db
                  .update(strips)
                  .set({ isLocked: !strip.isLocked, updatedAt: new Date() })
                  .where(eq(strips.id, strip.id)),
                (e) => new DbError("toggleStripLock/update", e),
              ).map(() => schedule.id),
            )
            .andThen((scheduleId) =>
              ResultAsync.fromPromise(
                loadScheduleView(db, scheduleId).then((v) => v!),
                (e) => new DbError("toggleStripLock/loadView", e),
              ),
            ),
        ),
      ),
  );

export const updateStripEffort = createServerFn({ method: "POST" })
  .validator(
    z.object({
      stripId: z.string().uuid(),
      estimatedHours: z.number().min(0.5).max(24).nullable(),
    }),
  )
  .handler(
    async ({ data }) =>
      toShape(
        await ResultAsync.fromSafePromise(getDb()).andThen((db) =>
          ResultAsync.fromPromise(
            db.query.strips
              .findFirst({ where: eq(strips.id, data.stripId) })
              .then((r) => r ?? null),
            (e) => new DbError("updateStripEffort/loadStrip", e),
          )
            .andThen((strip) => {
              if (!strip) return err(new StripNotFoundError(data.stripId));
              return ok(strip);
            })
            .andThen((strip) =>
              ResultAsync.fromPromise(
                db.query.schedules
                  .findFirst({ where: eq(schedules.id, strip.scheduleId) })
                  .then((r) => r ?? null),
                (e) => new DbError("updateStripEffort/loadSchedule", e),
              ).andThen((schedule) => {
                if (!schedule)
                  return err(
                    new DbError("updateStripEffort", "schedule not found"),
                  );
                return ok({ strip, schedule });
              }),
            )
            .andThen(({ strip, schedule }) =>
              requireProjectAccess(db, schedule.projectId, "edit").andThen(
                () => ok({ strip, schedule }),
              ),
            )
            .andThen(({ strip, schedule }) =>
              ResultAsync.fromPromise(
                db
                  .update(strips)
                  .set({
                    estimatedHours: data.estimatedHours,
                    updatedAt: new Date(),
                  })
                  .where(eq(strips.id, strip.id)),
                (e) => new DbError("updateStripEffort/update", e),
              ).map(() => schedule.id),
            )
            .andThen((scheduleId) =>
              ResultAsync.fromPromise(
                loadScheduleView(db, scheduleId).then((v) => v!),
                (e) => new DbError("updateStripEffort/loadView", e),
              ),
            ),
        ),
      ),
  );

export const scheduleQueryOptions = (projectId: string) => ({
  queryKey: ["schedule", projectId],
  queryFn: () => getSchedule({ data: { projectId } }),
});
