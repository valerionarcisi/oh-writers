import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { match } from "ts-pattern";
import { Drawer } from "@oh-writers/ui";
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

const CESARE_NARROW_BREAKPOINT_PX = 1100;

function useIsNarrowViewport(thresholdPx: number): boolean {
  const [isNarrow, setIsNarrow] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const query = window.matchMedia(`(max-width: ${thresholdPx - 1}px)`);
    const onChange = () => setIsNarrow(query.matches);
    onChange();
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [thresholdPx]);
  return isNarrow;
}

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
  const isNarrow = useIsNarrowViewport(CESARE_NARROW_BREAKPOINT_PX);
  const [isCesareDrawerOpen, setIsCesareDrawerOpen] = useState(false);

  if (isLoading) return <div className={styles.status}>Loading…</div>;
  if (!result) return null;

  return match(result)
    .with({ isOk: true }, ({ value }) => {
      const cesarePanel = (
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
      );

      const handleToggleCesare = (next: boolean) => {
        if (isNarrow) {
          setIsCesareOn(true);
          setIsCesareDrawerOpen(next);
          return;
        }
        setIsCesareOn(next);
      };

      const cesareToggleState = isNarrow ? isCesareDrawerOpen : isCesareOn;

      return (
        <>
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
            cesareSide={!isNarrow && isCesareOn ? cesarePanel : null}
          >
            <ScreenplayEditor
              ref={editorRef}
              screenplay={value}
              isCesareOn={cesareToggleState}
              onToggleCesare={handleToggleCesare}
              onCurrentElementChange={setCurrentElement}
              onMetricsChange={setMetrics}
            />
          </ScreenplayEditorShell>

          {isNarrow && (
            <Drawer
              isOpen={isCesareDrawerOpen}
              onClose={() => setIsCesareDrawerOpen(false)}
              title="Note di Cesare"
              width={360}
            >
              {cesarePanel}
            </Drawer>
          )}
        </>
      );
    })
    .with({ isOk: false }, ({ error }) => <ResultErrorView error={error} />)
    .exhaustive();
}
