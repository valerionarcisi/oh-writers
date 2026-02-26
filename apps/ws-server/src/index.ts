import { serve } from "@hono/node-server";
import { Hono } from "hono";

const app = new Hono();

app.get("/health", (c) =>
  c.json({
    status: "ok",
    version: "0.1.0",
    ws: "ok",
  }),
);

// WebSocket room handler — Yjs auth + sync implemented in Spec 09
app.get("/room/:roomId", (c) => {
  const roomId = c.req.param("roomId");
  return c.json({ message: "WebSocket upgrade required", roomId }, 426);
});

const port = Number(process.env["WS_PORT"] ?? 1234);

serve({ fetch: app.fetch, port });
