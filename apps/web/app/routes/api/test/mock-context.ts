import { createAPIFileRoute } from "@tanstack/start/api";
import {
  setMockContext,
  clearMockContext,
} from "~/features/predictions/_mocks/cesare-tool-loop.mock";

/**
 * Test-only endpoint used by Playwright to seed the mock LLM scenario context.
 *
 * Active only when `MOCK_AI=true`. In production the route returns 404 so it
 * does not leak surface area. Body shape: `{ context: Record<string,string> }`.
 * Passing an empty object clears the current context.
 */
export const APIRoute = createAPIFileRoute("/api/test/mock-context")({
  POST: async ({ request }) => {
    if (process.env["MOCK_AI"] !== "true") {
      return new Response("Not found", { status: 404 });
    }
    const body = (await request.json().catch(() => null)) as {
      context?: Record<string, string>;
    } | null;
    if (!body || typeof body.context !== "object" || body.context === null) {
      return new Response("Bad request", { status: 400 });
    }
    if (Object.keys(body.context).length === 0) {
      clearMockContext();
    } else {
      // Coerce all values to strings for safety; the mock substituter handles
      // numeric coercion via the `{{KEY:number}}` placeholder syntax.
      const safe: Record<string, string> = {};
      for (const [k, v] of Object.entries(body.context)) {
        safe[k] = String(v);
      }
      setMockContext(safe);
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  },
});
