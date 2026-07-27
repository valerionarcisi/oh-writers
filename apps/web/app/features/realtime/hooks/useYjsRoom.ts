import { useEffect, useMemo, useRef, useState } from "react";
import type * as Y from "yjs";
import type { WebsocketProvider } from "y-websocket";
import { REALTIME_RESEED_CLOSE_CODE } from "@oh-writers/domain";
import { userColor } from "@oh-writers/utils";
import { createYjsRoom, isRealtimeEnabled } from "../lib/provider";
import {
  INITIAL_SYNC_LATCH_STATE,
  SYNC_DEADLINE_MS,
  recordPreSyncDrop,
} from "../lib/sync-latch";
import { getRealtimeToken } from "../server/realtime-token.server";

/**
 * `connecting` covers the whole pre-sync phase, including provider retry
 * cycles — a transient drop before the first sync never reports `offline`
 * (BUG-N57: that flip-flopped the editors between skeleton and HTTP editor).
 * Before the first sync, `offline` is TERMINAL for the mount: token fetch
 * failed, the drop latch fired, or the sync deadline passed — the provider is
 * destroyed and the status never changes again. After the first sync,
 * `offline` is informational (connection lost, provider retrying) and editors
 * keep their latched room.
 */
export type RealtimeStatus =
  | "disabled"
  | "connecting"
  | "connected"
  | "offline";

export interface Peer {
  clientId: number;
  userId: string | null;
  name: string;
  color: string;
}

export interface RealtimeRoom {
  ydoc: Y.Doc | null;
  provider: WebsocketProvider | null;
  status: RealtimeStatus;
  peers: Peer[];
  /** True once the provider has received the server's initial state for this
   *  room (the y-websocket `sync` event). Editors that seed an empty CRDT from
   *  a local initial doc MUST wait for this before mounting — seeding while the
   *  fragment still looks empty but the server's content is in flight makes
   *  y-prosemirror merge the initial doc on top of it (BUG-N41 double-seed). */
  synced: boolean;
  /** Bumped when the server evicts the room with the reseed close code
   *  (BUG-N72 / #35): the DB CRDT was rebuilt wholesale, so the local Y.Doc is
   *  stale and the room reopens with a FRESH doc. Gate consumers re-arm the
   *  first-mount skeleton on an epoch change — the old content must not flash
   *  through an HTTP-fallback editor while the new room syncs. */
  epoch: number;
}

interface LocalUser {
  id: string;
  name: string;
}

// Epoch lives in its own state (it survives room close/reopen), so the
// internal room state carries everything else.
type RoomState = Omit<RealtimeRoom, "epoch">;

const DISABLED: RoomState = {
  ydoc: null,
  provider: null,
  status: "disabled",
  peers: [],
  synced: false,
};

/**
 * Open a realtime room for the given entity and expose the live doc, provider,
 * connection status, and remote peers. When realtime is disabled (no
 * VITE_WS_URL) or `enabled` is false (e.g. viewing a version snapshot) it
 * returns a stable disabled shape so the editor uses its HTTP fallback.
 */
