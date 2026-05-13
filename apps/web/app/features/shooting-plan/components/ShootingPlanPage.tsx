import { useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { scenesWithPlanSummaryQueryOptions } from "../server/shooting-plan.server";
import { SceneShotTimeline } from "./SceneShotTimeline";
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
  const { data } = useSuspenseQuery(
    scenesWithPlanSummaryQueryOptions(projectId),
  );
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);

  const scenes = data?.isOk ? data.value : [];
  const selectedScene =
    scenes.find((s) => s.sceneId === selectedSceneId) ?? null;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Piano di Ripresa</h1>
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
        <main className={styles.main}>
          {selectedScene ? (
            <SceneShotTimeline
              key={selectedScene.sceneId}
              sceneId={selectedScene.sceneId}
              projectId={projectId}
              sceneLabel={`SC.${selectedScene.sceneNumber} ${selectedScene.location}`}
            />
          ) : (
            <div className={styles.mainEmpty}>
              <p>
                Seleziona una scena dalla lista per iniziare a pianificare gli
                shot.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
