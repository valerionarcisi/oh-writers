import { createFileRoute } from "@tanstack/react-router";

// Spec 60 — dev/test-only route that forces a render throw so the app-wide
// `defaultErrorComponent` (RouteErrorBoundary) can be exercised by E2E. It only
// throws outside a production build, so it can never blank a shipped app.
// Reached at `/crash-test`.
export const Route = createFileRoute("/_app/crash-test")({
  component: CrashTestRoute,
});

function CrashTestRoute() {
  if (import.meta.env.MODE !== "production") {
    // Mirrors the original walk crash shape: an `in` on a null value.
    const nothing = null as unknown as object;
    return <p>{"IP_DIFF" in nothing ? "x" : "y"}</p>;
  }
  return <p>crash-test route</p>;
}
