import { createFileRoute } from "@tanstack/react-router";
import { SchedulePage } from "~/features/schedule";

export const Route = createFileRoute("/_app/projects/$id_/schedule")({
  component: ScheduleRoute,
});

function ScheduleRoute() {
  const { id } = Route.useParams();
  return <SchedulePage projectId={id} />;
}
