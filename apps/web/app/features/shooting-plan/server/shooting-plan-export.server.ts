import { createServerFn } from "@tanstack/start";
import { z } from "zod";
import { eq, asc, inArray } from "drizzle-orm";
import { ResultAsync } from "neverthrow";
import {
  shotPlans,
  shots,
  scenes,
  screenplays,
} from "@oh-writers/db/schema";
import { toShape, type ResultShape } from "@oh-writers/utils";
import { withProjectAccess } from "~/server/pipeline";
import { type Db } from "~/server/db";
import { ProjectNotFoundError } from "~/features/projects";
import { ForbiddenError, DbError } from "../shooting-plan.errors";
import type { ShotListCsvScene } from "../lib/shot-list-csv";
import { shotListToCsv } from "../lib/shot-list-csv";
import { buildShotListPdf } from "../lib/shot-list-pdf";

// ─── Shared data loader ────────────────────────────────────────────────────────

/**
 * Loads all scenes for the project's primary screenplay, with shots from the
 * active scenario of each scene's shot plan.  Returned in scene-number order.
 */
const loadShotListData = (
  db: Db,
  projectId: string,
): ResultAsync<ShotListCsvScene[], DbError> =>
  ResultAsync.fromPromise(
    (async () => {
      const screenplay = await db.query.screenplays.findFirst({
        where: eq(screenplays.projectId, projectId),
        orderBy: (s, { desc }) => [desc(s.updatedAt)],
      });
      if (!screenplay) return [] as ShotListCsvScene[];

      const sceneRows = await db.query.scenes.findMany({
        where: eq(scenes.screenplayId, screenplay.id),
        orderBy: [asc(scenes.number)],
      });
      if (sceneRows.length === 0) return [] as ShotListCsvScene[];

      const sceneIds = sceneRows.map((s) => s.id);
      const planRows = await db
        .select()
        .from(shotPlans)
        .where(inArray(shotPlans.sceneId, sceneIds));

      const activeScenarioIds = planRows
        .map((p) => p.activeScenarioId)
        .filter((id): id is string => id !== null);

      const scenarioMap = new Map<string, string>(); // sceneId → activeScenarioId
      for (const p of planRows) {
        if (p.activeScenarioId) scenarioMap.set(p.sceneId, p.activeScenarioId);
      }

      const shotsByScenario = new Map<
        string,
        (typeof shots.$inferSelect)[]
      >();
      if (activeScenarioIds.length > 0) {
        const allShots = await db
          .select()
          .from(shots)
          .where(inArray(shots.scenarioId, activeScenarioIds))
          .orderBy(asc(shots.position));
        for (const shot of allShots) {
          const list = shotsByScenario.get(shot.scenarioId) ?? [];
          list.push(shot);
          shotsByScenario.set(shot.scenarioId, list);
        }
      }

      return sceneRows.map((scene): ShotListCsvScene => {
        const activeScenarioId = scenarioMap.get(scene.id) ?? null;
        const sceneShots = activeScenarioId
          ? (shotsByScenario.get(activeScenarioId) ?? [])
          : [];
        return {
          sceneNumber: scene.number,
          heading: `${scene.intExt}. ${scene.location} - ${scene.timeOfDay ?? "DAY"}`,
          shots: sceneShots.map((s) => ({
            position: s.position,
            size: s.shotSize,
            movement: s.cameraMovement,
            camera: s.cameraLabel,
            notes: s.notes ?? null,
            estimatedMinutes: s.estimatedMinutes ?? null,
          })),
        };
      });
    })(),
    (e) => new DbError("loadShotListData", e),
  );

// ─── Server functions ──────────────────────────────────────────────────────────

export const exportShotListCsv = createServerFn({ method: "POST" })
  .validator(z.object({ projectId: z.string().uuid() }))
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        { csv: string; filename: string },
        ProjectNotFoundError | ForbiddenError | DbError
      >
    > =>
      toShape(
        await withProjectAccess(data.projectId, "view", ({ db, access }) =>
          loadShotListData(db, data.projectId).map((sceneData) => ({
            csv: shotListToCsv(sceneData),
            filename: `${access.project.slug}-shot-list-${new Date().toISOString().slice(0, 10)}.csv`,
          })),
        ),
      ),
  );

export const exportShotListPdf = createServerFn({ method: "POST" })
  .validator(z.object({ projectId: z.string().uuid() }))
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        { pdfBase64: string; filename: string },
        ProjectNotFoundError | ForbiddenError | DbError
      >
    > =>
      toShape(
        await withProjectAccess(data.projectId, "view", ({ db, access }) =>
          loadShotListData(db, data.projectId).andThen((sceneData) =>
            ResultAsync.fromPromise(
              buildShotListPdf(access.project.title, sceneData),
              (e) => new DbError("exportShotListPdf/build", e),
            ).map((buf) => ({
              pdfBase64: buf.toString("base64"),
              filename: `${access.project.slug}-shot-list-${new Date().toISOString().slice(0, 10)}.pdf`,
            })),
          ),
        ),
      ),
  );

// ─── Test-only exports ─────────────────────────────────────────────────────────
// Exported for unit tests only. Not part of the public API.
export const __test__ = { loadShotListData };
