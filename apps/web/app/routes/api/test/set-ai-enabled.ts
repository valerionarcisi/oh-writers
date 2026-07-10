import { createAPIFileRoute } from "@tanstack/start/api";
import { setAiEnabledOverrideForTests } from "~/features/feature-flags/resolve-ai-enabled.server";

/**
 * Test-only endpoint: force `Features.AI_ENABLED` on/off for the current
 * server process, bypassing the real provider/trial resolution (Spec 84
 * Wave 2 wires that up). Used by the AI-off state E2E (OHW-846) to drive both
 * branches without a connected provider or a seeded trial-quota fixture.
 *
 * Active only when `MOCK_AI=true` (404 in production, same gate as every
 * other `/api/test/*` route). Body: `{ enabled: boolean | null }` — `null`
 * clears the override and falls back to `resolveAiEnabled`'s real logic.
 */
export const APIRoute = createAPIFileRoute("/api/test/set-ai-enabled")({
  POST: async ({ request }) => {
    if (process.env["MOCK_AI"] !== "true") {
      return new Response("Not found", { status: 404 });
    }
    const body = (await request.json().catch(() => null)) as {
      enabled?: boolean | null;
    } | null;
    if (
      body === null ||
      (typeof body.enabled !== "boolean" && body.enabled !== null)
    ) {
      return new Response("Bad request", { status: 400 });
    }

    setAiEnabledOverrideForTests(body.enabled ?? null);

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  },
});
