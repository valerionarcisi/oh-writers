import { createServerFn } from "@tanstack/start";
import { z } from "zod";
import { eq, ne } from "drizzle-orm";
import { ResultAsync, errAsync, okAsync } from "neverthrow";
import {
  fundraisingSources,
  fundraisingOpportunities,
  type FundraisingOpportunity,
} from "@oh-writers/db/schema";
import { toShape, type ResultShape } from "@oh-writers/utils";
import { requireUser } from "~/server/context";
import { getDb } from "~/server/db";
import { ingestSource, type IngestSummary } from "./rss.server";
import {
  DbError,
  FundraisingSourceNotFoundError,
  FundraisingFetchError,
  FundraisingParseError,
  FundraisingThrottledError,
} from "../fundraising.errors";

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
