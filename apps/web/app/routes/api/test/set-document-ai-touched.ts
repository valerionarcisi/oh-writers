import { createAPIFileRoute } from "@tanstack/start/api";
import { and, eq, sql } from "drizzle-orm";
import {
  documents,
  documentVersions,
  cesareSessions,
} from "@oh-writers/db/schema";
import { DocumentTypes, type DocumentType } from "@oh-writers/domain";
import { getDb } from "~/server/db";

/**
 * Test-only endpoint (Spec 89 — AI disclosure stamp) that puts a narrative
 * document into a genuine "Cesare has touched this document" state without
 * driving a real agentic edit turn (the existing cesare-agentic-*.spec.ts
 * specs cover that flow already; this is a faster, more targeted seam for
 * the export-side assertion this spec adds).
 *
 * `everAiTouched` (loadDocumentEverAiTouched) checks whether ANY version in
 * the document's FULL history has a non-null cesareSessionId — production
 * never overwrites a version row, it always INSERTs a new numbered one
 * (auto-version.effect.ts). So `touched: true` INSERTS a new version row
 * with a random cesareSessionId (mirroring the real commit path) rather than
 * mutating the current one in place — an UPDATE would not reproduce the
 * real "history keeps growing, nothing is erased" shape production has, and
 * a test built on it couldn't tell a true permanence bug from a false pass.
 *
 * `cesareSessionId` carries a real DB-level foreign key to `cesare_sessions`
 * (ON DELETE SET NULL) — a random UUID violates it, so `touched: true`
 * reuses an existing session for the document's owner, or creates a
 * minimal one if none exists yet.
 *
 * `reset: true` deletes every version this endpoint has ever inserted for
 * the document (identified by a fixed test label), restoring a clean
 * "nothing Cesare-touched" state between test runs — the alternative of
 * clearing `cesareSessionId` on existing rows would violate the same
 * append-only invariant the endpoint exists to test.
 *
 * Body: `{ projectId: string, type: DocumentType, touched: boolean, reset?: boolean }`.
 * Active only when `MOCK_AI=true`; 404s in production so it never leaks.
 */
const TEST_VERSION_LABEL = "__spec89_test_ai_touched__";

export const APIRoute = createAPIFileRoute("/api/test/set-document-ai-touched")(
  {
    POST: async ({ request }) => {
      if (process.env["MOCK_AI"] !== "true") {
        return new Response("Not found", { status: 404 });
      }
      const body = (await request.json().catch(() => null)) as {
        projectId?: string;
        type?: DocumentType;
        touched?: boolean;
        reset?: boolean;
      } | null;
      if (!body?.projectId || !body.type || typeof body.touched !== "boolean") {
        return new Response("Bad request", { status: 400 });
      }

      const db = await getDb();
      const doc = await db.query.documents.findFirst({
        where: and(
          eq(documents.projectId, body.projectId),
          eq(documents.type, body.type),
        ),
      });
      if (!doc) {
        return new Response(`No document of type ${body.type} for project`, {
          status: 404,
        });
      }

      if (body.reset) {
        await db
          .delete(documentVersions)
          .where(
            and(
              eq(documentVersions.documentId, doc.id),
              eq(documentVersions.label, TEST_VERSION_LABEL),
            ),
          );
      }

      if (body.touched) {
        // documentVersions.createdBy is NOT NULL but documents.createdBy is
        // nullable — reuse an existing version's createdBy (guaranteed to
        // exist, since the document must already have at least a manual
        // seed version) rather than assume the document row has one.
        const [existing] = await db
          .select({
            max: sql<number>`coalesce(max(${documentVersions.number}), 0)`,
            createdBy: sql<string>`(array_agg(${documentVersions.createdBy} order by ${documentVersions.number} desc))[1]`,
          })
          .from(documentVersions)
          .where(eq(documentVersions.documentId, doc.id));
        if (!existing?.createdBy) {
          return new Response(
            "Document has no existing version to derive createdBy from",
            {
              status: 404,
            },
          );
        }
        const existingSession = await db.query.cesareSessions.findFirst({
          where: eq(cesareSessions.projectId, body.projectId),
        });
        const sessionId =
          existingSession?.id ??
          (
            await db
              .insert(cesareSessions)
              .values({
                projectId: body.projectId,
                userId: existing.createdBy,
                title: TEST_VERSION_LABEL,
              })
              .returning({ id: cesareSessions.id })
          )[0]?.id;
        if (!sessionId) {
          return new Response("Failed to resolve a cesare session", {
            status: 500,
          });
        }

        const nextNumber = (existing.max ?? 0) + 1;
        await db.insert(documentVersions).values({
          documentId: doc.id,
          number: nextNumber,
          label: TEST_VERSION_LABEL,
          content: "",
          kind: "checkpoint",
          cesareSessionId: sessionId,
          isDraft: false,
          createdBy: existing.createdBy,
        });
      }

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  },
);
