import { createFileRoute } from "@tanstack/react-router";
import { match } from "ts-pattern";
import { VersionsList, useScreenplay } from "~/features/screenplay-editor";
import { ResultErrorView } from "~/components/ResultErrorView";
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

  return match(result)
    .with({ isOk: true }, ({ value }) => (
      <VersionsList projectId={id} screenplayId={value.id} />
    ))
    .with({ isOk: false }, ({ error }) => <ResultErrorView error={error} />)
    .exhaustive();
}
