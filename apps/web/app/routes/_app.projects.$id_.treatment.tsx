import { createFileRoute } from "@tanstack/react-router";
import { assertValidProjectId } from "~/lib/project-route";
import { titleHead } from "~/lib/document-title";
import { DocumentTypes } from "@oh-writers/domain";
import { DocumentRoutePage } from "~/features/documents";

export const Route = createFileRoute("/_app/projects/$id_/treatment")({
  beforeLoad: ({ params }) => assertValidProjectId(params),
  head: () => titleHead("Trattamento"),
  component: () => {
    const { id } = Route.useParams();
    return <DocumentRoutePage type={DocumentTypes.TREATMENT} projectId={id} />;
  },
});
