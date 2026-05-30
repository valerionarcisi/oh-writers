import { createFileRoute } from "@tanstack/react-router";
import { titleHead } from "~/lib/document-title";
import { DocumentTypes } from "@oh-writers/domain";
import { DocumentRoutePage } from "~/features/documents";

export const Route = createFileRoute("/_app/projects/$id_/outline")({
  head: () => titleHead("Scaletta"),
  component: () => {
    const { id } = Route.useParams();
    return <DocumentRoutePage type={DocumentTypes.OUTLINE} projectId={id} />;
  },
});
