import { ResultAsync, err, ok, type Result } from "neverthrow";
import { and, eq } from "drizzle-orm";
import { breakdownRateLimits } from "@oh-writers/db/schema";
import { DbError } from "@oh-writers/utils";
import { BreakdownRateLimitedError } from "../breakdown.errors";
import type { Db } from "~/server/db";

type RateLimitErr = BreakdownRateLimitedError | DbError;

export const checkAndStampRateLimit = (
  db: Db,
  projectId: string,
  action: string,
  cooldownMs: number,
): ResultAsync<void, RateLimitErr> =>
  ResultAsync.fromPromise(
    db.query.breakdownRateLimits
      .findFirst({
        where: and(
          eq(breakdownRateLimits.projectId, projectId),
          eq(breakdownRateLimits.action, action),
        ),
      })
      .then((r) => r ?? null),
    (e) => new DbError("checkRateLimit/load", e),
  ).andThen<void, RateLimitErr>(
    (row): ResultAsync<void, RateLimitErr> | Result<void, RateLimitErr> => {
      const now = Date.now();
      if (row && now - row.lastInvokedAt.getTime() < cooldownMs) {
        const retryAfterMs = cooldownMs - (now - row.lastInvokedAt.getTime());
        return err(new BreakdownRateLimitedError(retryAfterMs));
      }
      return ResultAsync.fromPromise(
        db
          .insert(breakdownRateLimits)
          .values({ projectId, action, lastInvokedAt: new Date(now) })
          .onConflictDoUpdate({
            target: [breakdownRateLimits.projectId, breakdownRateLimits.action],
            set: { lastInvokedAt: new Date(now) },
          }),
        (e): RateLimitErr => new DbError("checkRateLimit/stamp", e),
      ).andThen(() => ok(undefined));
    },
  );
