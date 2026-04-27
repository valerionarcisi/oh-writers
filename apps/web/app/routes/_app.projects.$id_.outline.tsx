import { createFileRoute } from "@tanstack/react-router";
import { match } from "ts-pattern";
import { DocumentTypes } from "@oh-writers/domain";
import { NarrativeEditor, useDocument } from "~/features/documents";
import { ResultErrorView } from "~/components/ResultErrorView";
import styles from "./_app.projects.$id_.editor.module.css";

export const Route = createFileRoute("/_app/projects/$id_/outline")({
  component: OutlineEditorPage,
});

function OutlineEditorPage() {
  const { id } = Route.useParams();
  const { data: result, isLoading } = useDocument(id, DocumentTypes.OUTLINE);

  if (isLoading) return <div className={styles.status}>Loading…</div>;
  if (!result) return null;

  return match(result)
    .with({ isOk: true }, ({ value }) => (
      <NarrativeEditor document={value} type={DocumentTypes.OUTLINE} />
    ))
    .with({ isOk: false }, ({ error }) => <ResultErrorView error={error} />)
    .exhaustive();
}
