/**
 * ai-costs — prints the AI cost ledger (`ai_usage`) for the last 14 days,
 * grouped by day and then by operation x model within each day.
 *
 * Spec 83 (Wave 1) — the report side of the "stop the bleed" ledger: makes
 * the daily spend visible without opening psql or waiting on Langfuse.
 *
 * Usage:
 *   pnpm ai:costs
 */
import "./_load-env";
import { db } from "@oh-writers/db";
import { aiUsage } from "@oh-writers/db/schema";
import { gte } from "drizzle-orm";

const DAYS_BACK = 14;

interface UsageRow {
  readonly createdAt: Date;
  readonly operation: string;
  readonly model: string;
  readonly trigger: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheWriteTokens: number;
  readonly costUsd: string;
}

interface GroupTotals {
  readonly operation: string;
  readonly model: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
}

const toUtcDayKey = (date: Date): string => date.toISOString().slice(0, 10);

const formatUsd = (n: number): string => `$${n.toFixed(4)}`;

const padRight = (s: string, width: number): string =>
  s.length >= width ? s : s + " ".repeat(width - s.length);

const padLeft = (s: string, width: number): string =>
  s.length >= width ? s : " ".repeat(width - s.length) + s;

const printGroupTable = (groups: ReadonlyArray<GroupTotals>): void => {
  const header = [
    padRight("OPERATION", 32),
    padRight("MODEL", 24),
    padLeft("CALLS", 6),
    padLeft("INPUT", 10),
    padLeft("OUTPUT", 10),
    padLeft("CACHE R", 10),
    padLeft("CACHE W", 10),
    padLeft("COST", 10),
  ].join(" | ");
  console.log(`  ${header}`);
  console.log(`  ${"-".repeat(header.length)}`);
  for (const g of groups) {
    console.log(
      `  ${[
        padRight(g.operation, 32),
        padRight(g.model, 24),
        padLeft(String(g.calls), 6),
        padLeft(String(g.inputTokens), 10),
        padLeft(String(g.outputTokens), 10),
        padLeft(String(g.cacheReadTokens), 10),
        padLeft(String(g.cacheWriteTokens), 10),
        padLeft(formatUsd(g.costUsd), 10),
      ].join(" | ")}`,
    );
  }
};

const groupByOperationAndModel = (
  rows: ReadonlyArray<UsageRow>,
): GroupTotals[] => {
  const groups = new Map<string, GroupTotals>();
  for (const row of rows) {
    const key = `${row.operation}::${row.model}`;
    const existing = groups.get(key) ?? {
      operation: row.operation,
      model: row.model,
      calls: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      costUsd: 0,
    };
    existing.calls += 1;
    existing.inputTokens += row.inputTokens;
    existing.outputTokens += row.outputTokens;
    existing.cacheReadTokens += row.cacheReadTokens;
    existing.cacheWriteTokens += row.cacheWriteTokens;
    existing.costUsd += Number(row.costUsd);
    groups.set(key, existing);
  }
  return [...groups.values()].sort((a, b) => b.costUsd - a.costUsd);
};

async function printAiCosts(): Promise<void> {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - DAYS_BACK);
  since.setUTCHours(0, 0, 0, 0);

  const rows = (await db
    .select({
      createdAt: aiUsage.createdAt,
      operation: aiUsage.operation,
      model: aiUsage.model,
      trigger: aiUsage.trigger,
      inputTokens: aiUsage.inputTokens,
      outputTokens: aiUsage.outputTokens,
      cacheReadTokens: aiUsage.cacheReadTokens,
      cacheWriteTokens: aiUsage.cacheWriteTokens,
      costUsd: aiUsage.costUsd,
    })
    .from(aiUsage)
    .where(gte(aiUsage.createdAt, since))
    .orderBy(aiUsage.createdAt)) as UsageRow[];

  if (rows.length === 0) {
    console.log(`No ai_usage rows in the last ${DAYS_BACK} days.`);
    return;
  }

  const byDay = new Map<string, UsageRow[]>();
  for (const row of rows) {
    const key = toUtcDayKey(row.createdAt);
    const bucket = byDay.get(key) ?? [];
    bucket.push(row);
    byDay.set(key, bucket);
  }

  const sortedDays = [...byDay.keys()].sort();
  let grandTotalUsd = 0;

  for (const day of sortedDays) {
    const dayRows = byDay.get(day) ?? [];
    const dayTotalUsd = dayRows.reduce((s, r) => s + Number(r.costUsd), 0);
    grandTotalUsd += dayTotalUsd;

    console.log(
      `\n${day} — ${formatUsd(dayTotalUsd)} (${dayRows.length} calls)`,
    );
    printGroupTable(groupByOperationAndModel(dayRows));
  }

  console.log(
    `\nGRAND TOTAL (last ${DAYS_BACK} days): ${formatUsd(grandTotalUsd)} across ${rows.length} calls\n`,
  );
}

printAiCosts()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => process.exit(0));
