import { createFileRoute } from "@tanstack/react-router";
import { titleHead } from "~/lib/document-title";
import { assertValidProjectId } from "~/lib/project-route";
import { z } from "zod";
import { BreakdownPage } from "~/features/breakdown";

const BreakdownSearchSchema = z.object({
  cat: z.string().optional(),
  status: z.enum(["all", "stale", "pending", "ok"]).optional(),
});

export const Route = createFileRoute("/_app/projects/$id_/breakdown")({
  beforeLoad: ({ params }) => assertValidProjectId(params),
  head: () => titleHead("Breakdown"),
  validateSearch: BreakdownSearchSchema,
  component: BreakdownRoute,
});

function BreakdownRoute() {
  const { id } = Route.useParams();
  return <BreakdownPage projectId={id} />;
}
