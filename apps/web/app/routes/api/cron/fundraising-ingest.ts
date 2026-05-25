import { createAPIFileRoute } from "@tanstack/start/api";
import { getDb } from "~/server/db";
import { ingestAllActive } from "~/features/fundraising/server/rss.server";
import { classifyPendingItems } from "~/features/fundraising/server/classify.server";

/**
 * Cron endpoint: ingest all active fundraising sources, then classify any
 * newly ingested items that haven't been classified yet.
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
    const ingestSummary = await ingestAllActive(db);

    // Classification runs after ingestion. A classification failure must not
    // fail the whole cron run — ingestion data is still valuable without it.
    const classifyResult = await classifyPendingItems(db);
    const classifiedCount = classifyResult.isOk() ? classifyResult.value : 0;
    if (classifyResult.isErr()) {
      console.error(
        `[fundraising] classification batch error: ${classifyResult.error.message}`,
      );
    }

    return new Response(
      JSON.stringify({ ...ingestSummary, classified: classifiedCount }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  },
});
