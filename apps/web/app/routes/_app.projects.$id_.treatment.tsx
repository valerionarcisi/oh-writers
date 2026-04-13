import { createFileRoute } from "@tanstack/react-router";
import { DocumentTypes } from "@oh-writers/domain";
import { NarrativeEditor, useDocument } from "~/features/documents";
import styles from "./_app.projects.$id_.editor.module.css";

export const Route = createFileRoute("/_app/projects/$id_/treatment")({
  component: TreatmentEditorPage,
});

function TreatmentEditorPage() {
  const { id } = Route.useParams();
  const { data: result, isLoading } = useDocument(id, DocumentTypes.TREATMENT);

  if (isLoading) return <div className={styles.status}>Loading…</div>;
  if (!result) return null;
  if (!result.isOk)
    return <div className={styles.statusError}>Document not found.</div>;

  return (
    <NarrativeEditor document={result.value} type={DocumentTypes.TREATMENT} />
  );
}
