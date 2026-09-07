import { eq } from "drizzle-orm";
import { locationRequirements } from "@oh-writers/db/schema";
import type { Db } from "~/server/db";

/**
 * Spec 89b — AI disclosure stamp: permanent once true, never reset by a
 * later manual correction of the requirement/candidate. Shared by every
 * write path in the locations domain so the write happens exactly once per
 * call site instead of being copied. Mirrors
 * `breakdown/server/ai-disclosure.server.ts` — a per-requirement flag,
 * since Cesare's location tools do address individual requirements/
 * candidates (unlike budget/schedule tools, which mutate multiple rows per
 * call and so use a single project-level flag instead).
 *
 * `db` accepts both a plain `Db` and a transaction handle (`tx` from
 * `db.transaction(...)`) — both expose the same `.update()` surface.
 */
export const markLocationRequirementAiTouched = async (
  db: Pick<Db, "update">,
  requirementId: string,
  currentlyTouched: boolean,
): Promise<void> => {
  if (currentlyTouched) return;
  await db
    .update(locationRequirements)
    .set({ everAiTouched: true })
    .where(eq(locationRequirements.id, requirementId));
};
