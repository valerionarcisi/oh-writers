import type { Server as HttpServer } from "node:http";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { installPersistence, flushAll } from "./persistence-binding.js";
import { attachWsServer } from "./ws-handler.js";

const app = new Hono();

app.get("/health", (c) =>
  c.json({
    status: "ok",
    version: "0.1.0",
    ws: "ok",
  }),
);

const port = Number(process.env["WS_PORT"] ?? 1234);

const start = async (): Promise<void> => {
  await installPersistence();

  const server = serve({ fetch: app.fetch, port }) as unknown as HttpServer;
  attachWsServer(server);

  const shutdown = async (): Promise<void> => {
    await flushAll();
    server.close();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown());
  process.on("SIGINT", () => void shutdown());
};

void start();
