import { createFileRoute } from "@tanstack/react-router";
import { SessionsLandingPage } from "~/features/predictions";

// Spec 47-A5 — `/projects/:id/sessions` — the full Cesare sessions landing.
export const Route = createFileRoute("/_app/projects/$id_/sessions/")({
  component: SessionsLandingRoute,
});

function SessionsLandingRoute() {
  const { id } = Route.useParams();
  return <SessionsLandingPage projectId={id} />;
}
