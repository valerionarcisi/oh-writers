import { createFileRoute, redirect } from "@tanstack/react-router";
import { assertValidProjectId } from "~/lib/project-route";

// The logline is authored inside the Soggetto page (Spec 04f), so it has no
// standalone editor route. A `/projects/:id/logline` deep link used to hit the
// router's generic Not Found (audit 2026-06-03, F-08). Redirect it to Soggetto
// so the URL resolves to where the logline actually lives. [OHW-056]
export const Route = createFileRoute("/_app/projects/$id_/logline")({
  beforeLoad: ({ params }) => {
    assertValidProjectId(params);
    throw redirect({ to: "/projects/$id/soggetto", params: { id: params.id } });
  },
});
