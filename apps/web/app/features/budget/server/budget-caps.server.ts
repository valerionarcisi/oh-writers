import { createServerFn } from "@tanstack/start";
import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { ResultAsync } from "neverthrow";
import { budgetCaps, TOP_SHEETS } from "@oh-writers/db/schema";
import { toShape, type ResultShape } from "@oh-writers/utils";
import { getDb } from "~/server/db";
import { withProjectAccess } from "~/server/pipeline";
import { DbError, ForbiddenError } from "../budget.errors";
import { ProjectNotFoundError } from "~/features/projects";

// A `topSheet === null` cap is the global project cap. Non-null is per-bucket.

export type BudgetCapScope =
  | { readonly kind: "global" }
  | {
      readonly kind: "topsheet";
      readonly topSheet: (typeof TOP_SHEETS)[number];
    };

export const BudgetCapScopeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("global") }),
  z.object({
    kind: z.literal("topsheet"),
    topSheet: z.enum(TOP_SHEETS),
  }),
]);

export interface BudgetCapDto {
  readonly id: string;
  readonly projectId: string;
  readonly topSheet: string | null;
  readonly amountCents: number;
}

const toDto = (row: typeof budgetCaps.$inferSelect): BudgetCapDto => ({
  id: row.id,
  projectId: row.projectId,
  topSheet: row.topSheet,
  amountCents: row.amountCents,
});

// ─── getBudgetCaps ───────────────────────────────────────────────────────────

export const getBudgetCaps = createServerFn({ method: "GET" })
  .validator(z.object({ projectId: z.string().uuid() }))
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        BudgetCapDto[],
        ProjectNotFoundError | ForbiddenError | DbError
      >
    > =>
      toShape(
        await withProjectAccess(data.projectId, "view", ({ db, access }) =>
          ResultAsync.fromPromise(
            db
              .select()
              .from(budgetCaps)
              .where(eq(budgetCaps.projectId, access.project.id)),
            (e) => new DbError("getBudgetCaps", e),
          ).map((rows) => rows.map(toDto)),
        ),
      ),
  );

// ─── setBudgetCap ────────────────────────────────────────────────────────────

export const setBudgetCap = createServerFn({ method: "POST" })
  .validator(
    z.object({
      projectId: z.string().uuid(),
      scope: BudgetCapScopeSchema,
      amountCents: z.number().int().min(0),
    }),
  )
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<BudgetCapDto, ProjectNotFoundError | ForbiddenError | DbError>
    > =>
      toShape(
        await withProjectAccess(data.projectId, "edit", ({ db, access }) =>
          ResultAsync.fromPromise(
            (async (): Promise<BudgetCapDto> => {
              const projectId = access.project.id;
              const topSheet =
                data.scope.kind === "global" ? null : data.scope.topSheet;

              const existing = await db
                .select()
                .from(budgetCaps)
                .where(
                  and(
                    eq(budgetCaps.projectId, projectId),
                    topSheet === null
                      ? isNull(budgetCaps.topSheet)
                      : eq(budgetCaps.topSheet, topSheet),
                  ),
                )
                .limit(1);

              if (existing[0]) {
                const [updated] = await db
                  .update(budgetCaps)
                  .set({
                    amountCents: data.amountCents,
                    updatedAt: new Date(),
                  })
                  .where(eq(budgetCaps.id, existing[0].id))
                  .returning();
                return toDto(updated!);
              }

              const [inserted] = await db
                .insert(budgetCaps)
                .values({
                  projectId,
                  topSheet,
                  amountCents: data.amountCents,
                })
                .returning();
              return toDto(inserted!);
            })(),
            (e) => new DbError("setBudgetCap", e),
          ),
        ),
      ),
  );

// ─── removeBudgetCap ─────────────────────────────────────────────────────────

export const removeBudgetCap = createServerFn({ method: "POST" })
  .validator(
    z.object({
      projectId: z.string().uuid(),
      scope: BudgetCapScopeSchema,
    }),
  )
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        { removed: boolean },
        ProjectNotFoundError | ForbiddenError | DbError
      >
    > =>
      toShape(
        await withProjectAccess(data.projectId, "edit", ({ db, access }) =>
          ResultAsync.fromPromise(
            (async () => {
              const projectId = access.project.id;
              const topSheet =
                data.scope.kind === "global" ? null : data.scope.topSheet;
              await db
                .delete(budgetCaps)
                .where(
                  and(
                    eq(budgetCaps.projectId, projectId),
                    topSheet === null
                      ? isNull(budgetCaps.topSheet)
                      : eq(budgetCaps.topSheet, topSheet),
                  ),
                );
              return { removed: true };
            })(),
            (e) => new DbError("removeBudgetCap", e),
          ),
        ),
      ),
  );

// ─── readBudgetCaps (pure helper for executors) ─────────────────────────────
//
// Reused by the Cesare `evaluate_against_cap` tool, which already runs inside
// `withProjectAccess`. Skip the auth dance and read directly.

export const readBudgetCapsForProject = (
  db: Awaited<ReturnType<typeof getDb>>,
  projectId: string,
): ResultAsync<BudgetCapDto[], DbError> =>
  ResultAsync.fromPromise(
    db
      .select()
      .from(budgetCaps)
      .where(eq(budgetCaps.projectId, projectId))
      .then((rows) => rows.map(toDto)),
    (e) => new DbError("readBudgetCapsForProject", e),
  );
