import { and, eq, gte, sql } from "drizzle-orm";
import { ok, err, ResultAsync, type Result } from "neverthrow";
import { aiUsage } from "@oh-writers/db/schema";
import { getDb, type Db } from "~/server/db";
import { logger } from "~/server/logger";

// Spec 83 (Wave 1) — "stop the bleed": a ledger + a non-blocking budget
// signal, wired ahead of the full gateway facade (Wave 2+). Every real
// (non-mock) model call is recorded here; the daily budget only ever blocks
// `trigger: "background"` ambient flows, never a user-initiated one — a hard
// block mid-session with a director is worse than the cost it prevents.

export type AiUsageTrigger = "user" | "background";

export interface TokenUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheWriteTokens: number;
}

interface ModelRate {
  readonly input: number;
  readonly output: number;
}

// $/MTok. Cache read = 0.1x the input rate, cache write = 1.25x — the
// Anthropic-published multipliers, kept next to the table so a new tier is a
// one-line addition. Keyed by prefix (not exact match) because Anthropic
// dated model IDs (e.g. `claude-haiku-4-5-20251001`) carry a release suffix.
const PRICING_TABLE: ReadonlyArray<{ prefix: string; rate: ModelRate }> = [
  { prefix: "claude-haiku-4-5", rate: { input: 1.0, output: 5.0 } },
  { prefix: "claude-sonnet-5", rate: { input: 3.0, output: 15.0 } },
  { prefix: "claude-sonnet-4", rate: { input: 3.0, output: 15.0 } },
];

// Never throw on pricing — an unknown/future model ID must not crash the
// call it's billing for. Falls back to the current default tier's rate
// (sonnet-5) so cost is at least approximated rather than silently zero.
const FALLBACK_RATE: ModelRate = { input: 3.0, output: 15.0 };

const resolveRate = (model: string): ModelRate =>
  PRICING_TABLE.find((entry) => model.startsWith(entry.prefix))?.rate ??
  FALLBACK_RATE;

export const computeCostUsd = (model: string, usage: TokenUsage): number => {
  const rate = resolveRate(model);
  const inputCost = (usage.inputTokens * rate.input) / 1_000_000;
  const outputCost = (usage.outputTokens * rate.output) / 1_000_000;
  const cacheReadCost = (usage.cacheReadTokens * rate.input * 0.1) / 1_000_000;
  const cacheWriteCost =
    (usage.cacheWriteTokens * rate.input * 1.25) / 1_000_000;
  return inputCost + outputCost + cacheReadCost + cacheWriteCost;
};

const isMockMode = (): boolean => process.env["MOCK_AI"] === "true";

export interface RecordAiUsageParams {
  readonly operation: string;
  readonly model: string;
  readonly trigger: AiUsageTrigger;
  readonly usage: TokenUsage;
  // BYOK preparation (Spec 84 wires per-user attribution end to end). Most
  // Wave 1 call sites do not thread a userId through yet — omitted/undefined
  // writes a null row, which is fine until that spec lands.
  readonly userId?: string;
}

// Fire-safe by construction: a ledger write failure must never fail the AI
// call it is billing for, so this never returns a Result — it logs and
// resolves either way. Skipped entirely under MOCK_AI (mock calls have no
// real cost and would pollute the ledger / trip the budget guard in tests).
export const recordAiUsage = async (
  params: RecordAiUsageParams,
  db?: Db,
): Promise<void> => {
  if (isMockMode()) return;
  const costUsd = computeCostUsd(params.model, params.usage);
  // getDb() must live INSIDE the guard: a rejected db-module init would
  // otherwise reject recordAiUsage and fail the (already billed, already
  // succeeded) AI call it is metering — review finding, Spec 83 W1.
  await ResultAsync.fromPromise(
    (async () => {
      const resolvedDb = db ?? (await getDb());
      return resolvedDb.insert(aiUsage).values({
        operation: params.operation,
        model: params.model,
        trigger: params.trigger,
        userId: params.userId ?? null,
        inputTokens: params.usage.inputTokens,
        outputTokens: params.usage.outputTokens,
        cacheReadTokens: params.usage.cacheReadTokens,
        cacheWriteTokens: params.usage.cacheWriteTokens,
        costUsd: costUsd.toFixed(6),
      });
    })(),
    (e) => e,
  ).match(
    () => undefined,
    (cause) =>
      logger.error(
        { operation: params.operation, cause: String(cause) },
        "ai.usage.record_failed",
      ),
  );
};

