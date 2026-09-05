import { createAPIFileRoute } from "@tanstack/start/api";
import { eq } from "drizzle-orm";
import { breakdownElements } from "@oh-writers/db/schema";
import { getDb } from "~/server/db";

/**
 * Test-only endpoint (Spec 89 — AI disclosure stamp) that resets EVERY
 * breakdown element's `everAiTouched` back to false for a project. The real
 * product never resets this flag once true (that's the whole point — Spec
 * 89's permanence invariant), so this exists purely to let a Playwright test
 * restore a clean "nothing was ever Cesare-touched" state between runs on a
 * shared seed project, without leaking a prior test's AI-touched state into
 * the next one.
 *
 * Body: `{ projectId: string }`.
 * Active only when `MOCK_AI=true`; 404s in production so it never leaks.
 */
export const APIRoute = createAPIFileRoute(
  "/api/test/breakdown-reset-ai-touched",
)({
  POST: async ({ request }) => {
    if (process.env["MOCK_AI"] !== "true") {
      return new Response("Not found", { status: 404 });
    }
    const body = (await request.json().catch(() => null)) as {
      projectId?: string;
    } | null;
    if (!body?.projectId) {
      return new Response("Bad request", { status: 400 });
    }

    const db = await getDb();
    await db
      .update(breakdownElements)
      .set({ everAiTouched: false })
      .where(eq(breakdownElements.projectId, body.projectId));

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  },
});
