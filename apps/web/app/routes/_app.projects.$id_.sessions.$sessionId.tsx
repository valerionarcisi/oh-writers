import { createFileRoute } from "@tanstack/react-router";
import { SessionConversationPage } from "~/features/predictions";

// Spec 47-A5 — `/projects/:id/sessions/:sessionId` — the deep-linkable central
// conversation route. Param validation + ownership/same-project guard run in
// the page's `getSession` server fn (fail closed → not-found body, no leak).
export const Route = createFileRoute("/_app/projects/$id_/sessions/$sessionId")(
  {
    component: SessionConversationRoute,
  },
);

function SessionConversationRoute() {
  const { id, sessionId } = Route.useParams();
  return <SessionConversationPage projectId={id} sessionId={sessionId} />;
}
