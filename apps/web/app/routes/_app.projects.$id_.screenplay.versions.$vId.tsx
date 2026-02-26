import { createFileRoute } from "@tanstack/react-router";
import { VersionViewer } from "~/features/screenplay-editor/components/VersionViewer";
import { useVersion } from "~/features/screenplay-editor/hooks/useVersions";
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
  if (!result.isOk)
    return <div className={styles.statusError}>Version not found.</div>;

  return <VersionViewer projectId={id} version={result.value} />;
}
