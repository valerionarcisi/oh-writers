// apps/web/app/features/predictions/sessions/sessions.server.test.ts
// LeftRail pinning — `setSessionPinned` extraction-pattern unit tests (mirrors
// `editorial-advice-decisions.server.test.ts`): a plain (db, session, pinned)
// function tested directly, without a createServerFn/withProjectAccess
// round-trip.
import { describe, it, expect, vi } from "vitest";
import type { Db } from "~/server/db";
import { setSessionPinned } from "./sessions.server";
import { PinLimitReachedError } from "./sessions.errors";

const SESSION = {
  id: "11111111-1111-1111-1111-111111111111",
  projectId: "22222222-2222-2222-2222-222222222222",
  userId: "33333333-3333-3333-3333-333333333333",
};

const buildDb = ({
  pinnedCount,
  updatedRow,
}: {
  pinnedCount: number;
  updatedRow?: Record<string, unknown> | null;
}) => {
  const selectWhere = vi.fn(() => Promise.resolve([{ value: pinnedCount }]));
  const selectFrom = vi.fn(() => ({ where: selectWhere }));
  const select = vi.fn(() => ({ from: selectFrom }));

  const returning = vi.fn(() =>
    Promise.resolve(
      updatedRow === null
        ? []
        : [updatedRow ?? { ...SESSION, pinnedAt: new Date() }],
    ),
  );
  const updateWhere = vi.fn(() => ({ returning }));
  const set = vi.fn(() => ({ where: updateWhere }));
  const update = vi.fn(() => ({ set }));

  const db = { select, update } as unknown as Db;
  return { db, select, selectFrom, selectWhere, update, set, updateWhere };
};

describe("setSessionPinned", () => {
  it("pins a session when under the limit", async () => {
    const { db, set } = buildDb({ pinnedCount: 0 });
    const result = await setSessionPinned(db, SESSION, true);
    expect(result.isOk()).toBe(true);
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ pinnedAt: expect.any(Date) }),
    );
  });

  it("pins successfully at exactly 2 already pinned (under the max-3 cap)", async () => {
    const { db } = buildDb({ pinnedCount: 2 });
    const result = await setSessionPinned(db, SESSION, true);
    expect(result.isOk()).toBe(true);
  });

  it("rejects pinning with PinLimitReachedError when 3 are already pinned", async () => {
    const { db, update } = buildDb({ pinnedCount: 3 });
    const result = await setSessionPinned(db, SESSION, true);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBeInstanceOf(PinLimitReachedError);
      expect((result.error as PinLimitReachedError).limit).toBe(3);
    }
    // No update was attempted once the count check failed.
    expect(update).not.toHaveBeenCalled();
  });

  it("respects a custom maxPinned override", async () => {
    const { db } = buildDb({ pinnedCount: 1 });
    const result = await setSessionPinned(db, SESSION, true, 1);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect((result.error as PinLimitReachedError).limit).toBe(1);
    }
  });

  it("always allows unpinning, even when the project is at the cap", async () => {
    const { db, select, set } = buildDb({ pinnedCount: 3 });
    const result = await setSessionPinned(db, SESSION, false);
    expect(result.isOk()).toBe(true);
    // Unpinning never needs the count check.
    expect(select).not.toHaveBeenCalled();
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ pinnedAt: null }),
    );
  });

  it("surfaces a DbError when the update returns no row (id vanished mid-flight)", async () => {
    const { db } = buildDb({ pinnedCount: 0, updatedRow: null });
    const result = await setSessionPinned(db, SESSION, true);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect((result.error as { _tag: string })._tag).toBe("DbError");
    }
  });
});
