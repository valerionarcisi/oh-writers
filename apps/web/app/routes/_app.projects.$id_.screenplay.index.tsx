import { useRef, useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { match } from "ts-pattern";
import {
  ScreenplayEditor,
  ScreenplayEditorShell,
  ScreenplayElementChips,
  useScreenplay,
  useVersions,
  type ScreenplayEditorHandle,
  type ElementType,
} from "~/features/screenplay-editor";
import { ResultErrorView } from "~/components/ResultErrorView";
import { useVersionsDrawer } from "~/features/versions";
import { useTopBarSlotPublisher } from "~/features/app-shell";
import { Skeleton } from "@oh-writers/ui";
import styles from "./_app.projects.$id_.editor.module.css";

export const Route = createFileRoute("/_app/projects/$id_/screenplay/")({
  component: ScreenplayEditorPage,
});

function ScreenplayEditorPage() {
  const { id } = Route.useParams();
  const { data: result, isLoading } = useScreenplay(id);
  const screenplayId = result && result.isOk ? result.value.id : "";
  const { data: versionsResult } = useVersions(screenplayId || "");
  const [isCesareOn, setIsCesareOn] = useState(true);
  const [currentElement, setCurrentElement] = useState<ElementType>("action");
  const [metrics, setMetrics] = useState({
    pageCurrent: 1,
    pageTotal: 1,
    sceneCurrent: null as number | null,
    sceneTotal: 0,
  });
  const [rawScenes, setRawScenes] = useState<
    Array<{ number: string; title: string }>
  >([]);
  const editorRef = useRef<ScreenplayEditorHandle>(null);
  const { open: openVersionsDrawer } = useVersionsDrawer();

  // Build the acts array for the Indice popover. Fountain has no explicit act
  // structure, so all scenes live under a single "Sceneggiatura" act.
  const acts = useMemo(
    () =>
      rawScenes.length === 0
        ? undefined
        : [
            {
              name: "Sceneggiatura",
              scenes: rawScenes.map((s, idx) => ({
                number: s.number,
                title: s.title,
                isCurrent: metrics.sceneCurrent === idx + 1,
              })),
            },
          ],
    [rawScenes, metrics.sceneCurrent],
  );

  // Spec 44 — surface the Sceneggiatura element legend in the shell TopBar
  // (second row) for the duration of this route's mount. The legacy Viewbar
  // legend row is removed below; the TopBar now owns the legend.
  const legendNode = useMemo(
    () => (
      <ScreenplayElementChips
        currentElement={currentElement}
        onSetElement={(el) => editorRef.current?.setElement(el)}
      />
    ),
    [currentElement],
  );
  // Chips go into the TopBar center slot (same row as section crumb).
  // elementLegend (second row) is no longer used for screenplay.
  useTopBarSlotPublisher("center", legendNode);

  if (isLoading)
    return (
      <div className={styles.status}>
        <Skeleton
          lines={6}
          widths={["60%", "100%", "100%", "85%", "100%", "70%"]}
          ariaLabel="Caricamento sceneggiatura"
        />
      </div>
    );
  if (!result) return null;

  return match(result)
    .with({ isOk: true }, ({ value }) => {
      return (
        <ScreenplayEditorShell
          title={value.title}
          projectId={id}
          acts={acts}
          topBarCenter={legendNode}
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
        >
          <ScreenplayEditor
            ref={editorRef}
            screenplay={value}
            isCesareOn={isCesareOn}
            onToggleCesare={setIsCesareOn}
            onCurrentElementChange={setCurrentElement}
            onMetricsChange={setMetrics}
            onScenesChange={setRawScenes}
          />
        </ScreenplayEditorShell>
      );
    })
    .with({ isOk: false }, ({ error }) => <ResultErrorView error={error} />)
    .exhaustive();
}
