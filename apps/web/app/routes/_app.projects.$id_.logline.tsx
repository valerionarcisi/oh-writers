import { createFileRoute } from "@tanstack/react-router";
import { match } from "ts-pattern";
import { DocumentTypes } from "@oh-writers/domain";
import { NarrativeEditor } from "~/features/documents";
import { useDocument } from "~/features/documents";
import styles from "./_app.projects.$id_.editor.module.css";

export const Route = createFileRoute("/_app/projects/$id_/logline")({
  component: LoglineEditorPage,
});

function LoglineEditorPage() {
  const { id } = Route.useParams();
  const { data: result, isLoading } = useDocument(id, DocumentTypes.LOGLINE);

  if (isLoading) return <div className={styles.status}>Loading…</div>;
  if (!result) return null;

  return match(result)
    .with({ isOk: true }, ({ value }) => (
      <NarrativeEditor document={value} type={DocumentTypes.LOGLINE} />
    ))
    .with({ isOk: false, error: { _tag: "DocumentNotFoundError" } }, () => (
      <div className={styles.statusError}>Document not found.</div>
    ))
    .with({ isOk: false, error: { _tag: "DbError" } }, () => (
      <div className={styles.statusError}>
        Could not load the document. Please retry.
      </div>
    ))
    .exhaustive();
}
