import { createAPIFileRoute } from "@tanstack/start/api";

/**
 * Fly.io health check target. `/` redirects unauthenticated requests to
 * /login (307), and Fly's health check treats anything but 200 as unhealthy
 * — this endpoint always returns 200 with no auth/DB dependency, so a
 * healthy process is never marked down for an unrelated reason.
 */
export const APIRoute = createAPIFileRoute("/api/health")({
  GET: () => new Response("ok", { status: 200 }),
});
