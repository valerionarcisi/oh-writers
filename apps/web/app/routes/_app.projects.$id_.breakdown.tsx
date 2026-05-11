import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { BreakdownPage } from "~/features/breakdown";

const BreakdownSearchSchema = z.object({
  cat: z.string().optional(),
  status: z.enum(["all", "stale", "pending", "ok"]).optional(),
});

export const Route = createFileRoute("/_app/projects/$id_/breakdown")({
  validateSearch: BreakdownSearchSchema,
  component: BreakdownRoute,
});

function BreakdownRoute() {
  const { id } = Route.useParams();
  return <BreakdownPage projectId={id} />;
}
