import { describe, it, expect, vi } from "vitest";
import { checkAndStampRateLimit } from "./rate-limit";
import type { Db } from "~/server/db";

interface RateRow {
  projectId: string;
  action: string;
  lastInvokedAt: Date;
}

const buildDb = (initial: RateRow | null) => {
  const inserts: Array<{
    values: RateRow;
    onConflictDoUpdate: { set: { lastInvokedAt: Date } };
  }> = [];
  let row: RateRow | null = initial;

  const onConflictDoUpdate = vi.fn((cfg: { set: { lastInvokedAt: Date } }) => {
    const last = inserts[inserts.length - 1];
    if (last) last.onConflictDoUpdate = cfg;
    if (row && cfg.set.lastInvokedAt) row = { ...row, ...cfg.set };
    return Promise.resolve();
  });

  const insert = vi.fn(() => ({
    values: (values: RateRow) => {
      inserts.push({
        values,
        onConflictDoUpdate: { set: { lastInvokedAt: values.lastInvokedAt } },
      });
      if (!row) row = { ...values };
      return { onConflictDoUpdate };
    },
  }));

  const findFirst = vi.fn(() => Promise.resolve(row ?? undefined));

  const db = {
    query: { breakdownRateLimits: { findFirst } },
    insert,
  } as unknown as Db;

  return { db, inserts, findFirst, insert };
};

describe("checkAndStampRateLimit", () => {
  const cooldown = 60_000;
  const projectId = "p1";
  const action = "cesare:scene:s1";

  it("allows the first invocation and stamps a row", async () => {
    const { db, insert } = buildDb(null);
    const result = await checkAndStampRateLimit(
      db,
      projectId,
      action,
      cooldown,
    );
    expect(result.isOk()).toBe(true);
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it("rejects a second invocation within the cooldown with retryAfterMs", async () => {
    const lastInvokedAt = new Date(Date.now() - 5_000); // 5s ago, well inside 60s window
    const { db } = buildDb({ projectId, action, lastInvokedAt });
    const result = await checkAndStampRateLimit(
      db,
      projectId,
      action,
      cooldown,
    );
    expect(result.isErr()).toBe(true);
    if (!result.isErr()) return;
    expect(result.error._tag).toBe("RateLimitedError");
    if (result.error._tag !== "RateLimitedError") return;
    expect(result.error.retryAfterMs).toBeGreaterThan(50_000);
    expect(result.error.retryAfterMs).toBeLessThanOrEqual(cooldown);
  });

  it("allows a re-invocation once the cooldown elapses", async () => {
    const lastInvokedAt = new Date(Date.now() - cooldown - 1_000);
    const { db, insert } = buildDb({ projectId, action, lastInvokedAt });
    const result = await checkAndStampRateLimit(
      db,
      projectId,
      action,
      cooldown,
    );
    expect(result.isOk()).toBe(true);
    expect(insert).toHaveBeenCalledTimes(1);
  });
});