export const useYjsRoom = (
  roomId: string,
  user: LocalUser | null,
  enabled: boolean,
): RealtimeRoom => {
  const [room, setRoom] = useState<RoomState>(DISABLED);
  // Bumped on a server reseed eviction — an effect dependency, so the room
  // reopens with a fresh Y.Doc that re-binds from the reseeded DB state.
  const [epoch, setEpoch] = useState(0);
  // Keep the latest user without re-opening the room when only the name changes.
  const userRef = useRef(user);
  userRef.current = user;
  // The session resolves asynchronously, so the room must (re)open once the
  // user id is known — hence userId is an effect dependency below.
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!enabled || !isRealtimeEnabled() || !userRef.current) {
      setRoom(DISABLED);
      return;
    }

    let disposed = false;
    let cleanup: (() => void) | undefined;

    void getRealtimeToken()
      .catch(() => null)
      .then((result) => {
        if (disposed) return;
        // No token (server fn failed / unauthenticated) → the room will never
        // open. Report `offline` instead of staying in the initial `disabled`
        // shape: editors gate their mount on "realtime is resolving" and only
        // fall back to the HTTP editor on `offline` — without this they would
        // hold their loading skeleton forever (BUG-N54 review finding).
        if (!result) {
          setRoom({ ...DISABLED, status: "offline" });
          return;
        }
        const opened = createYjsRoom(roomId, result.token);
        if (!opened) return;

        const { ydoc, provider } = opened;

        // The effect may have been torn down while the token promise was in
        // flight — `createYjsRoom` already opened the socket and registered our
        // awareness, so without this guard the connection leaks as a ghost peer
        // (it lingers until the y-websocket awareness timeout). Destroy it now.
        if (disposed) {
          provider.destroy();
          ydoc.destroy();
          return;
        }

        const localUser = userRef.current;
        if (localUser) {
          provider.awareness.setLocalStateField("user", {
            userId: localUser.id,
            name: localUser.name,
            color: userColor(localUser.id),
          });
        }

        const readPeers = (): Peer[] => {
          const states = provider.awareness.getStates();
          const self = provider.awareness.clientID;
          const peers: Peer[] = [];
          states.forEach((state, clientId) => {
            if (clientId === self) return;
            const u = (
              state as {
                user?: { userId?: string; name?: string; color?: string };
              }
            ).user;
            if (!u) return;
            peers.push({
              clientId,
              userId: u.userId ?? null,
              name: u.name ?? "?",
              color: u.color ?? userColor(String(clientId)),
            });
          });
          return peers;
        };

        // Latches on the first `sync`: the server's initial state has landed, so
        // the fragment now reflects the canonical content and is safe to seed
        // against. Never flips back — a later reconnect re-syncs onto the same doc.
        let synced = provider.synced;
        // BUG-N57: a reachable-but-misbehaving server (accepts the socket,
        // never syncs, drops, retries with ~100ms backoff) must not make the
        // status oscillate forever. Pre-sync drops are counted; past the
        // policy limit (or past the sync deadline for a server that holds the
        // socket open but stays mute) the room latches a TERMINAL `offline`:
        // the provider is destroyed, no further event can flip the status, and
        // the editors fall back to the HTTP path exactly once.
        let latchState = INITIAL_SYNC_LATCH_STATE;
        let lastStatus: RealtimeStatus = "connecting";
        let tornDown = false;
        let syncDeadline: ReturnType<typeof setTimeout> | undefined;

        const teardown = (): void => {
          if (tornDown) return;
          tornDown = true;
          if (syncDeadline !== undefined) clearTimeout(syncDeadline);
          provider.off("status", onStatus);
          provider.off("sync", onSync);
          provider.off("connection-close", onConnectionClose);
          provider.awareness.off("update", onAwareness);
          provider.destroy();
          ydoc.destroy();
        };

        const latchOffline = (): void => {
          teardown();
          if (!disposed) setRoom({ ...DISABLED, status: "offline" });
        };

        const update = (status: RealtimeStatus): void => {
          if (disposed || tornDown) return;
          lastStatus = status;
          setRoom({ ydoc, provider, status, peers: readPeers(), synced });
        };

        const onStatus = (e: { status: string }): void => {
          if (e.status === "connected") {
            // #38 — the socket is OPEN, not yet synced, and the server can still
            // reject it (a bad token closes it milliseconds later). Announcing
            // "connected" here made the presence indicator promise "online" and
            // then fall back to "offline" on every rejected connection. `sync`
            // below is the honest signal; until then this stays `connecting`.
            if (synced) update("connected");
            return;
          }
          if (synced) {
            // Post-sync drop: the provider keeps retrying on the SAME doc and
            // Yjs buffers edits offline, so this is informational (presence
            // dot) — editors keep their latched room (useRealtimeEditorGate).
            update("offline");
            return;
          }
          // Pre-sync drop ("disconnected" after an accepted socket, or
          // "connecting" on a retry attempt). The provider is still retrying,
          // so report `connecting` — never a transient `offline` that would
          // flip the editors onto the HTTP path and back (the remount loop).
          const decision = recordPreSyncDrop(latchState, Date.now());
          latchState = decision.state;
          if (decision.latchOffline) {
            latchOffline();
            return;
          }
          update("connecting");
        };
        // y-websocket emits `sync` with `false` too (reconnect attempts reset
        // the provider's flag) — only a `true` latches.
        const onSync = (isSynced: boolean): void => {
          if (!isSynced) return;
          synced = true;
          if (syncDeadline !== undefined) clearTimeout(syncDeadline);
          update("connected");
        };
        const onAwareness = (): void => update(lastStatus);
        // The ws-server closes with a dedicated code after a server-side actor
        // (Cesare apply / version activate) reseeded the DB CRDT (BUG-N72 /
        // #35). Re-syncing would push this client's STALE local doc back over
        // the fresh state, so instead the provider + Y.Doc are destroyed and
        // the epoch bump reopens the room from scratch.
        const onConnectionClose = (event?: { code?: number } | null): void => {
          if (event?.code !== REALTIME_RESEED_CLOSE_CODE) return;
          teardown();
          if (disposed) return;
          // Reset the room IN THE SAME BATCH as the epoch bump: the epoch-bump
          // render must not still carry the old (destroyed) ydoc, or the gate's
          // latch would survive that render and instantly re-consume the
          // re-armed skeleton — mounting the stale HTTP fallback instead.
          setRoom({ ...DISABLED, status: "connecting" });
          setEpoch((current) => current + 1);
        };

        provider.on("status", onStatus);
        provider.on("sync", onSync);
        provider.on("connection-close", onConnectionClose);
        provider.awareness.on("update", onAwareness);

        syncDeadline = setTimeout(() => {
          if (!synced) latchOffline();
        }, SYNC_DEADLINE_MS);

        update("connecting");

        cleanup = teardown;
      });

    return () => {
      disposed = true;
      cleanup?.();
      setRoom(DISABLED);
    };
    // room.status intentionally excluded — it would re-open the room on every
    // connection-state change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, enabled, userId, epoch]);

  return useMemo(() => ({ ...room, epoch }), [room, epoch]);
};
