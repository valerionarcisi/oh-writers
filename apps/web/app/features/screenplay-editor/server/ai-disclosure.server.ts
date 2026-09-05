import { and, eq } from "drizzle-orm";
import { screenplayVersions } from "@oh-writers/db/schema";
import { ResultAsync } from "neverthrow";
import { DbError } from "../screenplay.errors";
import type { Db } from "~/server/db";

/**
 * Spec 89 — AI disclosure stamp. True if ANY version in the screenplay's
 * full history has everAiTouched set, not just the currently active one —
 * switching the active version must not make the note disappear (permanence
 * is the spec's core invariant). screenplay_versions rows are never deleted
 * or reset by autosave (content updates in place, everAiTouched does not),
 * so this never flips back to false once true.
 */
export const loadScreenplayEverAiTouched = (
  db: Db,
  screenplayId: string,
): ResultAsync<boolean, DbError> =>
  ResultAsync.fromPromise(
    (async (): Promise<boolean> => {
      const touched = await db.query.screenplayVersions.findFirst({
        where: and(
          eq(screenplayVersions.screenplayId, screenplayId),
          eq(screenplayVersions.everAiTouched, true),
        ),
      });
      return touched !== undefined;
    })(),
    (e) => new DbError("screenplay/loadEverAiTouched", e),
  );
