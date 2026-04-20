import { createServerFn } from "@tanstack/start";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { ResultAsync, err } from "neverthrow";
import {
  breakdownOccurrences,
  breakdownSceneState,
  breakdownElements,
  scenes,
} from "@oh-writers/db/schema";
import { toShape, type ResultShape } from "@oh-writers/utils";
import { requireUser } from "~/server/context";
import { getDb } from "~/server/db";
import { DbError, ForbiddenError } from "../breakdown.errors";
import { canEditBreakdown } from "../lib/permissions";
import { hashSceneText } from "../lib/hash-scene";
import { findElementInText } from "../lib/re-match";
import { resolveBreakdownAccessByScreenplayVersion } from "./breakdown-access";

export const cloneBreakdownToVersion = createServerFn({ method: "POST" })
  .validator(
    z.object({
      fromVersionId: z.string().uuid(),
      toVersionId: z.string().uuid(),
    }),
  )
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        { cloned: number; staleCount: number },
        ForbiddenError | DbError
      >
    > => {
      const user = await requireUser();
      const db = await getDb();

      const accessResult = await resolveBreakdownAccessByScreenplayVersion(
        db,
        user.id,
        data.toVersionId,
      );
      if (accessResult.isErr()) return toShape(err(accessResult.error));
      if (!canEditBreakdown(accessResult.value))
        return toShape(err(new ForbiddenError("clone breakdown")));

      const result = await ResultAsync.fromPromise(
        (async () => {
          const sourceRows = await db
            .select({
              occ: breakdownOccurrences,
              el: breakdownElements,
              scene: scenes,
            })
            .from(breakdownOccurrences)
            .innerJoin(
              breakdownElements,
              eq(breakdownOccurrences.elementId, breakdownElements.id),
            )
            .innerJoin(scenes, eq(scenes.id, breakdownOccurrences.sceneId))
            .where(
              eq(breakdownOccurrences.screenplayVersionId, data.fromVersionId),
            );

          let cloned = 0;
          let staleCount = 0;
          const sceneHashes = new Map<string, string>();

          for (const r of sourceRows) {
            const sceneText = r.scene.heading + "\n" + (r.scene.notes ?? "");
            const isStale = !findElementInText(r.el.name, sceneText);
            if (isStale) staleCount++;

            await db
              .insert(breakdownOccurrences)
              .values({
                elementId: r.el.id,
                screenplayVersionId: data.toVersionId,
                sceneId: r.scene.id,
                quantity: r.occ.quantity,
                note: r.occ.note,
                cesareStatus: r.occ.cesareStatus,
                isStale,
              })
              .onConflictDoNothing();
            cloned++;

            if (!sceneHashes.has(r.scene.id)) {
              sceneHashes.set(r.scene.id, hashSceneText(sceneText));
            }
          }

          for (const [sceneId, hash] of sceneHashes) {
            await db
              .insert(breakdownSceneState)
              .values({
                sceneId,
                screenplayVersionId: data.toVersionId,
                textHash: hash,
              })
              .onConflictDoUpdate({
                target: [
                  breakdownSceneState.sceneId,
                  breakdownSceneState.screenplayVersionId,
                ],
                set: { textHash: hash },
              });
          }

          return { cloned, staleCount };
        })(),
        (e) => new DbError("cloneBreakdownToVersion", e),
      );

      return toShape(result);
    },
  );
