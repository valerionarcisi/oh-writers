import { createFileRoute } from "@tanstack/react-router";
import { DocumentTypes } from "@oh-writers/domain";
import { DocumentRoutePage } from "~/features/documents";

export const Route = createFileRoute("/_app/projects/$id_/treatment")({
  component: () => {
    const { id } = Route.useParams();
    return <DocumentRoutePage type={DocumentTypes.TREATMENT} projectId={id} />;
  },
});
