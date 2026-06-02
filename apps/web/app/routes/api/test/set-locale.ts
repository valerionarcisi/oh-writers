import { createAPIFileRoute } from "@tanstack/start/api";
import { eq } from "drizzle-orm";
import { db } from "@oh-writers/db";
import { users } from "@oh-writers/db/schema";

/**
 * Test-only endpoint: set the signed-in user's UI locale. Used by the i18n /
 * market-gate E2E to flip between IT and EN without a settings UI. Active only
 * when `MOCK_AI=true` (404 in production). Body: `{ locale: "it" | "en" }`.
 */
export const APIRoute = createAPIFileRoute("/api/test/set-locale")({
  POST: async ({ request }) => {
    if (process.env["MOCK_AI"] !== "true") {
      return new Response("Not found", { status: 404 });
    }
    const body = (await request.json().catch(() => null)) as {
      locale?: string;
    } | null;
    if (body?.locale !== "it" && body?.locale !== "en") {
      return new Response("Bad request", { status: 400 });
    }

    const { getUserFromHeaders } = await import("~/server/context");
    const user = await getUserFromHeaders(request.headers);
    if (!user) return new Response("Unauthorized", { status: 401 });

    await db
      .update(users)
      .set({ locale: body.locale })
      .where(eq(users.id, user.id));

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  },
});
