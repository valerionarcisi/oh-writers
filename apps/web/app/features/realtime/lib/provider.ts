import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";

/**
 * The realtime collaboration endpoint. When unset (the common dev case and any
 * deploy without a ws-server), realtime is disabled and the editor falls back
 * to the HTTP autosave path — see `isRealtimeEnabled`.
 */
const WS_URL = import.meta.env["VITE_WS_URL"] as string | undefined;

export const isRealtimeEnabled = (): boolean =>
  typeof WS_URL === "string" && WS_URL.length > 0;

export interface YjsRoom {
  ydoc: Y.Doc;
  provider: WebsocketProvider;
}

/**
 * Open a Yjs room over the WebSocket provider. Returns null when realtime is
 * disabled so callers degrade to the non-collaborative path. The session token
 * is forwarded as the `token` query param; the ws-server validates it through
 * Better Auth before any sync.
 */
export const createYjsRoom = (roomId: string, token: string): YjsRoom | null => {
  if (!isRealtimeEnabled() || !WS_URL) return null;

  const ydoc = new Y.Doc();
  const provider = new WebsocketProvider(WS_URL, roomId, ydoc, {
    connect: true,
    params: { token },
  });

  return { ydoc, provider };
};
