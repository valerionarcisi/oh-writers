import { createFileRoute } from "@tanstack/react-router";
import { VersionsList } from "~/features/screenplay-editor/components/VersionsList";
import { useScreenplay } from "~/features/screenplay-editor";
import styles from "./_app.projects.$id_.editor.module.css";

export const Route = createFileRoute("/_app/projects/$id_/screenplay/versions")(
  {
    component: VersionsPage,
  },
);

function VersionsPage() {
  const { id } = Route.useParams();
  const { data: result, isLoading } = useScreenplay(id);

  if (isLoading) return <div className={styles.status}>Loading…</div>;
  if (!result) return null;
  if (!result.isOk)
    return <div className={styles.statusError}>Screenplay not found.</div>;

  return <VersionsList projectId={id} screenplayId={result.value.id} />;
}
