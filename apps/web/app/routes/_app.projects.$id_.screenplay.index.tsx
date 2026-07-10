import { useRef, useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { match } from "ts-pattern";
import { Features } from "@oh-writers/domain";
import {
  ScreenplayEditor,
  ScreenplayCesarePanel,
  ScreenplayEditorShell,
  ScreenplayElementChips,
  useScreenplay,
  type ScreenplayEditorHandle,
  type ElementType,
} from "~/features/screenplay-editor";
import { ResultErrorView } from "~/components/ResultErrorView";
import { Skeleton } from "@oh-writers/ui";
import { useFeature } from "~/features/feature-flags";
import styles from "./_app.projects.$id_.editor.module.css";
import { Route as appRoute } from "./_app";

export const Route = createFileRoute("/_app/projects/$id_/screenplay/")({
  component: ScreenplayEditorPage,
});

export function ScreenplayEditorPage() {
  const { id } = Route.useParams();
  const { user } = appRoute.useLoaderData();
  const { data: result, isLoading } = useScreenplay(id);
  // Spec 84 §5 — the screenplay Cesare panel (+ its shell toggle button) is an
  // AI surface: hidden entirely when off, never a disabled toggle.
  const isAiEnabled = useFeature(Features.AI_ENABLED);
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

  // Versioni + export/import are published into the TopBar actions menu by the
  // editor itself (Spec 55a) — the route no longer wires a versions drawer.

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

  // Element-type chips go into the shell Viewbar (second row, below TopBar).
  const legendNode = useMemo(
    () => (
      <ScreenplayElementChips
        currentElement={currentElement}
        onSetElement={(el) => editorRef.current?.setElement(el)}
      />
    ),
    [currentElement],
  );

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
          viewbarCenter={legendNode}
          {...(isAiEnabled
            ? {
                cesarePanel: (
                  <ScreenplayCesarePanel
                    projectId={id}
                    screenplayId={value.id}
                    versionId={value.currentVersionId}
                    pageCurrent={metrics.pageCurrent}
                    pageTotal={metrics.pageTotal}
                    sceneCurrent={metrics.sceneCurrent}
                    sceneTotal={metrics.sceneTotal}
                  />
                ),
                isCesarePanelOpen: isCesareOn,
                onToggleCesarePanel: () => setIsCesareOn((prev) => !prev),
              }
            : {})}
        >
          <ScreenplayEditor
            // Remount when the active version changes (Attiva / + Nuova
            // versione): the editor seeds its content from `screenplay` once on
            // mount, so a key tied to the active version forces a fresh seed
            // from the now-active version's content. Without this the routed
            // Versions surface would switch the DB pointer but leave the open
            // editor stuck on the previous version.
            key={value.currentVersionId ?? "live"}
            ref={editorRef}
            screenplay={value}
            isCesareOn={isAiEnabled && isCesareOn}
            onToggleCesare={setIsCesareOn}
            onCurrentElementChange={setCurrentElement}
            onMetricsChange={setMetrics}
            onScenesChange={setRawScenes}
            currentUser={user}
          />
        </ScreenplayEditorShell>
      );
    })
    .with({ isOk: false }, ({ error }) => <ResultErrorView error={error} />)
    .exhaustive();
}
