import { createAPIFileRoute } from "@tanstack/start/api";
import { getDb } from "~/server/db";
import { fundraisingSources, fundraisingItems } from "@oh-writers/db/schema";

/**
 * Test-only endpoint: seed a fundraising source + item for E2E classification
 * tests.
 *
 * Active only when `MOCK_AI=true`. Returns 404 in production.
 * Body: `{ title: string; guid: string; rawText: string }`
 * Response: `{ itemId: string }`
 */
export const APIRoute = createAPIFileRoute("/api/test/fundraising-seed")({
  POST: async ({ request }) => {
    if (process.env["MOCK_AI"] !== "true") {
      return new Response("Not found", { status: 404 });
    }
    const body = (await request.json().catch(() => null)) as {
      title?: string;
      guid?: string;
      rawText?: string;
    } | null;
    if (!body || !body.title || !body.guid) {
      return new Response("Bad request: title and guid required", {
        status: 400,
      });
    }

    const db = await getDb();

    // Upsert a test-only source.
    const [source] = await db
      .insert(fundraisingSources)
      .values({
        name: "E2E Test Source",
        feedUrl: "https://test.ohwriters.dev/feed",
        kind: "generic_rss",
        language: "it",
        isCurated: false,
        isActive: false,
      })
      .onConflictDoUpdate({
        target: fundraisingSources.feedUrl,
        set: { name: "E2E Test Source" },
      })
      .returning({ id: fundraisingSources.id });

    if (!source) {
      return new Response("Failed to upsert test source", { status: 500 });
    }

    const [item] = await db
      .insert(fundraisingItems)
      .values({
        sourceId: source.id,
        guid: body.guid,
        url: `https://test.ohwriters.dev/items/${body.guid}`,
        title: body.title,
        rawHtml: "",
        rawText: body.rawText ?? "",
      })
      .onConflictDoUpdate({
        target: [fundraisingItems.sourceId, fundraisingItems.guid],
        set: {
          title: body.title,
          rawText: body.rawText ?? "",
        },
      })
      .returning({ id: fundraisingItems.id });

    if (!item) {
      return new Response("Failed to insert test item", { status: 500 });
    }

    return new Response(JSON.stringify({ itemId: item.id }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  },
});
