import { createServerFn } from "@tanstack/start";
import { z } from "zod";
import { and, eq, ne, inArray } from "drizzle-orm";
import { ResultAsync, errAsync, okAsync, ok } from "neverthrow";
import {
  fundraisingSources,
  fundraisingOpportunities,
  fundraisingSaves,
  FUNDRAISING_OPPORTUNITY_KINDS,
  FUNDRAISING_SAVE_STATES,
  type FundraisingOpportunity,
  type FundraisingSaveState,
} from "@oh-writers/db/schema";
import { toShape, type ResultShape } from "@oh-writers/utils";
import { requireUser } from "~/server/context";
import { getDb, type Db } from "~/server/db";
import { withProjectAccess } from "~/server/pipeline";
import type { ProjectAccessError } from "~/server/access";
import { ingestSource, type IngestSummary } from "./rss.server";
import {
  DbError,
  FundraisingSourceNotFoundError,
  FundraisingFetchError,
  FundraisingParseError,
  FundraisingThrottledError,
} from "../fundraising.errors";

export type OpportunityWithSave = FundraisingOpportunity & {
  saveState: FundraisingSaveState | null;
  saveNotes: string | null;
};

class FundraisingOpportunityNotFoundError {
  readonly _tag = "FundraisingOpportunityNotFoundError" as const;
  readonly message: string;
  constructor(readonly id: string) {
    this.message = `Fundraising opportunity not found: ${id}`;
  }
}

type TriggerError =
  | DbError
  | FundraisingSourceNotFoundError
  | FundraisingFetchError
  | FundraisingParseError
  | FundraisingThrottledError;

/**
 * Manually trigger ingestion for one source. Throttled to 1 fetch / 60s per source.
 * Available to any authenticated user — sources are global or team-scoped, never
 * project-scoped, so we don't gate on project access here.
 */
export const triggerIngest = createServerFn({ method: "POST" })
  .validator(z.object({ sourceId: z.string().uuid() }))
  .handler(
    async ({ data }): Promise<ResultShape<IngestSummary, TriggerError>> => {
      await requireUser();
      const db = await getDb();
      const result = await ResultAsync.fromPromise(
        db
          .select()
          .from(fundraisingSources)
          .where(eq(fundraisingSources.id, data.sourceId))
          .limit(1),
        (e) => new DbError("findFundraisingSource", e) as TriggerError,
      )
        .andThen((rows) => {
          const source = rows[0];
          return source
            ? okAsync(source)
            : errAsync(
                new FundraisingSourceNotFoundError(
                  data.sourceId,
                ) as TriggerError,
              );
        })
        .andThen((source) => ingestSource(db, source));
      return toShape(result);
    },
  );

export const getOpportunityByItemId = createServerFn({ method: "GET" })
  .validator(z.object({ itemId: z.string().uuid() }))
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        FundraisingOpportunity,
        FundraisingOpportunityNotFoundError | DbError
      >
    > => {
      await requireUser();
      const db = await getDb();
      const result = await ResultAsync.fromPromise(
        db
          .select()
          .from(fundraisingOpportunities)
          .where(eq(fundraisingOpportunities.itemId, data.itemId))
          .limit(1),
        (e) =>
          new DbError("findOpportunityByItemId", e) as
            | FundraisingOpportunityNotFoundError
            | DbError,
      ).andThen((rows) => {
        const row = rows[0];
        return row
          ? okAsync(row)
          : errAsync(
              new FundraisingOpportunityNotFoundError(data.itemId) as
                | FundraisingOpportunityNotFoundError
                | DbError,
            );
      });
      return toShape(result);
    },
  );

const FiltersSchema = z
  .object({
    kind: z.array(z.enum(FUNDRAISING_OPPORTUNITY_KINDS)).optional(),
    status: z.enum(["active", "expired", "unknown"]).optional(),
    deadlineWithin: z.enum(["30d", "90d", "any"]).optional(),
  })
  .optional();

