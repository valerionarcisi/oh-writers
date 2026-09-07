import { createAPIFileRoute } from "@tanstack/start/api";
import { eq } from "drizzle-orm";
import { locationRequirements } from "@oh-writers/db/schema";
import { getDb } from "~/server/db";

/**
 * Test-only endpoint (Spec 89b — AI disclosure stamp, locations).
 *
 * POST sets a location requirement's `everAiTouched = <touched>`, so a
 * Playwright test can put a requirement into a genuine "Cesare has touched
 * this" state without driving a real add_candidate/
 * create_location_requirement tool call. Per-requirement, not per-project —
 * mirrors `breakdown_elements.everAiTouched`'s granularity (unlike budget/
 * schedule, which use a single project-level flag).
 *
 * GET `?requirementId=…` returns `{ everAiTouched: boolean }` — used to
 * verify a REAL Cesare tool call (add_candidate) actually set the flag, as
 * direct plumbing coverage alongside the export-level assertion. Mirrors
 * `set-schedule-ai-touched.ts`.
 *
 * Active only when `MOCK_AI=true`; 404s in production so it never leaks.
 */
export const APIRoute = createAPIFileRoute(
  "/api/test/set-location-requirement-ai-touched",
)({
  GET: async ({ request }) => {
    if (process.env["MOCK_AI"] !== "true") {
      return new Response("Not found", { status: 404 });
    }
    const url = new URL(request.url);
    const requirementId = url.searchParams.get("requirementId");
    if (!requirementId) {
      return new Response("Bad request", { status: 400 });
    }
    const db = await getDb();
    const requirement = await db.query.locationRequirements.findFirst({
      where: eq(locationRequirements.id, requirementId),
    });
    if (!requirement) {
      return new Response("Requirement not found", { status: 404 });
    }
    return new Response(
      JSON.stringify({ everAiTouched: requirement.everAiTouched }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  },
  POST: async ({ request }) => {
    if (process.env["MOCK_AI"] !== "true") {
      return new Response("Not found", { status: 404 });
    }
    const body = (await request.json().catch(() => null)) as {
      requirementId?: string;
      touched?: boolean;
    } | null;
    if (!body?.requirementId || typeof body.touched !== "boolean") {
      return new Response("Bad request", { status: 400 });
    }

    const db = await getDb();
    const requirement = await db.query.locationRequirements.findFirst({
      where: eq(locationRequirements.id, body.requirementId),
    });
    if (!requirement) {
      return new Response("Requirement not found", { status: 404 });
    }

    await db
      .update(locationRequirements)
      .set({ everAiTouched: body.touched })
      .where(eq(locationRequirements.id, body.requirementId));

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  },
});
