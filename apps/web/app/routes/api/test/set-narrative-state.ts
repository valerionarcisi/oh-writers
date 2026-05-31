import { createAPIFileRoute } from "@tanstack/start/api";
import { and, eq } from "drizzle-orm";
import {
  documents,
  documentVersions,
  screenplays,
} from "@oh-writers/db/schema";
import { DocumentTypes, type DocumentType } from "@oh-writers/domain";
import { getDb } from "~/server/db";

/**
 * Test-only endpoint (Spec 50 / OHW-050) that sets a project's narrative
 * documents to a known content state so the next-step suggestion is
 * deterministic in Playwright. The suggestion is derived from which documents
 * have content; this lets a test stand a project at "empty" (→ logline) or
 * "logline only" (→ soggetto) without touching the shared seed.
 *
 * Body shape: `{ projectId: string, present: DocumentType[],
 * clearScreenplay?: boolean }`. Every narrative document type listed in
 * `present` is set to non-empty placeholder content; every type NOT listed is
 * cleared to "". The active version row (when present) is updated too, since
 * reads resolve live content from the version. When `clearScreenplay` is true
 * the project's screenplay content is wiped, standing the project at a genuine
 * "from-scratch" state (no upstream screenplay) — needed to reproduce Bug #3.
 *
 * A GET with `?projectId=…&type=…` returns `{ length, content }` for the live
 * content of a narrative document, so a test can assert a generation ACTUALLY
 * wrote content (DB-level proof, not just the chat text).
 *
 * Active only when `MOCK_AI=true`; returns 404 in production so it never leaks.
 */

const NARRATIVE_DOC_TYPES: ReadonlyArray<DocumentType> = [
  DocumentTypes.LOGLINE,
  DocumentTypes.SOGGETTO,
  DocumentTypes.SYNOPSIS,
  DocumentTypes.OUTLINE,
  DocumentTypes.TREATMENT,
];

const PLACEHOLDER_BY_TYPE: Readonly<Record<DocumentType, string>> = {
  logline: "Un detective insonne insegue un killer in una città silenziosa.",
  soggetto: "Soggetto di prova per il test OHW-050.",
  synopsis: "Sinossi di prova per il test OHW-050.",
  outline: "1. Scena uno.\n2. Scena due.",
  treatment: "Trattamento di prova per il test OHW-050.",
};

export const APIRoute = createAPIFileRoute("/api/test/set-narrative-state")({
  GET: async ({ request }) => {
    if (process.env["MOCK_AI"] !== "true") {
      return new Response("Not found", { status: 404 });
    }
    const url = new URL(request.url);
    const projectId = url.searchParams.get("projectId");
    const type = url.searchParams.get("type") as DocumentType | null;
    if (!projectId || !type) {
      return new Response("Bad request", { status: 400 });
    }
    const db = await getDb();
    const doc = await db.query.documents.findFirst({
      where: and(eq(documents.projectId, projectId), eq(documents.type, type)),
    });
    let content = doc?.content ?? "";
    if (doc?.currentVersionId) {
      const version = await db.query.documentVersions.findFirst({
        where: eq(documentVersions.id, doc.currentVersionId),
      });
      if (version) content = version.content;
    }
    return new Response(JSON.stringify({ length: content.length, content }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  },
  POST: async ({ request }) => {
    if (process.env["MOCK_AI"] !== "true") {
      return new Response("Not found", { status: 404 });
    }
    const body = (await request.json().catch(() => null)) as {
      projectId?: string;
      present?: string[];
      clearScreenplay?: boolean;
    } | null;
    if (!body || typeof body.projectId !== "string") {
      return new Response("Bad request", { status: 400 });
    }
    const present = new Set(body.present ?? []);

    const db = await getDb();

    if (body.clearScreenplay === true) {
      await db
        .update(screenplays)
        .set({ content: "", updatedAt: new Date() })
        .where(eq(screenplays.projectId, body.projectId));
    }

    for (const type of NARRATIVE_DOC_TYPES) {
      const content = present.has(type) ? PLACEHOLDER_BY_TYPE[type] : "";

      const existing = await db.query.documents.findFirst({
        where: and(
          eq(documents.projectId, body.projectId),
          eq(documents.type, type),
        ),
      });

      // Narrative document rows are pre-seeded for every project, so the test
      // only needs to update existing rows. A missing row is left untouched.
      if (!existing) continue;

      await db
        .update(documents)
        .set({ content, updatedAt: new Date() })
        .where(eq(documents.id, existing.id));

      if (existing.currentVersionId) {
        await db
          .update(documentVersions)
          .set({ content, updatedAt: new Date() })
          .where(eq(documentVersions.id, existing.currentVersionId));
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  },
});
