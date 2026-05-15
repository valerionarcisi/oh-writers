import { useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { match } from "ts-pattern";
import {
  ScreenplayCesarePanel,
  ScreenplayEditor,
  ScreenplayEditorShell,
  ScreenplayElementChips,
  useScreenplay,
  type ScreenplayEditorHandle,
} from "~/features/screenplay-editor";
import type { ElementType } from "~/features/screenplay-editor/lib/fountain-element-detector";
import { ResultErrorView } from "~/components/ResultErrorView";
import { useVersionsDrawer } from "~/features/versions";
import styles from "./_app.projects.$id_.editor.module.css";

export const Route = createFileRoute("/_app/projects/$id_/screenplay/")({
  component: ScreenplayEditorPage,
});

interface Metrics {
  pageCurrent: number;
  pageTotal: number;
  sceneCurrent: number | null;
  sceneTotal: number;
}

function ScreenplayEditorPage() {
  const { id } = Route.useParams();
  const { data: result, isLoading } = useScreenplay(id);
  const [isCesareOn, setIsCesareOn] = useState(true);
  const [currentElement, setCurrentElement] = useState<ElementType>("action");
  const [metrics, setMetrics] = useState<Metrics>({
    pageCurrent: 1,
    pageTotal: 1,
    sceneCurrent: null,
    sceneTotal: 0,
  });
  const editorRef = useRef<ScreenplayEditorHandle>(null);
  const { open: openVersionsDrawer } = useVersionsDrawer();

  if (isLoading) return <div className={styles.status}>Loading…</div>;
  if (!result) return null;

  return match(result)
    .with({ isOk: true }, ({ value }) => (
      <ScreenplayEditorShell
        title={value.title}
        projectId={id}
        onOpenVersions={() =>
          openVersionsDrawer({ kind: "screenplay", screenplayId: value.id })
        }
        viewbarCenter={
          <ScreenplayElementChips
            currentElement={currentElement}
            onSetElement={(el) => editorRef.current?.setElement(el)}
          />
        }
        cesareSide={
          isCesareOn ? (
            <ScreenplayCesarePanel
              projectId={id}
              screenplayId={value.id}
              versionId={value.currentVersionId ?? null}
              pageCurrent={metrics.pageCurrent}
              pageTotal={metrics.pageTotal}
              sceneCurrent={metrics.sceneCurrent}
              sceneTotal={metrics.sceneTotal}
              onApplyEdit={(find, replace) =>
                editorRef.current?.applyEdit(find, replace) ?? false
              }
            />
          ) : null
        }
      >
        <ScreenplayEditor
          ref={editorRef}
          screenplay={value}
          isCesareOn={isCesareOn}
          onToggleCesare={(next) => setIsCesareOn(next)}
          onCurrentElementChange={setCurrentElement}
          onMetricsChange={setMetrics}
        />
      </ScreenplayEditorShell>
    ))
    .with({ isOk: false }, ({ error }) => <ResultErrorView error={error} />)
    .exhaustive();
}
