import { createAPIFileRoute } from "@tanstack/start/api";
import { eq } from "drizzle-orm";
import { schedules } from "@oh-writers/db/schema";
import { getDb } from "~/server/db";

/**
 * Test-only endpoint (Spec 89 — AI disclosure stamp).
 *
 * POST sets a project's schedule to `everAiTouched = <touched>`, so a
 * Playwright test can put a schedule into a genuine "Cesare has touched
 * this schedule" state without driving a real move_scene_to_day/merge_days/
 * swap_scenes tool call.
 *
 * GET `?projectId=…` returns `{ everAiTouched: boolean }` — the schedule's
 * current flag value. Used to verify a REAL Cesare tool call
 * (move_scene_to_day) actually set the flag, as direct plumbing coverage
 * alongside the export-level assertion.
 *
 * Active only when `MOCK_AI=true`; 404s in production so it never leaks.
 */
export const APIRoute = createAPIFileRoute("/api/test/set-schedule-ai-touched")(
  {
    GET: async ({ request }) => {
      if (process.env["MOCK_AI"] !== "true") {
        return new Response("Not found", { status: 404 });
      }
      const url = new URL(request.url);
      const projectId = url.searchParams.get("projectId");
      if (!projectId) {
        return new Response("Bad request", { status: 400 });
      }
      const db = await getDb();
      const schedule = await db.query.schedules.findFirst({
        where: eq(schedules.projectId, projectId),
      });
      if (!schedule) {
        return new Response("No schedule for project", { status: 404 });
      }
      return new Response(
        JSON.stringify({ everAiTouched: schedule.everAiTouched }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    },
    POST: async ({ request }) => {
      if (process.env["MOCK_AI"] !== "true") {
        return new Response("Not found", { status: 404 });
      }
      const body = (await request.json().catch(() => null)) as {
        projectId?: string;
        touched?: boolean;
      } | null;
      if (!body?.projectId || typeof body.touched !== "boolean") {
        return new Response("Bad request", { status: 400 });
      }

      const db = await getDb();
      const schedule = await db.query.schedules.findFirst({
        where: eq(schedules.projectId, body.projectId),
      });
      if (!schedule) {
        return new Response("No schedule for project", { status: 404 });
      }

      await db
        .update(schedules)
        .set({ everAiTouched: body.touched })
        .where(eq(schedules.id, schedule.id));

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  },
);
