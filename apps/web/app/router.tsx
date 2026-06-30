import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { RouteErrorBoundary, RouteNotFound } from "./features/app-shell";

export function createRouter() {
  return createTanStackRouter({
    routeTree,
    defaultPreload: "intent",
    // Spec 60 — any route render throw renders our branded fallback (with the
    // real stack + a way back) instead of the framework's bare unstyled page.
    defaultErrorComponent: RouteErrorBoundary,
    // Issue #62 — a `notFound()` (e.g. invalid project `$id`) renders the same
    // branded chrome instead of the framework's bare not-found page.
    defaultNotFoundComponent: RouteNotFound,
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createRouter>;
  }
}
