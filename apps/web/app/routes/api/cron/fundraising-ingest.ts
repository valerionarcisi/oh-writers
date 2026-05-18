import { createAPIFileRoute } from "@tanstack/start/api";
import { getDb } from "~/server/db";
import { ingestAllActive } from "~/features/fundraising/server/rss.server";

/**
 * Cron endpoint: ingest all active fundraising sources.
 *
 * Auth: header `x-cron-secret` must match `CRON_SECRET` env. If `CRON_SECRET`
 * is unset the endpoint refuses all requests — operators must set it.
 */
export const APIRoute = createAPIFileRoute("/api/cron/fundraising-ingest")({
  POST: async ({ request }) => {
    const expected = process.env["CRON_SECRET"];
    if (!expected) {
      return new Response("Cron secret not configured", { status: 503 });
    }
    const provided = request.headers.get("x-cron-secret");
    if (provided !== expected) {
      return new Response("Unauthorized", { status: 401 });
    }
    const db = await getDb();
    const summary = await ingestAllActive(db);
    return new Response(JSON.stringify(summary), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  },
});
