import { eq } from "drizzle-orm";
import { ResultAsync, errAsync } from "neverthrow";
import {
  shotPlans,
  shotPlanScenarios,
  shots,
  transitionSlots,
  scenes,
  screenplays,
  locations,
  sceneBlockings,
  planSceneCameras,
} from "@oh-writers/db/schema";
import { DbError } from "@oh-writers/utils";
import type { Db } from "~/server/db";

// Issue #61 — the shooting-plan + blocking mutating server fns are gated at
// project `edit`, but several of them receive only a downstream entity id, not
// the projectId. This module resolves the owning projectId from that id so the
// handler can call `withProjectAccess(projectId, "edit", …)` before mutating.
//
// A missing entity (bad/guessed UUID) resolves to a DbError — the same shape
// the callers already return for a not-found row, so the error union stays flat.

const notFound = (label: string, id: string): DbError =>
  new DbError(
    `resolveProjectId/${label}`,
    new Error(`${label} not found: ${id}`),
  );

const first = <T>(rows: T[]): T | null => rows[0] ?? null;

const projectIdFromScenario = (
  db: Db,
  scenarioId: string,
): ResultAsync<string, DbError> =>
  ResultAsync.fromPromise(
    db
      .select({ projectId: shotPlans.projectId })
      .from(shotPlanScenarios)
      .innerJoin(shotPlans, eq(shotPlanScenarios.shotPlanId, shotPlans.id))
      .where(eq(shotPlanScenarios.id, scenarioId))
      .then(first),
    (e) => new DbError("resolveProjectId/scenario", e),
  ).andThen((row) =>
    row
      ? ResultAsync.fromSafePromise(Promise.resolve(row.projectId))
      : errAsync(notFound("scenario", scenarioId)),
  );

export const projectIdFromShotPlan = (
  db: Db,
  shotPlanId: string,
): ResultAsync<string, DbError> =>
  ResultAsync.fromPromise(
    db
      .select({ projectId: shotPlans.projectId })
      .from(shotPlans)
      .where(eq(shotPlans.id, shotPlanId))
      .then(first),
    (e) => new DbError("resolveProjectId/shotPlan", e),
  ).andThen((row) =>
    row
      ? ResultAsync.fromSafePromise(Promise.resolve(row.projectId))
      : errAsync(notFound("shotPlan", shotPlanId)),
  );

export const projectIdFromScenarioId = projectIdFromScenario;

export const projectIdFromShot = (
  db: Db,
  shotId: string,
): ResultAsync<string, DbError> =>
  ResultAsync.fromPromise(
    db
      .select({ scenarioId: shots.scenarioId })
      .from(shots)
      .where(eq(shots.id, shotId))
      .then(first),
    (e) => new DbError("resolveProjectId/shot", e),
  ).andThen((row) =>
    row
      ? projectIdFromScenario(db, row.scenarioId)
      : errAsync(notFound("shot", shotId)),
  );

export const projectIdFromTransition = (
  db: Db,
  transitionId: string,
): ResultAsync<string, DbError> =>
  ResultAsync.fromPromise(
    db
      .select({ scenarioId: transitionSlots.scenarioId })
      .from(transitionSlots)
      .where(eq(transitionSlots.id, transitionId))
      .then(first),
    (e) => new DbError("resolveProjectId/transition", e),
  ).andThen((row) =>
    row
      ? projectIdFromScenario(db, row.scenarioId)
      : errAsync(notFound("transition", transitionId)),
  );

export const projectIdFromScene = (
  db: Db,
  sceneId: string,
): ResultAsync<string, DbError> =>
  ResultAsync.fromPromise(
    db
      .select({ projectId: screenplays.projectId })
      .from(scenes)
      .innerJoin(screenplays, eq(scenes.screenplayId, screenplays.id))
      .where(eq(scenes.id, sceneId))
      .then(first),
    (e) => new DbError("resolveProjectId/scene", e),
  ).andThen((row) =>
    row
      ? ResultAsync.fromSafePromise(Promise.resolve(row.projectId))
      : errAsync(notFound("scene", sceneId)),
  );

export const projectIdFromLocation = (
  db: Db,
  locationId: string,
): ResultAsync<string, DbError> =>
  ResultAsync.fromPromise(
    db
      .select({ projectId: locations.projectId })
      .from(locations)
      .where(eq(locations.id, locationId))
      .then(first),
    (e) => new DbError("resolveProjectId/location", e),
  ).andThen((row) =>
    row
      ? ResultAsync.fromSafePromise(Promise.resolve(row.projectId))
      : errAsync(notFound("location", locationId)),
  );

export const projectIdFromSceneBlocking = (
  db: Db,
  sceneBlockingId: string,
): ResultAsync<string, DbError> =>
  ResultAsync.fromPromise(
    db
      .select({ sceneId: sceneBlockings.sceneId })
      .from(sceneBlockings)
      .where(eq(sceneBlockings.id, sceneBlockingId))
      .then(first),
    (e) => new DbError("resolveProjectId/sceneBlocking", e),
  ).andThen((row) =>
    row
      ? projectIdFromScene(db, row.sceneId)
      : errAsync(notFound("sceneBlocking", sceneBlockingId)),
  );

export const projectIdFromPlanSceneCameras = (
  db: Db,
  planSceneCamerasId: string,
): ResultAsync<string, DbError> =>
  ResultAsync.fromPromise(
    db
      .select({ sceneId: planSceneCameras.sceneId })
      .from(planSceneCameras)
      .where(eq(planSceneCameras.id, planSceneCamerasId))
      .then(first),
    (e) => new DbError("resolveProjectId/planSceneCameras", e),
  ).andThen((row) =>
    row
      ? projectIdFromScene(db, row.sceneId)
      : errAsync(notFound("planSceneCameras", planSceneCamerasId)),
  );
