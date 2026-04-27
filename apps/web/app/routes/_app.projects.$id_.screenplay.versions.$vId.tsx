import { createFileRoute } from "@tanstack/react-router";
import { match } from "ts-pattern";
import { VersionViewer, useVersion } from "~/features/screenplay-editor";
import { ResultErrorView } from "~/components/ResultErrorView";
import styles from "./_app.projects.$id_.editor.module.css";

export const Route = createFileRoute(
  "/_app/projects/$id_/screenplay/versions/$vId",
)({
  component: VersionViewerPage,
});

function VersionViewerPage() {
  const { id, vId } = Route.useParams();
  const { data: result, isLoading } = useVersion(vId);

  if (isLoading) return <div className={styles.status}>Loading version…</div>;
  if (!result) return null;

  return match(result)
    .with({ isOk: true }, ({ value }) => (
      <VersionViewer projectId={id} version={value} />
    ))
    .with({ isOk: false }, ({ error }) => <ResultErrorView error={error} />)
    .exhaustive();
}
