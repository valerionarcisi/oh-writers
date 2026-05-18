import { createServerFn } from "@tanstack/start";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { ResultAsync, errAsync, okAsync } from "neverthrow";
import { fundraisingSources } from "@oh-writers/db/schema";
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
    async ({
      data,
    }): Promise<ResultShape<IngestSummary, TriggerError>> => {
      await requireUser();
      const db = await getDb();
      const result = await ResultAsync.fromPromise(
        db
          .select()
          .from(fundraisingSources)
          .where(eq(fundraisingSources.id, data.sourceId))
          .limit(1),
        (e) => new DbError("findFundraisingSource", e) as TriggerError,
      ).andThen((rows) => {
        const source = rows[0];
        return source
          ? okAsync(source)
          : errAsync(
              new FundraisingSourceNotFoundError(
                data.sourceId,
              ) as TriggerError,
            );
      }).andThen((source) => ingestSource(db, source));
      return toShape(result);
    },
  );
