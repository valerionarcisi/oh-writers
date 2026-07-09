import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  computeCostUsd,
  recordAiUsage,
  checkDailyBudget,
  AiBudgetExceededError,
  __resetSoftBudgetWarningForTests,
  type TokenUsage,
} from "./ai-usage.server";
import type { Db } from "~/server/db";

vi.mock("~/server/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const ZERO_USAGE: TokenUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};

describe("computeCostUsd — pricing map", () => {
  it("computes input token cost at the model's input rate", () => {
    const cost = computeCostUsd("claude-haiku-4-5-20251001", {
      ...ZERO_USAGE,
      inputTokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(1.0, 6);
  });

  it("computes output token cost at the model's output rate", () => {
    const cost = computeCostUsd("claude-haiku-4-5-20251001", {
      ...ZERO_USAGE,
      outputTokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(5.0, 6);
  });

  it("computes cache-read token cost at 0.1x the input rate", () => {
    const cost = computeCostUsd("claude-sonnet-5", {
      ...ZERO_USAGE,
      cacheReadTokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(0.3, 6); // 3.0 * 0.1
  });

  it("computes cache-write token cost at 1.25x the input rate", () => {
    const cost = computeCostUsd("claude-sonnet-5", {
      ...ZERO_USAGE,
      cacheWriteTokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(3.75, 6); // 3.0 * 1.25
  });

  it("sums all four token classes for a mixed-usage call", () => {
    const cost = computeCostUsd("claude-sonnet-5", {
      inputTokens: 1000,
      outputTokens: 200,
      cacheReadTokens: 500,
      cacheWriteTokens: 100,
    });
    // (1000*3 + 200*15 + 500*0.3 + 100*3.75) / 1e6
    const expected = (1000 * 3 + 200 * 15 + 500 * 0.3 + 100 * 3.75) / 1_000_000;
    expect(cost).toBeCloseTo(expected, 9);
  });

  it("falls back to the sonnet-5 rate for an unknown model instead of throwing", () => {
    expect(() =>
      computeCostUsd("some-future-model-id", {
        ...ZERO_USAGE,
        inputTokens: 1_000_000,
      }),
    ).not.toThrow();
    const cost = computeCostUsd("some-future-model-id", {
      ...ZERO_USAGE,
      inputTokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(3.0, 6); // sonnet-5 fallback input rate
  });

  it("resolves claude-sonnet-4 (legacy tier) to the same rate as sonnet-5", () => {
    const cost = computeCostUsd("claude-sonnet-4-20250514", {
      ...ZERO_USAGE,
      inputTokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(3.0, 6);
  });

  it("returns 0 for zero usage on any model", () => {
    expect(computeCostUsd("claude-haiku-4-5", ZERO_USAGE)).toBe(0);
  });
});

// ─── Minimal fake Db ────────────────────────────────────────────────────────
// Mirrors only the chained shape ai-usage.server.ts actually calls:
// db.select({...}).from(table).where(cond) and db.insert(table).values({...}).
const makeFakeSelectDb = (totalByCall: readonly (string | null)[]): Db => {
  let call = 0;
  return {
    select: () => ({
      from: () => ({
        where: () => Promise.resolve([{ total: totalByCall[call++] ?? null }]),
      }),
    }),
    insert: () => ({
      values: () => Promise.resolve(undefined),
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
};

const makeFakeInsertDb = (
  onValues: (row: Record<string, unknown>) => void,
): Db =>
  ({
    insert: () => ({
      values: (row: Record<string, unknown>) => {
        onValues(row);
        return Promise.resolve(undefined);
      },
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;

const failingDb = (): Db =>
  ({
    insert: () => ({
      values: () => Promise.reject(new Error("connection refused")),
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;

describe("recordAiUsage", () => {
  const originalMockAi = process.env["MOCK_AI"];

  afterEach(() => {
    if (originalMockAi === undefined) delete process.env["MOCK_AI"];
    else process.env["MOCK_AI"] = originalMockAi;
  });

  it("writes a ledger row with the computed cost", async () => {
    let written: Record<string, unknown> | undefined;
    const db = makeFakeInsertDb((row) => (written = row));

    await recordAiUsage(
      {
        operation: "narrative-polish",
        model: "claude-haiku-4-5-20251001",
        trigger: "user",
        usage: { ...ZERO_USAGE, inputTokens: 1000, outputTokens: 100 },
      },
      db,
    );

    expect(written).toBeDefined();
    expect(written?.["operation"]).toBe("narrative-polish");
    expect(written?.["trigger"]).toBe("user");
    expect(written?.["userId"]).toBeNull();
  });

  it("writes the provided userId when given", async () => {
    let written: Record<string, unknown> | undefined;
    const db = makeFakeInsertDb((row) => (written = row));

    await recordAiUsage(
      {
        operation: "op",
        model: "claude-haiku-4-5",
        trigger: "user",
        usage: ZERO_USAGE,
        userId: "11111111-1111-1111-1111-111111111111",
      },
      db,
    );

    expect(written?.["userId"]).toBe("11111111-1111-1111-1111-111111111111");
  });

  it("does not throw when the DB write fails (fire-safe)", async () => {
    process.env["MOCK_AI"] = "false";
    await expect(
      recordAiUsage(
        {
          operation: "op",
          model: "claude-haiku-4-5",
          trigger: "user",
          usage: ZERO_USAGE,
        },
        failingDb(),
      ),
    ).resolves.toBeUndefined();
  });

  it("skips recording entirely under MOCK_AI=true", async () => {
    process.env["MOCK_AI"] = "true";
    let called = false;
    const db = makeFakeInsertDb(() => (called = true));

    await recordAiUsage(
      {
        operation: "op",
        model: "claude-haiku-4-5",
        trigger: "user",
        usage: ZERO_USAGE,
      },
      db,
    );

    expect(called).toBe(false);
  });
});

describe("checkDailyBudget — trigger semantics (Spec 83, corrected 2026-07-09)", () => {
  const originalMockAi = process.env["MOCK_AI"];
  const originalTotal = process.env["AI_DAILY_BUDGET_USD"];
  const originalBackground = process.env["AI_DAILY_BUDGET_BACKGROUND_USD"];

  beforeEach(() => {
    __resetSoftBudgetWarningForTests();
  });

  afterEach(() => {
    if (originalMockAi === undefined) delete process.env["MOCK_AI"];
    else process.env["MOCK_AI"] = originalMockAi;
    if (originalTotal === undefined) delete process.env["AI_DAILY_BUDGET_USD"];
    else process.env["AI_DAILY_BUDGET_USD"] = originalTotal;
    if (originalBackground === undefined)
      delete process.env["AI_DAILY_BUDGET_BACKGROUND_USD"];
    else process.env["AI_DAILY_BUDGET_BACKGROUND_USD"] = originalBackground;
  });

  it("fails OPEN when the ledger query rejects — a broken ledger never blocks an AI call", async () => {
    process.env["MOCK_AI"] = "false";
    const throwingDb = {
      select: () => ({
        from: () => ({
          where: () => Promise.reject(new Error("db down")),
        }),
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    const user = await checkDailyBudget("user", throwingDb);
    const background = await checkDailyBudget("background", throwingDb);

    expect(user.isOk()).toBe(true);
    expect(background.isOk()).toBe(true);
  });

  it("trigger=user is NEVER blocked, even far over the total budget", async () => {
    process.env["MOCK_AI"] = "false";
    process.env["AI_DAILY_BUDGET_USD"] = "5";
    // total spend (first query) way over cap; background query never reached
    // for a "user" trigger, so a single total row is enough.
    const db = makeFakeSelectDb(["100.000000"]);

    const result = await checkDailyBudget("user", db);

    expect(result.isOk()).toBe(true);
  });

  it("trigger=background is allowed under its cap", async () => {
    process.env["MOCK_AI"] = "false";
    process.env["AI_DAILY_BUDGET_BACKGROUND_USD"] = "1";
    // total query, then background query — both under cap
    const db = makeFakeSelectDb(["0.500000", "0.500000"]);

    const result = await checkDailyBudget("background", db);

    expect(result.isOk()).toBe(true);
  });

  it("trigger=background is blocked at/over its hard cap with AiBudgetExceededError", async () => {
    process.env["MOCK_AI"] = "false";
    process.env["AI_DAILY_BUDGET_BACKGROUND_USD"] = "1";
    const db = makeFakeSelectDb(["1.500000", "1.000000"]);

    const result = await checkDailyBudget("background", db);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBeInstanceOf(AiBudgetExceededError);
      expect(result.error._tag).toBe("AiBudgetExceededError");
      expect(result.error.trigger).toBe("background");
    }
  });

  it("trigger=background with null sum (no rows yet) is treated as $0 spent and allowed", async () => {
    process.env["MOCK_AI"] = "false";
    process.env["AI_DAILY_BUDGET_BACKGROUND_USD"] = "1";
    const db = makeFakeSelectDb([null, null]);

    const result = await checkDailyBudget("background", db);

    expect(result.isOk()).toBe(true);
  });

  it("MOCK_AI=true bypasses the guard entirely for both triggers", async () => {
    process.env["MOCK_AI"] = "true";
    const db = makeFakeSelectDb(["999.000000", "999.000000"]);

    const userResult = await checkDailyBudget("user", db);
    const backgroundResult = await checkDailyBudget("background", db);

    expect(userResult.isOk()).toBe(true);
    expect(backgroundResult.isOk()).toBe(true);
  });

  it("uses the default background cap ($1) when AI_DAILY_BUDGET_BACKGROUND_USD is unset", async () => {
    process.env["MOCK_AI"] = "false";
    delete process.env["AI_DAILY_BUDGET_BACKGROUND_USD"];
    const db = makeFakeSelectDb(["2.000000", "2.000000"]);

    const result = await checkDailyBudget("background", db);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.capUsd).toBe(1);
  });

  it("falls back to the default cap when the env var is not a valid positive number", async () => {
    process.env["MOCK_AI"] = "false";
    process.env["AI_DAILY_BUDGET_BACKGROUND_USD"] = "not-a-number";
    const db = makeFakeSelectDb(["2.000000", "2.000000"]);

    const result = await checkDailyBudget("background", db);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.capUsd).toBe(1);
  });
});
