import { createFileRoute } from "@tanstack/react-router";
import { titleHead } from "~/lib/document-title";
import { SchedulePage } from "~/features/schedule";

export const Route = createFileRoute("/_app/projects/$id_/schedule")({
  head: () => titleHead("Calendario"),
  component: ScheduleRoute,
});

function ScheduleRoute() {
  const { id } = Route.useParams();
  return <SchedulePage projectId={id} />;
}
