import { createAPIFileRoute } from "@tanstack/start/api";
import { eq } from "drizzle-orm";
import { budgets } from "@oh-writers/db/schema";
import { getDb } from "~/server/db";

/**
 * Test-only endpoint (Spec 89b — AI disclosure stamp, budget).
 *
 * POST sets a project's budget to `everAiTouched = <touched>`, so a
 * Playwright test can put a budget into a genuine "Cesare has touched this
 * budget" state without driving a real add_budget_line/update_budget_line/
 * etc. tool call.
 *
 * GET `?projectId=…` returns `{ everAiTouched: boolean }` — the budget's
 * current flag value. Used to verify a REAL Cesare tool call
 * (add_budget_line) actually set the flag, as direct plumbing coverage
 * alongside the export-level assertion. Mirrors
 * `set-schedule-ai-touched.ts`.
 *
 * Active only when `MOCK_AI=true`; 404s in production so it never leaks.
 */
export const APIRoute = createAPIFileRoute("/api/test/set-budget-ai-touched")({
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
    const budget = await db.query.budgets.findFirst({
      where: eq(budgets.projectId, projectId),
    });
    if (!budget) {
      return new Response("No budget for project", { status: 404 });
    }
    return new Response(
      JSON.stringify({ everAiTouched: budget.everAiTouched }),
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
    const budget = await db.query.budgets.findFirst({
      where: eq(budgets.projectId, body.projectId),
    });
    if (!budget) {
      return new Response("No budget for project", { status: 404 });
    }

    await db
      .update(budgets)
      .set({ everAiTouched: body.touched })
      .where(eq(budgets.id, budget.id));

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  },
});
