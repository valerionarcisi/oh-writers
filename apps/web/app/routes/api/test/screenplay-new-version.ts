import { createAPIFileRoute } from "@tanstack/start/api";
import { eq, desc } from "drizzle-orm";
import { screenplays, screenplayVersions } from "@oh-writers/db/schema";
import { getDb } from "~/server/db";

/**
 * Test-only endpoint (Spec 89 — AI disclosure stamp permanence). Creates a
 * new screenplay version (a copy of the current one's content) and makes it
 * the active version, WITHOUT copying `everAiTouched` — reproducing the real
 * "writer creates a new checkpoint" flow so a test can prove the export
 * still shows the note via an older version's flag, not the active one's.
 *
 * Active only when `MOCK_AI=true`; 404s in production so it never leaks.
 */
export const APIRoute = createAPIFileRoute("/api/test/screenplay-new-version")({
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
    const screenplay = await db.query.screenplays.findFirst({
      where: eq(screenplays.projectId, body.projectId),
    });
    if (!screenplay) {
      return new Response("No screenplay for project", { status: 404 });
    }

    const [latest] = await db
      .select({ number: screenplayVersions.number })
      .from(screenplayVersions)
      .where(eq(screenplayVersions.screenplayId, screenplay.id))
      .orderBy(desc(screenplayVersions.number))
      .limit(1);

    const [inserted] = await db
      .insert(screenplayVersions)
      .values({
        screenplayId: screenplay.id,
        number: (latest?.number ?? 0) + 1,
        label: "__spec89_new_version__",
        content: screenplay.content,
        createdBy: screenplay.createdBy,
      })
      .returning({ id: screenplayVersions.id });

    if (!inserted) {
      return new Response("Failed to insert version", { status: 500 });
    }

    await db
      .update(screenplays)
      .set({ currentVersionId: inserted.id })
      .where(eq(screenplays.id, screenplay.id));

    return new Response(JSON.stringify({ ok: true, versionId: inserted.id }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  },
});
