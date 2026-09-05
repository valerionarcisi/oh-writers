import { createAPIFileRoute } from "@tanstack/start/api";
import { asc, eq } from "drizzle-orm";
import { breakdownElements, breakdownOccurrences } from "@oh-writers/db/schema";
import type { OccurrenceSourceDb } from "@oh-writers/db/schema";
import { getDb } from "~/server/db";

/**
 * Test-only endpoint (Spec 89 — AI disclosure stamp) that sets the `source`
 * of ONE breakdown occurrence for a project, so a Playwright test can put a
 * project into a genuine "Cesare has touched this breakdown" state without
 * driving the real LLM tool (all `breakdown-cesare.spec.ts` E2E paths for
 * that are currently skipped — no reliable UI trigger for `source: "cesare"`
 * exists yet).
 *
 * Mirrors what every real write path does (llm-spoglio.server.ts,
 * cesare-suggest.server.ts, cesare-tools.ts): setting `source: "cesare"` also
 * sets `breakdownElements.everAiTouched = true`, permanently — this hook
 * calls that out explicitly rather than only writing the occurrence column,
 * so a test exercising "touched once, corrected later" produces the same
 * state a real Cesare tool call would.
 *
 * `elementIndex` (0-based, ordered by `breakdownElements.createdAt`) picks
 * WHICH element's occurrence to touch — occurrences are never overwritten in
 * production (an existing one is skipped, never updated), so simulating "one
 * element was Cesare-touched once and never again, while another element's
 * occurrence is manual" needs two distinct elements, not the same row flipped
 * back and forth.
 *
 * Body: `{ projectId: string, source: "regex" | "cesare" | "manual",
 * elementIndex?: number }` (elementIndex defaults to 0).
 * Active only when `MOCK_AI=true`; 404s in production so it never leaks.
 */
export const APIRoute = createAPIFileRoute(
  "/api/test/breakdown-set-occurrence-source",
)({
  POST: async ({ request }) => {
    if (process.env["MOCK_AI"] !== "true") {
      return new Response("Not found", { status: 404 });
    }
    const body = (await request.json().catch(() => null)) as {
      projectId?: string;
      source?: OccurrenceSourceDb;
      elementIndex?: number;
    } | null;
    if (!body?.projectId || !body.source) {
      return new Response("Bad request", { status: 400 });
    }
    const elementIndex = body.elementIndex ?? 0;

    const db = await getDb();
    const elements = await db.query.breakdownElements.findMany({
      where: eq(breakdownElements.projectId, body.projectId),
      orderBy: asc(breakdownElements.createdAt),
      limit: elementIndex + 1,
    });
    const element = elements[elementIndex];
    if (!element) {
      return new Response(
        `No breakdown element at index ${elementIndex} for project`,
        { status: 404 },
      );
    }
    const occurrence = await db.query.breakdownOccurrences.findFirst({
      where: eq(breakdownOccurrences.elementId, element.id),
    });
    if (!occurrence) {
      return new Response("No breakdown occurrence found for element", {
        status: 404,
      });
    }

    await db
      .update(breakdownOccurrences)
      .set({ source: body.source })
      .where(eq(breakdownOccurrences.id, occurrence.id));

    if (body.source === "cesare" && !element.everAiTouched) {
      await db
        .update(breakdownElements)
        .set({ everAiTouched: true })
        .where(eq(breakdownElements.id, element.id));
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  },
});
