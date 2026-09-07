import { eq } from "drizzle-orm";
import { ResultAsync } from "neverthrow";
import { budgets } from "@oh-writers/db/schema";
import type { Db } from "~/server/db";
import { CesareError } from "~/features/predictions/cesare.errors";

/**
 * Spec 89b — AI disclosure stamp: permanent once true, never reset by a
 * later manual edit of a line. One flag per budget, not per line — Cesare's
 * budget tools mutate multiple lines in one call, same reasoning as
 * `schedules.everAiTouched`. Called from every write-tool call site in the
 * budget domain (chained via `.andThen`, mirroring
 * `cesare-schedule-tools.ts`'s `markScheduleAiTouched`) so the write happens
 * exactly once per call site instead of being copied.
 */
export const markBudgetAiTouched = (
  db: Db,
  projectId: string,
): ResultAsync<void, CesareError> =>
  ResultAsync.fromPromise(
    db
      .update(budgets)
      .set({ everAiTouched: true })
      .where(eq(budgets.projectId, projectId))
      .then(() => undefined),
    (e) =>
      new CesareError(
        `markBudgetAiTouched failed: ${e instanceof Error ? e.message : String(e)}`,
      ),
  );
