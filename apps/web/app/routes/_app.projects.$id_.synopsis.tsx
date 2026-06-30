import { createFileRoute } from "@tanstack/react-router";
import { assertValidProjectId } from "~/lib/project-route";
import { titleHead } from "~/lib/document-title";
import { DocumentTypes } from "@oh-writers/domain";
import { DocumentRoutePage } from "~/features/documents";

export const Route = createFileRoute("/_app/projects/$id_/synopsis")({
  beforeLoad: ({ params }) => assertValidProjectId(params),
  head: () => titleHead("Sinossi"),
  component: () => {
    const { id } = Route.useParams();
    return <DocumentRoutePage type={DocumentTypes.SYNOPSIS} projectId={id} />;
  },
});
