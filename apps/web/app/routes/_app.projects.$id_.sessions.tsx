import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Features } from "@oh-writers/domain";
import { assertValidProjectId } from "~/lib/project-route";
import { titleHead } from "~/lib/document-title";
import { requireFeature } from "~/lib/feature-route-guard";

// Spec 47-A5 — parent for the Cesare sessions routes. Escapes the
// `/_app/projects/$id` overview layout (`$id_`) so the landing and the central
// conversation fully replace the main content. Renders only an Outlet.
//
// Spec 84 §5: gated behind `Features.AI_ENABLED` — pairs with AppShell hiding
// the LeftRail "Sessioni Cesare" entry (nav absence alone is never the only
// guard). A direct deep link to a session when AI is off redirects to the
// project home instead of rendering a chat with nothing to power it.
export const Route = createFileRoute("/_app/projects/$id_/sessions")({
  beforeLoad: async ({ params }) => {
    assertValidProjectId(params);
    await requireFeature(Features.AI_ENABLED, params.id);
  },
  head: () => titleHead("Cesare"),
  component: () => <Outlet />,
});
