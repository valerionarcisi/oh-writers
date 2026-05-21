import { createAPIFileRoute } from "@tanstack/start/api";
import { and, eq } from "drizzle-orm";
import { screenplays, screenplayVersions } from "@oh-writers/db/schema";
import { getDb } from "~/server/db";
import { clearScreenplayProposals } from "~/features/predictions/cesare-screenplay-tools";

/**
 * Test-only endpoint that wipes transient screenplay state between Playwright
 * tests so a prior test's DRAFT version or in-memory proposal does not leak
 * into the next one.
 *
 * Body shape: `{ projectId: string }`. The endpoint:
 *  - deletes every `screenplayVersions` row with `isDraft = true` for the
 *    screenplay owned by the given project
 *  - clears the in-memory `PROPOSAL_STORE` bucket for that screenplay
 *
 * Active only when `MOCK_AI=true`; returns 404 in production so it never
 * leaks. Always returns `{ ok: true }` even when there is nothing to clean.
 */
export const APIRoute = createAPIFileRoute("/api/test/reset-screenplay-state")({
  POST: async ({ request }) => {
    if (process.env["MOCK_AI"] !== "true") {
      return new Response("Not found", { status: 404 });
    }
    const body = (await request.json().catch(() => null)) as {
      projectId?: string;
    } | null;
    if (!body || typeof body.projectId !== "string") {
      return new Response("Bad request", { status: 400 });
    }

    const db = await getDb();
    const screenplay = await db.query.screenplays.findFirst({
      where: eq(screenplays.projectId, body.projectId),
    });
    if (!screenplay) {
      return new Response(JSON.stringify({ ok: true, cleared: 0 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const deleted = await db
      .delete(screenplayVersions)
      .where(
        and(
          eq(screenplayVersions.screenplayId, screenplay.id),
          eq(screenplayVersions.isDraft, true),
        ),
      )
      .returning({ id: screenplayVersions.id });

    clearScreenplayProposals(screenplay.id);

    return new Response(JSON.stringify({ ok: true, cleared: deleted.length }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  },
});
