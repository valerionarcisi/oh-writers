import { createFileRoute } from "@tanstack/react-router";
import { NewSessionLandingPage } from "~/features/predictions";

// Spec 52 — `/projects/:id/sessions/new` — the full-screen, glowy Cesare
// new-session landing (Notion AI style). A static segment, so the router
// prefers it over the dynamic `/sessions/$sessionId` conversation route. The
// landing engages the AppShell focus mode for its lifetime; submitting the first
// message creates the session and routes to its central conversation.
export const Route = createFileRoute("/_app/projects/$id_/sessions/new")({
  component: NewSessionLandingRoute,
});

function NewSessionLandingRoute() {
  const { id } = Route.useParams();
  return <NewSessionLandingPage projectId={id} />;
}
