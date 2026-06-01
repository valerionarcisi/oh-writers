import type { IncomingMessage, Server as HttpServer } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, type WebSocket } from "ws";

// The `upgrade` handler receives the raw socket as a Duplex; we never write to
// it directly (handleUpgrade owns it), the type is just for the listener arg.
import { validateSession } from "./auth-bridge.js";
import { parseRoomId, resolveRoomAccess } from "./room.js";
import { getYWebsocketUtils } from "./persistence-binding.js";
import { attachViewerConnection } from "./viewer-connection.js";

// WebSocket close codes (spec §Error Codes).
const CLOSE_UNAUTHORIZED = 4001;
const CLOSE_FORBIDDEN = 4003;
const CLOSE_NOT_FOUND = 4004;

const roomIdFromUrl = (url: string | undefined): string =>
  decodeURIComponent((url ?? "/").slice(1).split("?")[0] ?? "");

/**
 * Attach the Yjs WebSocket upgrade handler to the shared HTTP server. Every
 * connection is authenticated and access-checked BEFORE any Yjs message flows:
 * - no session → 4001
 * - unknown/garbage room or non-existent entity → 4004
 * - valid user without project access → 4003
 * Editors get the standard y-websocket sync; viewers get a read-only connection.
 */
export const attachWsServer = (server: HttpServer): void => {
  const wss = new WebSocketServer({ noServer: true });

  server.on(
    "upgrade",
    (req: IncomingMessage, socket: Duplex, head: Buffer) => {
      // We always complete the WS handshake first, then close with a specific
      // code on rejection. A pre-handshake socket.destroy() would only surface
      // as an abnormal 1006 on the client — completing the upgrade lets us send
      // a real close frame (4001/4003/4004) the client can act on.
      void (async () => {
        const roomId = roomIdFromUrl(req.url);
        const room = parseRoomId(roomId);
        const session = room ? await validateSession(req) : null;
        const access =
          room && session ? await resolveRoomAccess(room, session.userId) : null;

        let rejectCode: number | null = null;
        let canWrite = false;
        if (!room) {
          rejectCode = CLOSE_NOT_FOUND;
        } else if (!session) {
          rejectCode = CLOSE_UNAUTHORIZED;
        } else if (!access || access.isErr()) {
          rejectCode = CLOSE_FORBIDDEN;
        } else if (access.value.kind === "not-found") {
          rejectCode = CLOSE_NOT_FOUND;
        } else if (access.value.kind === "forbidden") {
          rejectCode = CLOSE_FORBIDDEN;
        } else {
          canWrite = access.value.access.canWrite;
        }

        wss.handleUpgrade(req, socket, head, (conn) => {
          if (rejectCode !== null) {
            // Close with the application code only once the socket is OPEN, so
            // the close frame is actually transmitted (closing during CONNECTING
            // drops the frame and the client sees a bare 1006).
            const closeWithCode = (): void => conn.close(rejectCode);
            if (conn.readyState === conn.OPEN) closeWithCode();
            else conn.once("open", closeWithCode);
            return;
          }
          void onConnection(conn, roomId, canWrite);
        });
      })();
    },
  );
};

const onConnection = async (
  conn: WebSocket,
  roomId: string,
  canWrite: boolean,
): Promise<void> => {
  const utils = await getYWebsocketUtils();

  if (canWrite) {
    utils.setupWSConnection(conn, { url: `/${roomId}` }, {
      docName: roomId,
      gc: true,
    });
    return;
  }

  // Read-only path: ensure the shared doc exists (loads persisted state via the
  // bindState hook), then attach a write-blocked connection.
  const docMap = utils.docs;
  let doc = docMap.get(roomId);
  if (!doc) {
    // getYDoc creates + binds the doc through the registered persistence.
    (utils as unknown as { getYDoc: (n: string, gc: boolean) => unknown }).getYDoc(
      roomId,
      true,
    );
    doc = docMap.get(roomId);
  }
  if (!doc) {
    conn.close(CLOSE_NOT_FOUND);
    return;
  }
  attachViewerConnection(
    conn,
    doc as unknown as Parameters<typeof attachViewerConnection>[1],
  );
};
