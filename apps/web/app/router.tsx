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
    // Fallback for a TRULY unknown URL (no matching route). The common #62 case
    // (invalid project `$id`) redirects to the styled `/not-found` route instead
    // — a router-rendered not-found is hoisted above `__root`'s document shell
    // and comes out unstyled, so it is only the last-resort here.
    defaultNotFoundComponent: RouteNotFound,
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createRouter>;
  }
}
