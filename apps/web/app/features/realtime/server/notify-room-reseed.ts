// After a server-side actor reseeds a narrative room's CRDT in the DB (a Cesare
// apply or a version activate, BUG-N72), the live in-memory room in the
// ws-server still holds the STALE doc: it keeps showing the old text to
// connected editors and, on its next flush, persists the stale state back over
// the reseed. This tells the ws-server to drop that live room (no flush) so its
// clients reconnect and re-bind from the fresh DB.
//
// Fire-and-forget: a missing/offline ws-server must never block or fail the
// apply (the DB reseed already landed; cold rooms load it on next open). Only
// PM-room narrative docs have a realtime room — callers pass the document id.

const wsHttpBase = (): string | null => {
  // The ws-server's HTTP port (it serves /health + /internal on the same port
  // as the websocket). Server-side only — never the VITE_ client URL.
  const port = process.env["WS_PORT"];
  if (!port) return null;
  const host = process.env["WS_INTERNAL_HOST"] ?? "127.0.0.1";
  return `http://${host}:${port}`;
};

/**
 * Ask the ws-server to drop the live `document:{documentId}` room so connected
 * editors reload the freshly-reseeded CRDT. Never throws.
 */
export const notifyRoomReseed = async (documentId: string): Promise<void> => {
  const base = wsHttpBase();
  if (!base) return;
  const secret = process.env["WS_INTERNAL_SECRET"];
  try {
    await fetch(`${base}/internal/reseed-room`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(secret ? { "x-ws-internal-secret": secret } : {}),
      },
      body: JSON.stringify({ docName: `document:${documentId}` }),
      // Don't let a hung ws-server stall the request path.
      signal: AbortSignal.timeout(2_000),
    });
  } catch {
    // ws-server down / unreachable: the DB reseed stands, cold rooms pick it up.
  }
};
