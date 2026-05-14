import { useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { match } from "ts-pattern";
import {
  ScreenplayEditor,
  ScreenplayEditorShell,
  ScreenplayElementChips,
  useScreenplay,
  type ScreenplayEditorHandle,
} from "~/features/screenplay-editor";
import type { ElementType } from "~/features/screenplay-editor/lib/fountain-element-detector";
import { ResultErrorView } from "~/components/ResultErrorView";
import styles from "./_app.projects.$id_.editor.module.css";

export const Route = createFileRoute("/_app/projects/$id_/screenplay/")({
  component: ScreenplayEditorPage,
});

function ScreenplayEditorPage() {
  const { id } = Route.useParams();
  const { data: result, isLoading } = useScreenplay(id);
  const [isCesareOn, setIsCesareOn] = useState(true);
  const [currentElement, setCurrentElement] = useState<ElementType>("action");
  const editorRef = useRef<ScreenplayEditorHandle>(null);

  if (isLoading) return <div className={styles.status}>Loading…</div>;
  if (!result) return null;

  return match(result)
    .with({ isOk: true }, ({ value }) => (
      <ScreenplayEditorShell
        title={value.title}
        projectId={id}
        isCesareOn={isCesareOn}
        viewbarCenter={
          <ScreenplayElementChips
            currentElement={currentElement}
            onSetElement={(el) => editorRef.current?.setElement(el)}
          />
        }
      >
        <ScreenplayEditor
          ref={editorRef}
          screenplay={value}
          isCesareOn={isCesareOn}
          onToggleCesare={(next) => setIsCesareOn(next)}
          onCurrentElementChange={setCurrentElement}
        />
      </ScreenplayEditorShell>
    ))
    .with({ isOk: false }, ({ error }) => <ResultErrorView error={error} />)
    .exhaustive();
}
