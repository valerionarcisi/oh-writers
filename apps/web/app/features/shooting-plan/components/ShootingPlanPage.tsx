import { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  useSuspenseQuery,
  useMutation,
  useQueryClient,
  useQuery,
} from "@tanstack/react-query";
import {
  scenesWithPlanSummaryQueryOptions,
  getOrCreateInitialPlan,
  shotPlanQueryOptions,
} from "../server/shooting-plan.server";
import { ScriptPanel } from "./ScriptPanel";
import { BlockingCard } from "./BlockingCard";
import { ParallelPlansEditor } from "./ParallelPlansEditor";
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
      qc.invalidateQueries({ queryKey: ["shot-plan"] });
      qc.invalidateQueries({
        queryKey: ["shooting-plan", "scenes", projectId],
      });
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

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (
        (e.metaKey || e.ctrlKey) &&
        e.key.toLowerCase() === "b" &&
        selectedScene &&
        activePlanId
      ) {
        e.preventDefault();
        void navigate({ to: `/projects/${projectId}/shooting-plan/blocking-editor?scene=${selectedScene.sceneId}&plan=${activePlanId}` });
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [projectId, selectedScene, activePlanId]);

  const totalShots = scenes.reduce((sum, s) => sum + s.shotCount, 0);
  const plannedCount = scenes.filter(
    (s) => s.totalMinutes !== null && s.shotCount > 0,
  ).length;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.headerEyebrow}>Piano di ripresa</span>
          <h1 className={styles.title}>Inquadrature</h1>
        </div>
        <div className={styles.headerMeta}>
          <span className={styles.headerMetaChip}>
            {scenes.length} {scenes.length === 1 ? "scena" : "scene"}
          </span>
          <span className={styles.headerMetaSep}>·</span>
          <span className={styles.headerMetaChip}>
            {totalShots} {totalShots === 1 ? "shot" : "shot totali"}
          </span>
          {plannedCount > 0 && (
            <>
              <span className={styles.headerMetaSep}>·</span>
              <span className={styles.headerMetaChip}>
                {plannedCount} pianificate
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
            return (
              <button
                key={scene.sceneId}
                type="button"
                className={styles.sceneItem}
                data-active={scene.sceneId === selectedSceneId || undefined}
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
            );
          })}
        </aside>

        {selectedScene ? (
          <>
            <div className={styles.scriptColumn}>
              <ScriptPanel
                sceneNumber={selectedScene.sceneNumber}
                sceneHeading={selectedScene.sceneHeading}
                sceneNotes={null}
                storageKey="ohw:shooting-plan:script-panel:open"
              />
            </div>
            <main className={styles.main}>
              {activePlanId && (
                <BlockingCard
                  sceneId={selectedScene.sceneId}
                  planId={activePlanId}
                  sceneNumber={selectedScene.sceneNumber}
                  onOpenEditor={() => {
                    void navigate({ to: `/projects/${projectId}/shooting-plan/blocking-editor?scene=${selectedScene.sceneId}&plan=${activePlanId}` });
                  }}
                />
              )}
              <ParallelPlansEditor
                key={selectedScene.sceneId}
                sceneId={selectedScene.sceneId}
                projectId={projectId}
                sceneNumber={selectedScene.sceneNumber}
                scenePageStart={null}
                scenePageEnd={null}
                sceneHasSpecialEffect={false}
                onShotListChanged={() => {
                  if (activePlanId) {
                    void qc.invalidateQueries({
                      queryKey: ["blocking", selectedScene.sceneId, activePlanId],
                    });
                  }
                }}
              />
            </main>
          </>
        ) : (
          <main className={styles.main}>
            <div className={styles.mainEmpty}>
              <p>Seleziona una scena dalla lista per iniziare a pianificare gli shot.</p>
            </div>
          </main>
        )}
      </div>
    </div>
  );
}
