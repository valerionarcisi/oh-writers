import { createServerFn } from "@tanstack/start";
import { queryOptions } from "@tanstack/react-query";
import { and, eq, gte, sql } from "drizzle-orm";
import { aiUsage } from "@oh-writers/db/schema";

// Spec 84 follow-up (2026-07-13) — per-user daily AI spend for the usage
// chart in /settings/ai. Reads the Spec 83 `ai_usage` ledger (every real
// model call, platform AND BYOK) aggregated by UTC day.

export interface AiUsageDay {
  /** UTC day, `YYYY-MM-DD`. */
  readonly day: string;
  readonly costUsd: number;
}

const USAGE_WINDOW_DAYS = 14;

export const getMyAiUsageDaily = createServerFn({ method: "GET" }).handler(
  async (): Promise<AiUsageDay[]> => {
    const { requireUser } = await import("~/server/context");
    const { getDb } = await import("~/server/db");
    const user = await requireUser();
    const db = await getDb();

    const day = sql<string>`to_char(date_trunc('day', ${aiUsage.createdAt} AT TIME ZONE 'UTC'), 'YYYY-MM-DD')`;
    const since = new Date(Date.now() - USAGE_WINDOW_DAYS * 24 * 60 * 60_000);

    const rows = await db
      .select({ day, cost: sql<string>`sum(${aiUsage.costUsd})` })
      .from(aiUsage)
      .where(and(eq(aiUsage.userId, user.id), gte(aiUsage.createdAt, since)))
      .groupBy(day)
      .orderBy(day);

    return rows.map((r) => ({ day: r.day, costUsd: Number(r.cost) }));
  },
);

export const aiUsageDailyQueryOptions = () =>
  queryOptions({
    queryKey: ["ai-usage", "daily"],
    queryFn: () => getMyAiUsageDaily(),
    staleTime: 60_000,
  });
