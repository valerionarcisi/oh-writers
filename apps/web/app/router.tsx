import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { RouteErrorBoundary } from "./features/app-shell";

export function createRouter() {
  return createTanStackRouter({
    routeTree,
    defaultPreload: "intent",
    // Spec 60 — any route render throw renders our branded fallback (with the
    // real stack + a way back) instead of the framework's bare unstyled page.
    defaultErrorComponent: RouteErrorBoundary,
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createRouter>;
  }
}
