import { useEffect, useRef, useState } from "react";
import type * as Y from "yjs";
import type { WebsocketProvider } from "y-websocket";
import { userColor } from "@oh-writers/utils";
import { createYjsRoom, isRealtimeEnabled } from "../lib/provider";
import { getRealtimeToken } from "../server/realtime-token.server";

export type RealtimeStatus = "disabled" | "connecting" | "connected" | "offline";

export interface Peer {
  clientId: number;
  name: string;
  color: string;
}

export interface RealtimeRoom {
  ydoc: Y.Doc | null;
  provider: WebsocketProvider | null;
  status: RealtimeStatus;
  peers: Peer[];
}

interface LocalUser {
  id: string;
  name: string;
}

const DISABLED: RealtimeRoom = {
  ydoc: null,
  provider: null,
  status: "disabled",
  peers: [],
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
  const [room, setRoom] = useState<RealtimeRoom>(DISABLED);
  // Keep the latest user without re-opening the room when only the name changes.
  const userRef = useRef(user);
  userRef.current = user;

  useEffect(() => {
    if (!enabled || !isRealtimeEnabled() || !userRef.current) {
      setRoom(DISABLED);
      return;
    }

    let disposed = false;
    let cleanup: (() => void) | undefined;

    void getRealtimeToken().then((result) => {
      if (disposed || !result) return;
      const opened = createYjsRoom(roomId, result.token);
      if (!opened) return;

      const { ydoc, provider } = opened;
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
          const u = (state as { user?: { name?: string; color?: string } }).user;
          if (!u) return;
          peers.push({
            clientId,
            name: u.name ?? "?",
            color: u.color ?? userColor(String(clientId)),
          });
        });
        return peers;
      };

      const update = (status: RealtimeStatus): void => {
        if (disposed) return;
        setRoom({ ydoc, provider, status, peers: readPeers() });
      };

      const onStatus = (e: { status: string }): void =>
        update(e.status === "connected" ? "connected" : "offline");
      const onSync = (): void => update("connected");
      const onAwareness = (): void => update(statusOf(provider));

      provider.on("status", onStatus);
      provider.on("sync", onSync);
      provider.awareness.on("update", onAwareness);

      update("connecting");

      cleanup = () => {
        provider.off("status", onStatus);
        provider.off("sync", onSync);
        provider.awareness.off("update", onAwareness);
        provider.destroy();
        ydoc.destroy();
      };
    });

    return () => {
      disposed = true;
      cleanup?.();
      setRoom(DISABLED);
    };
    // room.status intentionally excluded — it would re-open the room on every
    // connection-state change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, enabled]);

  return room;
};

const statusOf = (provider: WebsocketProvider): RealtimeStatus =>
  provider.wsconnected ? "connected" : "offline";
