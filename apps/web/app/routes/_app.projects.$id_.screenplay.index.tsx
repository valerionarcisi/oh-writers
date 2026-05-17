import { useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { match } from "ts-pattern";
import {
  ScreenplayEditor,
  ScreenplayEditorShell,
  ScreenplayElementChips,
  useScreenplay,
  useVersions,
  type ScreenplayEditorHandle,
} from "~/features/screenplay-editor";
import type { ElementType } from "~/features/screenplay-editor/lib/fountain-element-detector";
import { ResultErrorView } from "~/components/ResultErrorView";
import { useVersionsDrawer } from "~/features/versions";
import styles from "./_app.projects.$id_.editor.module.css";

export const Route = createFileRoute("/_app/projects/$id_/screenplay/")({
  component: ScreenplayEditorPage,
});

function ScreenplayEditorPage() {
  const { id } = Route.useParams();
  const { data: result, isLoading } = useScreenplay(id);
  const screenplayId =
    result && result.isOk ? result.value.id : "";
  const { data: versionsResult } = useVersions(screenplayId || "");
  const [isCesareOn, setIsCesareOn] = useState(true);
  const [currentElement, setCurrentElement] = useState<ElementType>("action");
  const editorRef = useRef<ScreenplayEditorHandle>(null);
  const { open: openVersionsDrawer } = useVersionsDrawer();

  if (isLoading) return <div className={styles.status}>Loading…</div>;
  if (!result) return null;

  return match(result)
    .with({ isOk: true }, ({ value }) => {
      return (
        <ScreenplayEditorShell
          title={value.title}
          projectId={id}
          onOpenVersions={() =>
            openVersionsDrawer({ kind: "screenplay", screenplayId: value.id })
          }
          versions={
            versionsResult && versionsResult.isOk
              ? versionsResult.value.map((v, idx) => ({
                  id: v.id,
                  label: v.label ?? `Versione ${idx + 1}`,
                  isCurrent: v.id === value.currentVersionId,
                }))
              : []
          }
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
            onToggleCesare={setIsCesareOn}
            onCurrentElementChange={setCurrentElement}
          />
        </ScreenplayEditorShell>
      );
    })
    .with({ isOk: false }, ({ error }) => <ResultErrorView error={error} />)
    .exhaustive();
}
