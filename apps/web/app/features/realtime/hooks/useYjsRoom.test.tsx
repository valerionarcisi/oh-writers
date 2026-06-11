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

    act(() => status(provider, "connected"));
    expect(result.current.status).toBe("connected");
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
    expect(result.current.status).toBe("connected");

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

  it("a `sync` event with `false` (reconnect reset) does not latch `synced`", async () => {
    const { result, provider, unmount } = await openRoom();

    act(() => status(provider, "connected"));
    act(() => provider.emit("sync", [false]));
    expect(result.current.synced).toBe(false);

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
