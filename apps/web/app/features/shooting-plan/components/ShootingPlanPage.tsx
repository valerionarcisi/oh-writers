import { useState, useEffect, Suspense } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  useSuspenseQuery,
  useMutation,
  useQueryClient,
  useQuery,
} from "@tanstack/react-query";
import { useToast } from "@oh-writers/ui";
import {
  scenesWithPlanSummaryQueryOptions,
  getOrCreateInitialPlan,
  shotPlanQueryOptions,
  updateSceneEffort,
  generateShotPlansFromEffort,
} from "../server/shooting-plan.server";
import { EFFORT_LEVELS, EFFORT_LABELS, type EffortLevel } from "@oh-writers/domain";
import { ScriptPanel } from "./ScriptPanel";
import { SceneFountainPanel } from "./SceneFountainPanel";
import { BlockingCard } from "./BlockingCard";
import { ParallelPlansEditor } from "./ParallelPlansEditor";
import { ShootingPlanDock } from "./ShootingPlanDock";
import { useCesareOpen } from "~/features/app-shell";
import { useExportShotList } from "../hooks/useExportShotList";
import styles from "./ShootingPlanPage.module.css";

interface ShootingPlanPageProps {
  projectId: string;
}

const formatMinutes = (m: number): string => {
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h === 0) return `${rem}m`;
  if (rem === 0) return `${h}h`;
  return `${h}h ${rem}m`;
};