export class AiBudgetExceededError {
  readonly _tag = "AiBudgetExceededError" as const;
  readonly message: string;
  constructor(
    readonly trigger: AiUsageTrigger,
    readonly spentUsd: number,
    readonly capUsd: number,
  ) {
    this.message = `AI background budget exceeded: $${spentUsd.toFixed(2)} spent of $${capUsd.toFixed(2)} cap`;
  }
}

const DEFAULT_TOTAL_BUDGET_USD = 5;
const DEFAULT_BACKGROUND_BUDGET_USD = 1;

const readBudgetEnv = (envVar: string, fallback: number): number => {
  const raw = process.env[envVar];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const startOfUtcDay = (): Date => {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
};

const sumCostUsd = async (
  db: Db,
  where: ReturnType<typeof and>,
): Promise<number> => {
  const rows = await db
    .select({ total: sql<string | null>`sum(${aiUsage.costUsd})` })
    .from(aiUsage)
    .where(where);
  return Number(rows[0]?.total ?? 0);
};

// Tracks whether the soft total-budget warning has already fired today, so a
// hot path (every user call) logs it once per process per day instead of on
// every request — "keep it simple" per the spec's own call.
let lastSoftWarningUtcDay: string | null = null;

const maybeWarnSoftBudget = (totalSpentUsd: number, capUsd: number): void => {
  if (totalSpentUsd < capUsd) return;
  const today = startOfUtcDay().toISOString();
  if (lastSoftWarningUtcDay === today) return;
  lastSoftWarningUtcDay = today;
  logger.warn(
    { totalSpentUsd, capUsd },
    "ai.usage.daily_budget_soft_threshold_crossed",
  );
};

// checkDailyBudget — the ONLY guard in the pipeline, called before the
// provider call.
//
// - trigger "user": NEVER blocked. Runaway protection for user flows is the
//   existing call timeouts (45s/90s), stepCountIs(5) and maxRetries(1) — a
//   hard budget block firing mid-session with a director is worse than the
//   cost it prevents. Crossing the total budget (AI_DAILY_BUDGET_USD) only
//   logs a structured warning (once/process/day); it never rejects.
// - trigger "background": hard-capped by AI_DAILY_BUDGET_BACKGROUND_USD.
//   Over cap -> AiBudgetExceededError; the ambient flow degrades silently
//   (log + skip, stale data stays) — a bugged background flow stops itself
//   before the director ever notices.
//
// Skipped entirely under MOCK_AI (always ok).
export const checkDailyBudget = async (
  trigger: AiUsageTrigger,
  db?: Db,
): Promise<Result<void, AiBudgetExceededError>> => {
  if (isMockMode()) return ok(undefined);

  // Fail-open by construction, like recordAiUsage: a broken ledger (DB down,
  // migration missing) must never take the AI call down with it — the guard
  // exists to protect cost, not to add a new failure mode to Cesare.
  const guarded = await ResultAsync.fromPromise(
    checkDailyBudgetUnsafe(trigger, db),
    (e) => e,
  );
  return guarded.match(
    (result) => result,
    (cause) => {
      logger.warn(
        { trigger, cause: String(cause) },
        "ai.usage.budget_check_failed_open",
      );
      return ok(undefined);
    },
  );
};

const checkDailyBudgetUnsafe = async (
  trigger: AiUsageTrigger,
  db?: Db,
): Promise<Result<void, AiBudgetExceededError>> => {
  const resolvedDb = db ?? (await getDb());
  const dayStart = startOfUtcDay();

  const totalSpentUsd = await sumCostUsd(
    resolvedDb,
    gte(aiUsage.createdAt, dayStart),
  );
  const totalBudgetUsd = readBudgetEnv(
    "AI_DAILY_BUDGET_USD",
    DEFAULT_TOTAL_BUDGET_USD,
  );
  maybeWarnSoftBudget(totalSpentUsd, totalBudgetUsd);

  if (trigger === "user") return ok(undefined);

  const backgroundSpentUsd = await sumCostUsd(
    resolvedDb,
    and(gte(aiUsage.createdAt, dayStart), eq(aiUsage.trigger, "background")),
  );
  const backgroundBudgetUsd = readBudgetEnv(
    "AI_DAILY_BUDGET_BACKGROUND_USD",
    DEFAULT_BACKGROUND_BUDGET_USD,
  );

  return backgroundSpentUsd >= backgroundBudgetUsd
    ? err(
        new AiBudgetExceededError(
          "background",
          backgroundSpentUsd,
          backgroundBudgetUsd,
        ),
      )
    : ok(undefined);
};

// Test-only escape hatch: the soft-warning dedupe is process-global state,
// which would otherwise leak between unit test cases.
export const __resetSoftBudgetWarningForTests = (): void => {
  lastSoftWarningUtcDay = null;
};
