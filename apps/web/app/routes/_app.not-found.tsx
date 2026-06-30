import { createFileRoute } from "@tanstack/react-router";
import { titleHead } from "~/lib/document-title";
import { RouteNotFound } from "~/features/app-shell";

// Issue #62 — a real route under `_app` that renders the branded not-found like
// any other page (so __root's `<body>` + `global.css` are present and it is
// styled). Routes that reject an invalid param (`assertValidProjectId`) redirect
// HERE instead of throwing `notFound()`: the router's not-found rendering happens
// ABOVE the document shell and comes out unstyled, whereas a normal routed
// component is inside it.
export const Route = createFileRoute("/_app/not-found")({
  head: () => titleHead("Pagina non trovata"),
  component: RouteNotFound,
});
