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

// ─── Full stats (settings/ai/stats) ─────────────────────────────────────────

export interface AiUsageBreakdownRow {
  readonly key: string;
  readonly calls: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly costUsd: number;
}

export interface AiUsageStats {
  readonly windowDays: number;
  readonly totals: Omit<AiUsageBreakdownRow, "key">;
  readonly byModel: AiUsageBreakdownRow[];
  readonly byOperation: AiUsageBreakdownRow[];
}

const STATS_WINDOW_DAYS = 30;

export const getMyAiUsageStats = createServerFn({ method: "GET" }).handler(
  async (): Promise<AiUsageStats> => {
    const { requireUser } = await import("~/server/context");
    const { getDb } = await import("~/server/db");
    const user = await requireUser();
    const db = await getDb();
    const since = new Date(Date.now() - STATS_WINDOW_DAYS * 24 * 60 * 60_000);
    const scope = and(
      eq(aiUsage.userId, user.id),
      gte(aiUsage.createdAt, since),
    );

    const aggregate = {
      calls: sql<string>`count(*)`,
      inputTokens: sql<string>`sum(${aiUsage.inputTokens})`,
      outputTokens: sql<string>`sum(${aiUsage.outputTokens})`,
      costUsd: sql<string>`sum(${aiUsage.costUsd})`,
    };
    const toRow = (r: {
      key?: string;
      calls: string;
      inputTokens: string | null;
      outputTokens: string | null;
      costUsd: string | null;
    }): AiUsageBreakdownRow => ({
      key: r.key ?? "",
      calls: Number(r.calls),
      inputTokens: Number(r.inputTokens ?? 0),
      outputTokens: Number(r.outputTokens ?? 0),
      costUsd: Number(r.costUsd ?? 0),
    });

    const [totals] = await db.select(aggregate).from(aiUsage).where(scope);
    const byModel = await db
      .select({ key: aiUsage.model, ...aggregate })
      .from(aiUsage)
      .where(scope)
      .groupBy(aiUsage.model)
      .orderBy(sql`sum(${aiUsage.costUsd}) DESC`);
    const byOperation = await db
      .select({ key: aiUsage.operation, ...aggregate })
      .from(aiUsage)
      .where(scope)
      .groupBy(aiUsage.operation)
      .orderBy(sql`sum(${aiUsage.costUsd}) DESC`);

    const { key: _unused, ...totalsRow } = toRow({
      calls: totals?.calls ?? "0",
      inputTokens: totals?.inputTokens ?? null,
      outputTokens: totals?.outputTokens ?? null,
      costUsd: totals?.costUsd ?? null,
    });
    return {
      windowDays: STATS_WINDOW_DAYS,
      totals: totalsRow,
      byModel: byModel.map(toRow),
      byOperation: byOperation.map(toRow),
    };
  },
);

export const aiUsageStatsQueryOptions = () =>
  queryOptions({
    queryKey: ["ai-usage", "stats"],
    queryFn: () => getMyAiUsageStats(),
    staleTime: 60_000,
  });
