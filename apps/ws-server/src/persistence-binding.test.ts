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

import { installPersistence } from "./persistence-binding.js";
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
