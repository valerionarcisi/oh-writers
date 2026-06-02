import type { RealtimeRoom } from "../hooks/useYjsRoom";
import type * as Y from "yjs";
import type { WebsocketProvider } from "y-websocket";

export interface ConnectedRealtime {
  ydoc: Y.Doc;
  provider: WebsocketProvider;
}

/**
 * Build the `{ ydoc, provider }` object an editor passes to its ProseMirror
 * view, but ONLY when the room is fully connected. Any other status (disabled,
 * connecting, offline) yields `null` so the editor keeps its HTTP fallback and
 * never wires `ySyncPlugin` against a half-open provider.
 */
export const buildConnectedRealtime = (
  room: Pick<RealtimeRoom, "status" | "ydoc" | "provider">,
): ConnectedRealtime | null =>
  room.status === "connected" && room.ydoc && room.provider
    ? { ydoc: room.ydoc, provider: room.provider }
    : null;
