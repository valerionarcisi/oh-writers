import type { IncomingMessage, Server as HttpServer } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, type WebSocket } from "ws";
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
      // Run the async auth/access gate, then either complete the upgrade or
      // reject the raw socket with the right code.
      void (async () => {
        const roomId = roomIdFromUrl(req.url);
        const room = parseRoomId(roomId);
        if (!room) return rejectSocket(socket, CLOSE_NOT_FOUND);

        const session = await validateSession(req);
        if (!session) return rejectSocket(socket, CLOSE_UNAUTHORIZED);

        const access = await resolveRoomAccess(room, session.userId);
        if (access.isErr() || access.value === null) {
          return rejectSocket(socket, CLOSE_FORBIDDEN);
        }

        const canWrite = access.value.canWrite;
        wss.handleUpgrade(req, socket, head, (conn) => {
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

const rejectSocket = (socket: Duplex, code: number): void => {
  // We have not completed the WS handshake, so respond at the HTTP layer.
  const reason =
    code === CLOSE_UNAUTHORIZED
      ? "401 Unauthorized"
      : code === CLOSE_FORBIDDEN
        ? "403 Forbidden"
        : "404 Not Found";
  socket.write(`HTTP/1.1 ${reason.slice(0, 3)} ${reason.slice(4)}\r\n\r\n`);
  socket.destroy();
};
