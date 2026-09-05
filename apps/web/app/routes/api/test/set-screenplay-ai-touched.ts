import { createAPIFileRoute } from "@tanstack/start/api";
import { and, eq } from "drizzle-orm";
import { screenplays, screenplayVersions } from "@oh-writers/db/schema";
import { getDb } from "~/server/db";

/**
 * Test-only endpoint (Spec 89 — AI disclosure stamp).
 *
 * POST sets a screenplay version to `everAiTouched = <touched>` — the
 * CURRENT version by default, or an explicit `versionId` (must belong to
 * the same screenplay) to simulate the flag living on a NON-active version,
 * so a Playwright test can put a screenplay into a genuine "Cesare has
 * touched this screenplay" state without driving a real Cesare generation
 * turn — including the permanence case where the flag is set on a past
 * version and the writer has since switched the active version away from
 * it (the export must still show the note; see ai-disclosure-stamp.spec.ts).
 *
 * GET `?projectId=…` returns `{ anyVersionAiTouched: boolean }` — whether
 * ANY version of the screenplay (not just current) has the flag set. Used
 * to verify a REAL Cesare tool call (propose_screenplay_revision) actually
 * set `everAiTouched: true` on the draft it created, as direct plumbing
 * coverage alongside the export-level assertion.
 *
 * Active only when `MOCK_AI=true`; 404s in production so it never leaks.
 */
export const APIRoute = createAPIFileRoute(
  "/api/test/set-screenplay-ai-touched",
)({
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
    const screenplay = await db.query.screenplays.findFirst({
      where: eq(screenplays.projectId, projectId),
    });
    if (!screenplay) {
      return new Response("No screenplay for project", { status: 404 });
    }
    const touchedVersion = await db.query.screenplayVersions.findFirst({
      where: and(
        eq(screenplayVersions.screenplayId, screenplay.id),
        eq(screenplayVersions.everAiTouched, true),
      ),
    });
    return new Response(
      JSON.stringify({ anyVersionAiTouched: touchedVersion !== undefined }),
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
      versionId?: string;
    } | null;
    if (!body?.projectId || typeof body.touched !== "boolean") {
      return new Response("Bad request", { status: 400 });
    }

    const db = await getDb();
    const screenplay = await db.query.screenplays.findFirst({
      where: eq(screenplays.projectId, body.projectId),
    });
    if (!screenplay) {
      return new Response("No screenplay for project", { status: 404 });
    }
    const targetVersionId = body.versionId ?? screenplay.currentVersionId;
    if (!targetVersionId) {
      return new Response("No screenplay/current version for project", {
        status: 404,
      });
    }

    await db
      .update(screenplayVersions)
      .set({ everAiTouched: body.touched })
      .where(
        and(
          eq(screenplayVersions.id, targetVersionId),
          eq(screenplayVersions.screenplayId, screenplay.id),
        ),
      );

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  },
});
