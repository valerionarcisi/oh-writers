/**
 * Pre-sync offline-latch policy (BUG-N57).
 *
 * A ws-server that is reachable but misbehaving (auth expiry, DB mismatch,
 * proxy flap) accepts the socket and then drops it — or never answers the sync
 * step at all. y-websocket retries forever with ~100ms backoff, so the room
 * status oscillates and the editors' "awaiting sync" skeleton flip-flops with
 * the live editor, remounting it continuously and eating keystrokes.
 *
 * The policy: while the room has NEVER synced, count connection drops. Once
 * `maxDropsBeforeSync` drops land inside `windowMs`, the room is declared
 * terminally offline for this mount — the provider is destroyed and the
 * editors fall back to the HTTP path once, with no further oscillation.
 * Drops spread wider apart than the window restart the count (a genuinely
 * slow first connect should not be condemned).
 *
 * Pure and clock-free (callers pass `nowMs`) so it is testable without
 * sockets or timers.
 */

export interface SyncLatchPolicy {
  /** Pre-sync drops tolerated before latching offline. */
  readonly maxDropsBeforeSync: number;
  /** Drops only count against the limit when they land within this window. */
  readonly windowMs: number;
}

export const DEFAULT_SYNC_LATCH_POLICY: SyncLatchPolicy = {
  maxDropsBeforeSync: 3,
  windowMs: 15_000,
};

/** A server that holds the socket open but never completes the sync step
 *  produces no drops — this deadline latches that case offline too. */
export const SYNC_DEADLINE_MS = 20_000;

export interface SyncLatchState {
  readonly drops: number;
  readonly firstDropAtMs: number | null;
}

export const INITIAL_SYNC_LATCH_STATE: SyncLatchState = {
  drops: 0,
  firstDropAtMs: null,
};

export interface SyncLatchDecision {
  readonly state: SyncLatchState;
  /** True → destroy the provider and report a terminal `offline`. */
  readonly latchOffline: boolean;
}

export const recordPreSyncDrop = (
  state: SyncLatchState,
  nowMs: number,
  policy: SyncLatchPolicy = DEFAULT_SYNC_LATCH_POLICY,
): SyncLatchDecision => {
  const windowOpen =
    state.firstDropAtMs !== null &&
    nowMs - state.firstDropAtMs <= policy.windowMs;
  const drops = windowOpen ? state.drops + 1 : 1;
  const firstDropAtMs = windowOpen ? (state.firstDropAtMs as number) : nowMs;
  return {
    state: { drops, firstDropAtMs },
    latchOffline: drops >= policy.maxDropsBeforeSync,
  };
};
