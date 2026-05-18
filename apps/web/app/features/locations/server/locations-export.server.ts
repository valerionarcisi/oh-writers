import { createServerFn } from "@tanstack/start";
import { z } from "zod";
import { inArray } from "drizzle-orm";
import { ResultAsync } from "neverthrow";
import {
  locationRequirementScenes,
  scenes,
} from "@oh-writers/db/schema";
import { toShape, type ResultShape } from "@oh-writers/utils";
import { withProjectAccess } from "~/server/pipeline";
import { DbError, ForbiddenError } from "../locations.errors";
import { ProjectNotFoundError } from "~/features/projects";
import { loadRequirementsForProject } from "./locations-internal";
import { locationsToCsv } from "../lib/locations-export-csv";

const ExportInput = z.object({ projectId: z.string().uuid() });

const isoDate = () => new Date().toISOString().slice(0, 10);

export const exportLocationsCsv = createServerFn({ method: "POST" })
  .validator(ExportInput)
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
        await withProjectAccess(data.projectId, "view", ({ db, access }) => {
          const project = access.project;
          const filename = `${project.slug}-locations-${isoDate()}.csv`;

          return loadRequirementsForProject(db, project.id).andThen(
            (requirements) => {
              if (requirements.length === 0) {
                return ResultAsync.fromSafePromise(
                  Promise.resolve({ csv: locationsToCsv([], {}), filename }),
                );
              }

              const reqIds = requirements.map((r) => r.id);

              return ResultAsync.fromPromise(
                db
                  .select({
                    requirementId: locationRequirementScenes.requirementId,
                    sceneId: locationRequirementScenes.sceneId,
                  })
                  .from(locationRequirementScenes)
                  .where(inArray(locationRequirementScenes.requirementId, reqIds)),
                (e) => new DbError("exportLocationsCsv/loadReqScenes", e),
              ).andThen((reqScenes) => {
                if (reqScenes.length === 0) {
                  return ResultAsync.fromSafePromise(
                    Promise.resolve({
                      csv: locationsToCsv(requirements, {}),
                      filename,
                    }),
                  );
                }

                const sceneIds = [...new Set(reqScenes.map((rs) => rs.sceneId))];

                return ResultAsync.fromPromise(
                  db
                    .select({ id: scenes.id, number: scenes.number })
                    .from(scenes)
                    .where(inArray(scenes.id, sceneIds)),
                  (e) => new DbError("exportLocationsCsv/loadScenes", e),
                ).map((sceneRows) => {
                  const sceneNumberById = new Map(
                    sceneRows.map((s) => [s.id, s.number]),
                  );

                  const sceneNumbersByRequirementId: Record<string, number[]> = {};
                  for (const rs of reqScenes) {
                    const n = sceneNumberById.get(rs.sceneId);
                    if (n === undefined) continue;
                    const existing = sceneNumbersByRequirementId[rs.requirementId];
                    if (existing) {
                      existing.push(n);
                    } else {
                      sceneNumbersByRequirementId[rs.requirementId] = [n];
                    }
                  }

                  return {
                    csv: locationsToCsv(requirements, sceneNumbersByRequirementId),
                    filename,
                  };
                });
              });
            },
          );
        }),
      ),
  );
