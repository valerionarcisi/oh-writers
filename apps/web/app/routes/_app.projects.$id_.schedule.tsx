import { createFileRoute } from "@tanstack/react-router";
import { SchedulePageV2 } from "~/features/schedule/components/SchedulePageV2";

export const Route = createFileRoute("/_app/projects/$id_/schedule")({
  component: ScheduleRoute,
});

function ScheduleRoute() {
  const { id } = Route.useParams();
  return <SchedulePageV2 projectId={id} />;
}
