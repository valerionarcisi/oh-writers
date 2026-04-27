import { createFileRoute } from "@tanstack/react-router";
import { BreakdownPage } from "~/features/breakdown";

export const Route = createFileRoute("/_app/projects/$id_/breakdown")({
  component: BreakdownRoute,
});

function BreakdownRoute() {
  const { id } = Route.useParams();
  return <BreakdownPage projectId={id} />;
}
