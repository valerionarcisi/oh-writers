import { createAPIFileRoute } from "@tanstack/start/api";
import { getUserFromHeaders } from "~/server/context";
import { getDb } from "~/server/db";
import { deleteAiProviderForUser } from "~/features/ai-providers/ai-providers.server";

/**
 * Test-only endpoint: deletes the signed-in user's `ai_providers` row.
 *
 * OHW-844 (Spec 84 Wave 3) exercises the connect wizard against the real
 * server functions (manual-key save, disconnect), which write to the shared
 * test DB. The mock-ui Playwright project runs serially against one DB
 * (`workers:1`, `fullyParallel:false`), so a provider row saved by one test
 * would otherwise leak into the next test's "disconnected" assertions.
 *
 * Active only when `MOCK_AI=true` (404 in production), same gate as every
 * other `/api/test/*` route. No body — always targets the requesting user.
 */
export const APIRoute = createAPIFileRoute("/api/test/reset-ai-provider-state")(
  {
    POST: async ({ request }) => {
      if (process.env["MOCK_AI"] !== "true") {
        return new Response("Not found", { status: 404 });
      }
      const user = await getUserFromHeaders(request.headers);
      if (!user) {
        return new Response("Unauthenticated", { status: 401 });
      }

      const db = await getDb();
      await deleteAiProviderForUser(db, user.id);

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  },
);
