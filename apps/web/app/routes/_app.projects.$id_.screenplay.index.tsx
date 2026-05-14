import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { match } from "ts-pattern";
import {
  ScreenplayEditor,
  ScreenplayEditorShell,
  useScreenplay,
} from "~/features/screenplay-editor";
import { ResultErrorView } from "~/components/ResultErrorView";
import styles from "./_app.projects.$id_.editor.module.css";

export const Route = createFileRoute("/_app/projects/$id_/screenplay/")({
  component: ScreenplayEditorPage,
});

function ScreenplayEditorPage() {
  const { id } = Route.useParams();
  const { data: result, isLoading } = useScreenplay(id);
  const [isCesareOn, setIsCesareOn] = useState(true);

  if (isLoading) return <div className={styles.status}>Loading…</div>;
  if (!result) return null;

  return match(result)
    .with({ isOk: true }, ({ value }) => (
      <ScreenplayEditorShell
        title={value.title}
        projectId={id}
        isCesareOn={isCesareOn}
      >
        <ScreenplayEditor
          screenplay={value}
          isCesareOn={isCesareOn}
          onToggleCesare={(next) => setIsCesareOn(next)}
        />
      </ScreenplayEditorShell>
    ))
    .with({ isOk: false }, ({ error }) => <ResultErrorView error={error} />)
    .exhaustive();
}