export const listOpportunitiesForProject = createServerFn({ method: "GET" })
  .validator(
    z.object({
      projectId: z.string().uuid(),
      filters: FiltersSchema,
    }),
  )
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<OpportunityWithSave[], DbError | ProjectAccessError>
    > => {
      const filters = data.filters;
      const now = new Date();

      const buildResult = (
        db: Db,
      ): ResultAsync<OpportunityWithSave[], DbError> => {
        const conditions = [ne(fundraisingOpportunities.kind, "other")];
        if (filters?.kind && filters.kind.length > 0) {
          conditions.push(inArray(fundraisingOpportunities.kind, filters.kind));
        }
        if (filters?.status) {
          conditions.push(eq(fundraisingOpportunities.status, filters.status));
        }

        return ResultAsync.fromPromise(
          db
            .select()
            .from(fundraisingOpportunities)
            .where(and(...conditions)),
          (e) => new DbError("listOpportunitiesForProject", e),
        )
          .andThen((opps) => {
            if (opps.length === 0) return okAsync([] as OpportunityWithSave[]);
            const oppIds = opps.map((o) => o.id);
            return ResultAsync.fromPromise(
              db
                .select()
                .from(fundraisingSaves)
                .where(
                  and(
                    eq(fundraisingSaves.projectId, data.projectId),
                    inArray(fundraisingSaves.opportunityId, oppIds),
                  ),
                ),
              (e) => new DbError("listSavesForProject", e),
            ).map((savesRows) => {
              const saveMap = new Map(
                savesRows.map((s) => [s.opportunityId, s]),
              );
              return opps.map((opp) => {
                const save = saveMap.get(opp.id);
                return {
                  ...opp,
                  saveState: save?.state ?? null,
                  saveNotes: save?.notes ?? null,
                } satisfies OpportunityWithSave;
              });
            });
          })
          .map((result) => {
            if (!filters?.deadlineWithin || filters.deadlineWithin === "any")
              return result;
            const days = filters.deadlineWithin === "30d" ? 30 : 90;
            const cutoff = new Date(now.getTime() + days * 86_400_000);
            return result.filter(
              (o) => o.deadlineAt != null && o.deadlineAt <= cutoff,
            );
          });
      };

      return toShape(
        await withProjectAccess(data.projectId, "view", ({ db }) =>
          buildResult(db),
        ),
      );
    },
  );

export const saveOpportunity = createServerFn({ method: "POST" })
  .validator(
    z.object({
      opportunityId: z.string().uuid(),
      projectId: z.string().uuid(),
      state: z.enum(FUNDRAISING_SAVE_STATES),
      notes: z.string().optional(),
    }),
  )
  .handler(
    async ({
      data,
    }): Promise<ResultShape<{ id: string }, DbError | ProjectAccessError>> =>
      toShape(
        await withProjectAccess(data.projectId, "view", ({ db, access }) =>
          ResultAsync.fromPromise(
            db
              .insert(fundraisingSaves)
              .values({
                opportunityId: data.opportunityId,
                projectId: data.projectId,
                userId: access.user.id,
                state: data.state,
                notes: data.notes ?? null,
              })
              .onConflictDoUpdate({
                target: [
                  fundraisingSaves.opportunityId,
                  fundraisingSaves.projectId,
                ],
                set: {
                  state: data.state,
                  notes: data.notes ?? null,
                  updatedAt: new Date(),
                },
              })
              .returning({ id: fundraisingSaves.id }),
            (e) => new DbError("saveOpportunity", e),
          ).andThen((rows) => {
            const row = rows[0];
            return row
              ? okAsync({ id: row.id })
              : errAsync(new DbError("saveOpportunity:noReturn", null));
          }),
        ),
      ),
  );

export const getOpportunity = createServerFn({ method: "GET" })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        FundraisingOpportunity,
        FundraisingOpportunityNotFoundError | DbError
      >
    > => {
      await requireUser();
      const db = await getDb();
      const result = await ResultAsync.fromPromise(
        db
          .select()
          .from(fundraisingOpportunities)
          .where(eq(fundraisingOpportunities.id, data.id))
          .limit(1),
        (e) =>
          new DbError("findOpportunity", e) as
            | FundraisingOpportunityNotFoundError
            | DbError,
      ).andThen((rows) => {
        const row = rows[0];
        return row
          ? okAsync(row)
          : errAsync(
              new FundraisingOpportunityNotFoundError(data.id) as
                | FundraisingOpportunityNotFoundError
                | DbError,
            );
      });
      return toShape(result);
    },
  );

export const listOpportunities = createServerFn({ method: "GET" })
  .validator(z.object({ excludeOther: z.boolean().optional() }))
  .handler(
    async ({
      data,
    }): Promise<ResultShape<FundraisingOpportunity[], DbError>> => {
      await requireUser();
      const db = await getDb();
      const result = await ResultAsync.fromPromise(
        data.excludeOther
          ? db
              .select()
              .from(fundraisingOpportunities)
              .where(ne(fundraisingOpportunities.kind, "other"))
          : db.select().from(fundraisingOpportunities),
        (e) => new DbError("listOpportunities", e),
      );
      return toShape(result);
    },
  );
