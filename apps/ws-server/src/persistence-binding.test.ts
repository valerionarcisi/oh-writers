import { beforeEach, describe, expect, it, vi } from "vitest";

// We mock the two boundaries the binding talks to:
//  - `./persistence.js` (the unit covered by persistence.test.ts) — here we
//    only assert it is CALLED with the right room + doc, not its DB behaviour.
//  - `y-websocket/bin/utils` — the CommonJS module the binding dynamically
//    imports. We capture the persistence object it registers via
//    `setPersistence` and expose an in-memory `docs` map, so we can drive
//    `bindState`/`writeState` and the interval flush without a real server.
//
// This keeps the test in the pure-unit CI lane (no DB, no websocket).

const persistence = vi.hoisted(() => ({
  flushRoom: vi.fn(async () => undefined),
  loadYjsState: vi.fn(async () => null as Uint8Array | null),
}));

vi.mock("./persistence.js", () => persistence);

interface CapturedPersistence {
  bindState: (docName: string, ydoc: unknown) => Promise<void> | void;
  writeState: (docName: string, ydoc: unknown) => Promise<void>;
  provider: unknown;
}

const utils = vi.hoisted(() => {
  const docs = new Map<string, unknown>();
  let captured: CapturedPersistence | null = null;
  return {
    docs,
    setPersistence: vi.fn((p: CapturedPersistence) => {
      captured = p;
    }),
    setupWSConnection: vi.fn(),
    getCaptured: (): CapturedPersistence => {
      if (!captured) throw new Error("setPersistence was not called");
      return captured;
    },
    reset: (): void => {
      docs.clear();
      captured = null;
    },
  };
});

vi.mock("y-websocket/bin/utils", () => ({
  docs: utils.docs,
  setPersistence: utils.setPersistence,
  setupWSConnection: utils.setupWSConnection,
}));

import { REALTIME_RESEED_CLOSE_CODE } from "@oh-writers/domain";
import { installPersistence, reseedRoom } from "./persistence-binding.js";
import { Doc } from "./yjs-shared.js";

beforeEach(() => {
  persistence.flushRoom.mockClear();
  persistence.loadYjsState.mockClear();
  utils.setPersistence.mockClear();
  utils.reset();
  vi.useRealTimers();
});

describe("installPersistence dirty-room flush path", () => {
  it("flushes a dirty room on the interval and clears it (one flush per tick)", async () => {
    vi.useFakeTimers();
    await installPersistence();
    const { bindState } = utils.getCaptured();

    const docName = "screenplay:sp-1";
    const ydoc = new Doc();
    utils.docs.set(docName, ydoc);

    await bindState(docName, ydoc);

    // A local edit marks the room dirty via the update handler bindState wired.
    ydoc.getText("content").insert(0, "edit");
    expect(persistence.flushRoom).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(60_000);
    expect(persistence.flushRoom).toHaveBeenCalledTimes(1);
    expect(persistence.flushRoom).toHaveBeenCalledWith(
      { kind: "screenplay", id: "sp-1" },
      ydoc,
    );

    // Already flushed + cleared: the next tick is a no-op without a new edit.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(persistence.flushRoom).toHaveBeenCalledTimes(1);
  });

  it("loads persisted state into the doc on bindState", async () => {
    const seeded = new Doc();
    seeded.getText("content").insert(0, "persisted");
    const { encodeStateAsUpdate } = await import("./yjs-shared.js");
    persistence.loadYjsState.mockResolvedValueOnce(encodeStateAsUpdate(seeded));

    await installPersistence();
    const { bindState } = utils.getCaptured();

    const ydoc = new Doc();
    await bindState("document:doc-1", ydoc);

    expect(persistence.loadYjsState).toHaveBeenCalledWith({
      kind: "document",
      id: "doc-1",
    });
    expect(ydoc.getText("content").toString()).toBe("persisted");
  });

  it("flushes immediately on writeState (last client disconnect)", async () => {
    await installPersistence();
    const { writeState } = utils.getCaptured();

    const ydoc = new Doc();
    await writeState("branch:br-1", ydoc);

    expect(persistence.flushRoom).toHaveBeenCalledWith(
      { kind: "branch", id: "br-1" },
      ydoc,
    );
  });

  it("reseedRoom drops the room WITHOUT flushing and closes clients with the reseed code (BUG-N72 / #35)", async () => {
    await installPersistence();
    const { bindState } = utils.getCaptured();

    const docName = "document:doc-1";
    const ydoc = new Doc() as Doc & {
      conns: Map<{ close: ReturnType<typeof vi.fn> }, unknown>;
    };
    ydoc.conns = new Map([
      [{ close: vi.fn() }, new Set()],
      [{ close: vi.fn() }, new Set()],
    ]);
    utils.docs.set(docName, ydoc);
    await bindState(docName, ydoc);

    // A pending local edit must be DISCARDED, not flushed — the DB already
    // holds the reseeded (newer) state.
    ydoc.getText("content").insert(0, "stale edit");

    const staleConns = [...ydoc.conns.keys()];
    const closed = await reseedRoom(docName);

    expect(closed).toBe(2);
    expect(utils.docs.has(docName)).toBe(false);
    expect(persistence.flushRoom).not.toHaveBeenCalled();
    // Conns are DETACHED from the stale doc before closing: y-websocket's
    // closeConn is guarded by `doc.conns.has(conn)`, so the stale doc can
    // never fire a last-disconnect writeState (flushing stale state over the
    // DB reseed) nor its unconditional docs.delete (which would race a fast
    // reconnect and delete the fresh re-created room).
    expect(ydoc.conns.size).toBe(0);
    for (const conn of staleConns) {
      expect(conn.close).toHaveBeenCalledWith(
        REALTIME_RESEED_CLOSE_CODE,
        "room-reseeded",
      );
    }
  });

  it("reseedRoom is a no-op (0 closed) for a room not live in this instance", async () => {
    await installPersistence();
    expect(await reseedRoom("document:not-open")).toBe(0);
  });

  it("a NEW room re-created after a reseed still flushes normally on last disconnect", async () => {
    await installPersistence();
    const { writeState } = utils.getCaptured();

    const docName = "document:doc-2";
    const staleDoc = new Doc() as Doc & {
      conns: Map<{ close: ReturnType<typeof vi.fn> }, unknown>;
    };
    staleDoc.conns = new Map([[{ close: vi.fn() }, new Set()]]);
    utils.docs.set(docName, staleDoc);

    await reseedRoom(docName);

    // A client reconnects and a fresh room binds from the reseeded DB; its
    // legitimate last-disconnect flush must persist — the eviction only
    // detaches the STALE doc, it never suppresses future flushes by name.
    const freshDoc = new Doc();
    await writeState(docName, freshDoc);
    expect(persistence.flushRoom).toHaveBeenCalledTimes(1);
    expect(persistence.flushRoom).toHaveBeenCalledWith(
      { kind: "document", id: "doc-2" },
      freshDoc,
    );
  });

  it("ignores unparseable room ids on bindState and writeState", async () => {
    await installPersistence();
    const { bindState, writeState } = utils.getCaptured();

    const ydoc = new Doc();
    await bindState("not-a-room", ydoc);
    await writeState("also-bad", ydoc);

    expect(persistence.loadYjsState).not.toHaveBeenCalled();
    expect(persistence.flushRoom).not.toHaveBeenCalled();
  });
});
