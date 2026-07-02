import type { Server as HttpServer } from "node:http";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import {
  installPersistence,
  flushAll,
  getYWebsocketUtils,
  reseedRoom,
} from "./persistence-binding.js";
import { attachWsServer } from "./ws-handler.js";
import {
  initRedisSync,
  closeRedisSync,
  publishReseed,
  setReseedHandler,
  type DocResolver,
} from "./redis-sync.js";

const app = new Hono();

app.get("/health", (c) =>
  c.json({
    status: "ok",
    version: "0.1.0",
    ws: "ok",
  }),
);

// Internal: the web app calls this after it reseeds a room's CRDT in the DB
// (Cesare apply / version activate, BUG-N72). The live in-memory room still
// holds the STALE doc and would otherwise persist it back over the reseed and
// keep showing it to connected editors. We drop the live room (no flush) and
// disconnect its clients so they reconnect and re-bind from the fresh DB.
// Guarded by a shared secret so it is not callable from the public internet.
app.post("/internal/reseed-room", async (c) => {
  const secret = process.env["WS_INTERNAL_SECRET"];
  if (secret && c.req.header("x-ws-internal-secret") !== secret) {
    return c.json({ error: "forbidden" }, 403);
  }
  const body = (await c.req.json().catch(() => null)) as {
    docName?: string;
  } | null;
  if (!body?.docName) return c.json({ error: "docName required" }, 400);
  const closed = await reseedRoom(body.docName);
  console.info(
    JSON.stringify({
      event: "ws.room_reseeded",
      docName: body.docName,
      closedConnections: closed,
    }),
  );
  // Multi-instance: peers holding the same room must evict too. No-op
  // without Redis; the self-published message is a harmless re-reseed of an
  // already-dropped room.
  publishReseed(body.docName);
  return c.json({ ok: true, closedConnections: closed });
});

const port = Number(process.env["WS_PORT"] ?? 1234);

const start = async (): Promise<void> => {
  await installPersistence();

  // Cross-instance fan-out resolves an inbound docName to the locally managed
  // y-websocket doc. No-op when REDIS_URL is unset (single-instance default).
  const utils = await getYWebsocketUtils();
  const resolveDoc: DocResolver = (docName) =>
    utils.docs.get(docName) as ReturnType<DocResolver>;
  setReseedHandler((docName) => void reseedRoom(docName));
  await initRedisSync(resolveDoc);

  const server = serve({ fetch: app.fetch, port }) as unknown as HttpServer;
  attachWsServer(server);

  const shutdown = async (): Promise<void> => {
    await flushAll();
    await closeRedisSync();
    server.close();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown());
  process.on("SIGINT", () => void shutdown());
};

void start();
