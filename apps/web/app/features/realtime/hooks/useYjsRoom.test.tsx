/**
 * @vitest-environment jsdom
 *
 * BUG-N57 — `useYjsRoom` must not oscillate against a reachable-but-
 * misbehaving ws-server. Contracts:
 *
 * 1. pre-sync connection drops report `connecting` (the provider is still
 *    retrying), never a transient `offline` that would flip the editors onto
 *    the HTTP path and back;
 * 2. repeated pre-sync drops latch a TERMINAL `offline`: the provider is
 *    destroyed and no later event changes the status;
 * 3. a server that holds the socket open but never syncs hits the sync
 *    deadline and latches offline too;
 * 4. the happy path is unchanged: connect → sync → `connected` + `synced`
 *    (and `synced` stays latched across later drops — BUG-N54 contract).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import * as Y from "yjs";
import { REALTIME_RESEED_CLOSE_CODE } from "@oh-writers/domain";
import { useYjsRoom } from "./useYjsRoom";
import { SYNC_DEADLINE_MS } from "../lib/sync-latch";
import { createYjsRoom } from "../lib/provider";

type Handler = (...args: unknown[]) => void;

class FakeProvider {
  private handlers = new Map<string, Set<Handler>>();
  synced = false;
  wsconnected = false;
  destroy = vi.fn();
  awareness = {
    clientID: 1,
    on: (): void => {},
    off: (): void => {},
    setLocalStateField: (): void => {},
    getStates: (): Map<number, unknown> => new Map(),
  };

  on(name: string, handler: Handler): void {
    const set = this.handlers.get(name) ?? new Set<Handler>();
    set.add(handler);
    this.handlers.set(name, set);
  }

  off(name: string, handler: Handler): void {
    this.handlers.get(name)?.delete(handler);
  }

  emit(name: string, args: unknown[]): void {
    this.handlers.get(name)?.forEach((handler) => handler(...args));
  }
}

vi.mock("../lib/provider", () => ({
  isRealtimeEnabled: () => true,
  createYjsRoom: vi.fn(),
}));

vi.mock("../server/realtime-token.server", () => ({
  getRealtimeToken: vi.fn(() => Promise.resolve({ token: "t" })),
}));

const openRoom = async () => {
  const provider = new FakeProvider();
  const ydoc = new Y.Doc();
  vi.mocked(createYjsRoom).mockReturnValue({
    ydoc,
    provider: provider as never,
  });

  const rendered = renderHook(() =>
    useYjsRoom("document:d1", { id: "u1", name: "Test" }, true),
  );
  // Flush the token-fetch promise chain (`.catch().then()`) so the room opens.
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
  return { ...rendered, provider, ydoc };
};

const status = (provider: FakeProvider, value: string): void =>
  provider.emit("status", [{ status: value }]);

afterEach(() => {
  vi.useRealTimers();
});

describe("useYjsRoom pre-sync drop handling (BUG-N57)", () => {
  it("reports `connecting`, not `offline`, on a transient pre-sync drop", async () => {
    const { result, provider, unmount } = await openRoom();

    // #38 — an open socket is not yet a working room, so the status stays
    // `connecting` until `sync` lands. Announcing "connected" here made the
    // presence indicator promise "online" and then drop to "offline" on every
    // socket the server went on to reject.
    act(() => status(provider, "connected"));
    expect(result.current.status).toBe("connecting");
    expect(result.current.synced).toBe(false);

    act(() => status(provider, "disconnected"));
    expect(result.current.status).toBe("connecting");
    expect(provider.destroy).not.toHaveBeenCalled();

    unmount();
  });

  it("latches a terminal `offline` after repeated connect-without-sync cycles", async () => {
    const { result, provider, unmount } = await openRoom();

    // Accept→drop cycles: each drop ("disconnected") and each retry attempt
    // ("connecting") counts against the pre-sync latch.
    act(() => status(provider, "connected"));
    act(() => status(provider, "disconnected"));
    act(() => status(provider, "connecting"));
    expect(result.current.status).toBe("connecting");
    act(() => status(provider, "connected"));
    act(() => status(provider, "disconnected"));

    expect(result.current.status).toBe("offline");
    expect(result.current.ydoc).toBeNull();
    expect(result.current.provider).toBeNull();
    expect(provider.destroy).toHaveBeenCalledTimes(1);

    // Terminal: later events (listeners are detached, but even a stray call
    // path) never resurrect the room.
    act(() => status(provider, "connected"));
    expect(result.current.status).toBe("offline");

    unmount();
    expect(provider.destroy).toHaveBeenCalledTimes(1);
  });

  it("latches offline when the server accepts but never syncs (deadline)", async () => {
    vi.useFakeTimers();
    const { result, provider, unmount } = await openRoom();

    act(() => status(provider, "connected"));
    expect(result.current.status).toBe("connecting");

    act(() => {
      vi.advanceTimersByTime(SYNC_DEADLINE_MS);
    });
    expect(result.current.status).toBe("offline");
    expect(provider.destroy).toHaveBeenCalledTimes(1);

    unmount();
  });
});

describe("useYjsRoom happy path and post-sync behaviour", () => {
  it("connect → sync yields `connected` + `synced` with the live doc", async () => {
    const { result, provider, ydoc, unmount } = await openRoom();

    act(() => status(provider, "connected"));
    act(() => provider.emit("sync", [true]));

    expect(result.current.status).toBe("connected");
    expect(result.current.synced).toBe(true);
    expect(result.current.ydoc).toBe(ydoc);
    expect(provider.destroy).not.toHaveBeenCalled();

    unmount();
    expect(provider.destroy).toHaveBeenCalledTimes(1);
  });

  // #38 — measured live: the socket opened, the status went `connected`, and the
  // server rejected the token 8ms later. The presence indicator therefore said
  // "online" and immediately fell back to "offline". Never claiming connected
  // before sync means a rejected socket goes connecting → offline, with no
  // "online" the writer can see and disbelieve.
  it("a socket the server rejects never passes through `connected`", async () => {
    const { result, provider, unmount } = await openRoom();
    const seen: string[] = [];

    act(() => status(provider, "connected"));
    seen.push(result.current.status);
    act(() => status(provider, "disconnected"));
    seen.push(result.current.status);

    expect(seen).not.toContain("connected");
    expect(result.current.synced).toBe(false);

    unmount();
  });

  it("a `sync` event with `false` (reconnect reset) does not latch `synced`", async () => {
    const { result, provider, unmount } = await openRoom();

    act(() => status(provider, "connected"));
    act(() => provider.emit("sync", [false]));
    expect(result.current.synced).toBe(false);

    unmount();
  });

  it("a reseed close-code rebuilds the room with a FRESH Y.Doc and bumps epoch (BUG-N72 / #35)", async () => {
    const { result, provider, ydoc } = await openRoom();

    act(() => status(provider, "connected"));
    act(() => provider.emit("sync", [true]));
    expect(result.current.epoch).toBe(0);

    // Second room the rebuild will open.
    const provider2 = new FakeProvider();
    const ydoc2 = new Y.Doc();
    vi.mocked(createYjsRoom).mockReturnValue({
      ydoc: ydoc2,
      provider: provider2 as never,
    });

    // The close handler resets the room and bumps the epoch in ONE batch: the
    // epoch-bump render must not still expose the destroyed ydoc, or the
    // editor gate's latch would survive it and skip the skeleton re-arm.
    act(() => {
      provider.emit("connection-close", [
        { code: REALTIME_RESEED_CLOSE_CODE },
        provider,
      ]);
    });
    // Old pair destroyed — the stale local doc must never re-sync back.
    expect(provider.destroy).toHaveBeenCalledTimes(1);
    expect(result.current.epoch).toBe(1);
    expect(result.current.ydoc).toBeNull();
    // Anything but the terminal `offline` — that would flip the editors onto
    // the HTTP fallback instead of holding the re-armed skeleton.
    expect(result.current.status).not.toBe("offline");

    // Flush the rebuild's token-fetch chain so the new room opens.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    act(() => status(provider2, "connected"));
    act(() => provider2.emit("sync", [true]));
    expect(result.current.ydoc).toBe(ydoc2);
    expect(result.current.ydoc).not.toBe(ydoc);
    expect(result.current.status).toBe("connected");
    expect(result.current.synced).toBe(true);
  });

  it("a normal close code does NOT rebuild the room", async () => {
    const { result, provider, ydoc, unmount } = await openRoom();

    act(() => status(provider, "connected"));
    act(() => provider.emit("sync", [true]));

    act(() => {
      provider.emit("connection-close", [{ code: 1006 }, provider]);
      status(provider, "disconnected");
    });

    expect(provider.destroy).not.toHaveBeenCalled();
    expect(result.current.epoch).toBe(0);
    expect(result.current.ydoc).toBe(ydoc);
    expect(result.current.status).toBe("offline");

    unmount();
  });

  it("post-sync drops report `offline` without destroying the room, and reconnects recover", async () => {
    const { result, provider, ydoc, unmount } = await openRoom();

    act(() => status(provider, "connected"));
    act(() => provider.emit("sync", [true]));

    // Repeated post-sync flaps: informational only — `synced` stays latched,
    // the doc survives, the provider is never destroyed (Yjs buffers edits).
    for (let i = 0; i < 5; i++) {
      act(() => status(provider, "disconnected"));
      expect(result.current.status).toBe("offline");
      expect(result.current.synced).toBe(true);
      expect(result.current.ydoc).toBe(ydoc);

      act(() => status(provider, "connected"));
      expect(result.current.status).toBe("connected");
    }
    expect(provider.destroy).not.toHaveBeenCalled();

    unmount();
  });
});
