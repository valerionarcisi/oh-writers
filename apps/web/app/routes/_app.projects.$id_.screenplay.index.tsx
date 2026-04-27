import { createFileRoute } from "@tanstack/react-router";
import { match } from "ts-pattern";
import { ScreenplayEditor, useScreenplay } from "~/features/screenplay-editor";
import { ResultErrorView } from "~/components/ResultErrorView";
import styles from "./_app.projects.$id_.editor.module.css";

export const Route = createFileRoute("/_app/projects/$id_/screenplay/")({
  component: ScreenplayEditorPage,
});

function ScreenplayEditorPage() {
  const { id } = Route.useParams();
  const { data: result, isLoading } = useScreenplay(id);

  if (isLoading) return <div className={styles.status}>Loading…</div>;
  if (!result) return null;

  return match(result)
    .with({ isOk: true }, ({ value }) => (
      <ScreenplayEditor screenplay={value} />
    ))
    .with({ isOk: false }, ({ error }) => <ResultErrorView error={error} />)
    .exhaustive();
}
