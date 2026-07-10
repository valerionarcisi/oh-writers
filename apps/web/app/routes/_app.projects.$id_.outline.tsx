import { createFileRoute } from "@tanstack/react-router";
import { assertValidProjectId } from "~/lib/project-route";
import { titleHead } from "~/lib/document-title";
import { DocumentTypes } from "@oh-writers/domain";
import { DocumentRoutePage } from "~/features/documents";
import { Route as appRoute } from "./_app";

export const Route = createFileRoute("/_app/projects/$id_/outline")({
  beforeLoad: ({ params }) => assertValidProjectId(params),
  head: () => titleHead("Scaletta"),
  component: () => {
    const { id } = Route.useParams();
    const { user } = appRoute.useLoaderData();
    return (
      <DocumentRoutePage
        type={DocumentTypes.OUTLINE}
        projectId={id}
        currentUser={user}
      />
    );
  },
});
