import { describe, expect, it } from "vitest";
import {
  DEFAULT_SYNC_LATCH_POLICY,
  INITIAL_SYNC_LATCH_STATE,
  recordPreSyncDrop,
} from "./sync-latch";

describe("recordPreSyncDrop (BUG-N57 offline latch policy)", () => {
  it("does not latch on the first drop", () => {
    const { state, latchOffline } = recordPreSyncDrop(
      INITIAL_SYNC_LATCH_STATE,
      1_000,
    );
    expect(latchOffline).toBe(false);
    expect(state).toEqual({ drops: 1, firstDropAtMs: 1_000 });
  });

  it("latches after maxDropsBeforeSync drops inside the window", () => {
    const first = recordPreSyncDrop(INITIAL_SYNC_LATCH_STATE, 1_000);
    const second = recordPreSyncDrop(first.state, 1_100);
    expect(second.latchOffline).toBe(false);
    const third = recordPreSyncDrop(second.state, 1_200);
    expect(third.latchOffline).toBe(true);
    expect(third.state.drops).toBe(3);
  });

  it("restarts the count when a drop lands outside the window", () => {
    const first = recordPreSyncDrop(INITIAL_SYNC_LATCH_STATE, 1_000);
    const second = recordPreSyncDrop(first.state, 1_100);
    const late = recordPreSyncDrop(
      second.state,
      1_000 + DEFAULT_SYNC_LATCH_POLICY.windowMs + 1,
    );
    expect(late.latchOffline).toBe(false);
    expect(late.state).toEqual({
      drops: 1,
      firstDropAtMs: 1_000 + DEFAULT_SYNC_LATCH_POLICY.windowMs + 1,
    });
  });

  it("counts a drop exactly on the window edge against the limit", () => {
    const first = recordPreSyncDrop(INITIAL_SYNC_LATCH_STATE, 0);
    const second = recordPreSyncDrop(first.state, 1);
    const edge = recordPreSyncDrop(
      second.state,
      DEFAULT_SYNC_LATCH_POLICY.windowMs,
    );
    expect(edge.latchOffline).toBe(true);
  });

  it("honours a custom policy", () => {
    const { latchOffline } = recordPreSyncDrop(INITIAL_SYNC_LATCH_STATE, 0, {
      maxDropsBeforeSync: 1,
      windowMs: 10,
    });
    expect(latchOffline).toBe(true);
  });
});
