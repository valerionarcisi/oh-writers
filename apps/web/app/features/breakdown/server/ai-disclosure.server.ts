import { eq } from "drizzle-orm";
import { breakdownElements } from "@oh-writers/db/schema";
import type { Db } from "~/server/db";

/**
 * Spec 89 — AI disclosure stamp: permanent once true, never reset by a
 * later manual correction of the occurrence itself. Shared by every path
 * that inserts a Cesare-sourced breakdown occurrence (auto-spoglio,
 * cesare-suggest, and the live Cesare tool) so the write happens exactly
 * once per call site instead of being copied.
 *
 * `db` accepts both a plain `Db` and a transaction handle (`tx` from
 * `db.transaction(...)`) — both expose the same `.update()` surface.
 */
export const markBreakdownElementAiTouched = async (
  db: Pick<Db, "update">,
  elementId: string,
  currentlyTouched: boolean,
): Promise<void> => {
  if (currentlyTouched) return;
  await db
    .update(breakdownElements)
    .set({ everAiTouched: true })
    .where(eq(breakdownElements.id, elementId));
};