export function ShootingPlanPage({ projectId }: ShootingPlanPageProps) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const openCesare = useCesareOpen();
  const { showToast } = useToast();
  const { exportCsv, exportPdf } = useExportShotList(projectId);
  const { data } = useSuspenseQuery(
    scenesWithPlanSummaryQueryOptions(projectId),
  );
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);

  const scenes = data?.isOk ? data.value : [];
  const selectedScene =
    scenes.find((s) => s.sceneId === selectedSceneId) ?? null;

  const initialPlanMut = useMutation({
    mutationFn: async (sceneId: string) =>
      await getOrCreateInitialPlan({ data: { sceneId, projectId } }),
    onSuccess: () => {
      // Only invalidate the shot-plan query (not the scenes list) so the
      // SuspenseQuery for scenes doesn't re-suspend and flash the page blank.
      qc.invalidateQueries({ queryKey: ["shot-plan"] });
    },
  });

  const effortMut = useMutation({
    mutationFn: async ({
      sceneId,
      effort,
    }: {
      sceneId: string;
      effort: EffortLevel;
    }) => updateSceneEffort({ data: { sceneId, projectId, effort } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shooting-plan", "scenes", projectId] });
    },
  });

  const generatePlanMut = useMutation({
    mutationFn: async () =>
      generateShotPlansFromEffort({ data: { projectId } }),
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: ["shot-plan"] });
      void qc.invalidateQueries({
        queryKey: ["shooting-plan", "scenes", projectId],
      });
      if (!result.isOk) {
        showToast({ message: "Errore durante la generazione del piano.", variant: "error" });
        return;
      }
      const { createdCount, skippedCount, estimatedDays } = result.value;
      if (createdCount === 0 && skippedCount > 0) {
        showToast({
          message: `Tutte le ${skippedCount} scene hanno già un piano.`,
          variant: "info",
        });
      } else {
        showToast({
          message: `Piano generato: ${createdCount} scene create${skippedCount > 0 ? `, ${skippedCount} già esistenti` : ""}. Stima: ${estimatedDays} giorn${estimatedDays === 1 ? "o" : "i"} di riprese.`,
          variant: "success",
        });
      }
    },
    onError: () => {
      showToast({ message: "Errore durante la generazione del piano.", variant: "error" });
    },
  });

  useEffect(() => {
    if (selectedSceneId && selectedScene && selectedScene.shotCount === 0) {
      initialPlanMut.mutate(selectedSceneId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSceneId]);

  const planQuery = useQuery({
    ...shotPlanQueryOptions(selectedSceneId ?? "", projectId),
    enabled: !!selectedSceneId,
  });
  const activePlanId: string | null =
    planQuery.data?.isOk && planQuery.data.value != null
      ? (planQuery.data.value.activeScenarioId ?? null)
      : null;

  const scenarioCount: number =
    planQuery.data?.isOk && planQuery.data.value != null
      ? planQuery.data.value.scenarios.length
      : 0;

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (
        (e.metaKey || e.ctrlKey) &&
        e.key.toLowerCase() === "b" &&
        selectedScene &&
        activePlanId
      ) {
        e.preventDefault();
        void navigate({
          to: `/projects/${projectId}/shooting-plan/blocking-editor?scene=${selectedScene.sceneId}&plan=${activePlanId}`,
        });
      }

      if (
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === "g" &&
        !generatePlanMut.isPending
      ) {
        e.preventDefault();
        generatePlanMut.mutate();
      }

      if (
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === "p" &&
        selectedSceneId &&
        !initialPlanMut.isPending
      ) {
        e.preventDefault();
        initialPlanMut.mutate(selectedSceneId);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [projectId, selectedScene, selectedSceneId, activePlanId, navigate, generatePlanMut, initialPlanMut]);

  const totalShots = scenes.reduce((sum, s) => sum + s.shotCount, 0);
  const totalMinutesAll = scenes.reduce(
    (sum, s) => sum + (s.totalMinutes ?? 0),
    0,
  );
  const plannedCount = scenes.filter(
    (s) => s.totalMinutes !== null && s.shotCount > 0,
  ).length;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.headerEyebrow}>Piano di ripresa</span>
          <h1 className={styles.title}>
            {selectedScene
              ? `SC.${selectedScene.sceneNumber} · ${selectedScene.intExt}. ${selectedScene.location}`
              : "Riprese"}
          </h1>
        </div>
        <div className={styles.headerMeta}>
          <span className={styles.headerMetaChip}>
            {scenes.length} {scenes.length === 1 ? "scena" : "scene"}
          </span>
          <span className={styles.headerMetaSep}>·</span>
          <span className={styles.headerMetaChip}>
            {totalShots} {totalShots === 1 ? "inquadratura" : "inquadrature"}
          </span>
          {totalMinutesAll > 0 && (
            <>
              <span className={styles.headerMetaSep}>·</span>
              <span className={styles.headerMetaChip}>
                {formatMinutes(totalMinutesAll)} pianificate
              </span>
            </>
          )}
          {plannedCount > 0 && (
            <>
              <span className={styles.headerMetaSep}>·</span>
              <span className={styles.headerMetaChip}>
                {plannedCount}{" "}
                {plannedCount === 1 ? "scena pianificata" : "scene pianificate"}
              </span>
            </>
          )}
          {scenarioCount > 1 && (
            <>
              <span className={styles.headerMetaSep}>·</span>
              <span className={styles.headerMetaChip} data-highlight>
                {scenarioCount} piani candidati
              </span>
            </>
          )}
        </div>
      </header>

      <div className={styles.body}>
        <aside className={styles.sceneSidebar}>
          <div className={styles.sidebarLabel}>Scene del progetto</div>
          {scenes.length === 0 && (
            <p className={styles.sidebarEmpty}>
              Nessuna scena trovata. Importa una sceneggiatura per iniziare.
            </p>
          )}
          {scenes.map((scene) => {
            const isPlanned =
              scene.totalMinutes !== null && scene.shotCount > 0;
            const isSelected = scene.sceneId === selectedSceneId;
            return (
              <div key={scene.sceneId} className={styles.sceneEntry}>
                <button
                  type="button"
                  className={styles.sceneItem}
                  data-active={isSelected || undefined}
                  onClick={() => setSelectedSceneId(scene.sceneId)}
                >
                  <span className={styles.sceneNumber}>
                    SC.{scene.sceneNumber}
                  </span>
                  <span className={styles.sceneHeading}>
                    {scene.intExt}. {scene.location}
                  </span>
                  <span
                    className={styles.sceneStatus}
                    data-planned={isPlanned || undefined}
                  >
                    {isPlanned
                      ? `● ${scene.shotCount} shot · ${formatMinutes(scene.totalMinutes ?? 0)}`
                      : "○ non pianificata"}
                  </span>
                </button>
                {isSelected && (
                  <div className={styles.effortRow}>
                    {EFFORT_LEVELS.map((level) => (
                      <button
                        key={level}
                        type="button"
                        className={styles.effortPill}
                        data-active={scene.effort === level || undefined}
                        title={EFFORT_LABELS[level]}
                        onClick={() =>
                          effortMut.mutate({
                            sceneId: scene.sceneId,
                            effort: level,
                          })
                        }
                      >
                        {level}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </aside>

        {selectedScene ? (
          <>
            <div className={styles.scriptColumn}>
              <ScriptPanel
                sceneId={selectedScene.sceneId}
                projectId={projectId}
                sceneNumber={selectedScene.sceneNumber}
                sceneHeading={selectedScene.sceneHeading}
                sceneNotes={selectedScene.notes}
                storageKey="ohw:shooting-plan:script-panel:open"
              />
            </div>
            <main className={styles.main}>
              <SceneFountainPanel
                sceneId={selectedScene.sceneId}
                projectId={projectId}
              />
              {activePlanId && (
                <Suspense fallback={null}>
                  <BlockingCard
                    sceneId={selectedScene.sceneId}
                    planId={activePlanId}
                    sceneNumber={selectedScene.sceneNumber}
                    onOpenEditor={() => {
                      void navigate({
                        to: `/projects/${projectId}/shooting-plan/blocking-editor?scene=${selectedScene.sceneId}&plan=${activePlanId}`,
                      });
                    }}
                  />
                </Suspense>
              )}
              <ParallelPlansEditor
                sceneId={selectedScene.sceneId}
                projectId={projectId}
                sceneNumber={selectedScene.sceneNumber}
                scenePageStart={null}
                scenePageEnd={null}
                sceneHasSpecialEffect={false}
                onShotListChanged={() => {
                  if (activePlanId) {
                    void qc.invalidateQueries({
                      queryKey: [
                        "blocking",
                        selectedScene.sceneId,
                        activePlanId,
                      ],
                    });
                  }
                }}
              />
            </main>
          </>
        ) : (
          <main className={styles.main}>
            <div className={styles.mainEmpty}>
              <p>
                Seleziona una scena dalla lista per iniziare a pianificare gli
                shot.
              </p>
            </div>
          </main>
        )}
      </div>

      <ShootingPlanDock
        projectId={projectId}
        suggestedShotCount={0}
        isGenerating={generatePlanMut.isPending}
        onGeneratePlan={() => generatePlanMut.mutate()}
        onPrefill={
          selectedSceneId
            ? () => initialPlanMut.mutate(selectedSceneId)
            : undefined
        }
        onExport={exportCsv}
        onPrint={exportPdf}
        onCesareClick={openCesare}
      />
    </div>
  );
}
