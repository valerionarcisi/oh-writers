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
    bindState: async (docName, ydoc) => {
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
    },
    writeState: async (docName, ydoc) => {
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

/** Flush every open room — used on graceful shutdown. */
export const flushAll = async (): Promise<void> => {
  const utils = await getYWebsocketUtils();
  for (const [docName, ydoc] of utils.docs.entries()) {
    const room = parseRoomId(docName);
    if (room) await flushRoom(room, ydoc);
  }
  dirtyRooms.clear();
};
