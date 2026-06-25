import { applyUpdate } from "./yjs-shared.js";
import type { Doc as YDoc } from "./yjs-shared.js";
import { parseRoomId } from "./room-id.js";
import { flushRoom, loadYjsState } from "./persistence.js";
import { registerRoom } from "./redis-sync.js";

// y-websocket attaches an `awareness` to each managed doc (WSSharedDoc); the
// Redis fan-out needs both the doc and its awareness, so we widen the type.
type SharedAwarenessDoc = Parameters<typeof registerRoom>[1];

// y-websocket's bin/utils is CommonJS; under NodeNext we reach it via a
// dynamic import and read the named exports off the module record.
interface YWebsocketUtils {
  setPersistence: (p: {
    bindState: (docName: string, ydoc: YDoc) => Promise<void> | void;
    writeState: (docName: string, ydoc: YDoc) => Promise<void>;
    provider: unknown;
  }) => void;
  docs: Map<string, YDoc>;
  setupWSConnection: (
    conn: unknown,
    req: unknown,
    opts?: { docName?: string; gc?: boolean },
  ) => void;
}

const utilsPromise = import("y-websocket/bin/utils").then(
  (m) => m as unknown as YWebsocketUtils,
);

export const getYWebsocketUtils = (): Promise<YWebsocketUtils> => utilsPromise;

const FLUSH_INTERVAL_MS = 60_000;

// Rooms that received an update since their last flush.
const dirtyRooms = new Set<string>();

// Per-room "persisted state has been applied" promise. y-websocket calls
// `bindState` WITHOUT awaiting it and sends syncStep1 immediately, so the
// first client always syncs against a still-empty doc and receives the
// persisted content only as a later update. A client that mounts its editor
// on `synced` then sees an empty fragment for a room that has content — it
// seeds/renders empty over it and the autosave persists the wipe (the
// BUG-N53 narrative clobber). The ws-handler awaits `whenRoomLoaded` before
// `setupWSConnection`, so the first sync reply already carries the persisted
// state and an empty fragment after sync means the room is GENUINELY empty.
const roomLoaded = new Map<string, Promise<void>>();

export const whenRoomLoaded = (docName: string): Promise<void> =>
  roomLoaded.get(docName) ?? Promise.resolve();

/** Drop the loaded-marker for a room evicted outside the writeState path. */
export const forgetRoomLoaded = (docName: string): void => {
  roomLoaded.delete(docName);
};

/**
 * Wire DB persistence into y-websocket. `bindState` runs once per room when the
 * first client connects (load persisted state, then mark the room dirty on
 * every subsequent update); `writeState` runs when the last client disconnects
 * (immediate flush). A 60s interval flushes any still-open dirty rooms.
 */
export const installPersistence = async (): Promise<void> => {
  const utils = await getYWebsocketUtils();

  utils.setPersistence({
    provider: null,
    bindState: (docName, ydoc) => {
      const loading = (async (): Promise<void> => {
        const room = parseRoomId(docName);
        if (!room) return;

        const persisted = await loadYjsState(room);
        if (persisted) applyUpdate(ydoc, persisted);

        ydoc.on("update", () => {
          dirtyRooms.add(docName);
        });

        // Cross-instance fan-out (no-op unless REDIS_URL is set): publish this
        // room's local updates + awareness to peers and apply theirs back. Full-
        // state `encodeStateAsUpdate` flushes converge under last-writer-wins, so
        // multiple instances persisting the same room stays benign — `flushRoom`
        // is unchanged.
        registerRoom(docName, ydoc as SharedAwarenessDoc);
      })();
      // The rejection must reach the connection handler (a failed load means
      // the room would be served EMPTY for a document that has content — the
      // handler refuses the connection instead). The extra `.catch` tap only
      // prevents an unhandledRejection when no handler is awaiting yet.
      loading.catch((err) => {
        console.error("bindState failed for", docName, err);
      });
      roomLoaded.set(docName, loading);
      return loading;
    },
    writeState: async (docName, ydoc) => {
      // Runs when the last client disconnects and y-websocket evicts the doc —
      // drop the loaded-marker so a re-created room re-binds cleanly.
      roomLoaded.delete(docName);
      const room = parseRoomId(docName);
      if (!room) return;
      await flushRoom(room, ydoc);
      dirtyRooms.delete(docName);
    },
  });

  setInterval(() => {
    void flushDirtyRooms(utils);
  }, FLUSH_INTERVAL_MS).unref();
};

const flushDirtyRooms = async (utils: YWebsocketUtils): Promise<void> => {
  const pending = [...dirtyRooms];
  for (const docName of pending) {
    const ydoc = utils.docs.get(docName);
    const room = parseRoomId(docName);
    if (!ydoc || !room) {
      dirtyRooms.delete(docName);
      continue;
    }
    await flushRoom(room, ydoc);
    dirtyRooms.delete(docName);
  }
};

/**
 * Drop a room's in-memory copy WITHOUT flushing it, then disconnect its clients
 * so they reconnect and re-bind from the fresh DB state (BUG-N72). Called when a
 * server-side actor (Cesare apply / version activate) has just reseeded
 * `documents.yjs_state` in the DB: the live room still holds the STALE doc, and
 * a normal flush would persist that stale state back over the reseed. So we must
 * NOT flush — we discard the live doc and let `bindState` reload the DB on the
 * clients' reconnect.
 *
 * Returns the number of client connections that were closed (0 if the room was
 * not live in this instance).
 */
export const reseedRoom = async (docName: string): Promise<number> => {
  const utils = await getYWebsocketUtils();
  const doc = utils.docs.get(docName) as
    | (YDoc & { conns?: Map<{ close?: () => void }, unknown> })
    | undefined;
  if (!doc) return 0;

  const conns = doc.conns ? [...doc.conns.keys()] : [];
  // Drop the stale doc + its loaded-marker BEFORE closing the sockets, so a
  // client that races a reconnect re-creates the room and re-binds from the DB
  // (a fresh load) rather than re-attaching to the stale in-memory doc.
  dirtyRooms.delete(docName);
  utils.docs.delete(docName);
  forgetRoomLoaded(docName);

  for (const conn of conns) {
    try {
      conn.close?.();
    } catch {
      // A socket already closing is fine — the goal is just to make every
      // client reconnect and reload.
    }
  }
  return conns.length;
};

/** Flush every open room — used on graceful shutdown. */
export const flushAll = async (): Promise<void> => {
  const utils = await getYWebsocketUtils();
  for (const [docName, ydoc] of utils.docs.entries()) {
    const room = parseRoomId(docName);
    if (room) await flushRoom(room, ydoc);
  }
  dirtyRooms.clear();
};
