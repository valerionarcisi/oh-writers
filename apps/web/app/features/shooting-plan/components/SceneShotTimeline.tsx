import { useState } from "react";
import {
  useSuspenseQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { unwrapResult } from "@oh-writers/utils";
import {
  shotPlanQueryOptions,
  createShotPlanAndScenario,
  setActiveScenario,
  addShot,
  reorderShots,
} from "../server/shooting-plan.server";
import { ScenarioTabs } from "./ScenarioTabs";
import { ShotBlock } from "./ShotBlock";
import { TransitionBlock } from "./TransitionBlock";
import { ShotDetailPanel } from "./ShotDetailPanel";
import type {
  ShotView,
  TransitionSlotView,
} from "../server/shooting-plan.server";
import styles from "./SceneShotTimeline.module.css";

interface SceneShotTimelineProps {
  sceneId: string;
  projectId: string;
  sceneLabel: string;
}

export function SceneShotTimeline({
  sceneId,
  projectId,
  sceneLabel,
}: SceneShotTimelineProps) {
  const qc = useQueryClient();
  const { data } = useSuspenseQuery(shotPlanQueryOptions(sceneId, projectId));
  const plan = data?.isOk ? data.value : null;

  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(
    plan?.activeScenarioId ?? null,
  );
  const [dragShotId, setDragShotId] = useState<string | null>(null);
  const [selectedShotId, setSelectedShotId] = useState<string | null>(null);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["shot-plan", sceneId] });
    void qc.invalidateQueries({
      queryKey: ["shooting-plan", "scenes", projectId],
    });
  };

  const createMutation = useMutation({
    mutationFn: (name: string) =>
      createShotPlanAndScenario({
        data: { sceneId, projectId, scenarioName: name },
      }).then(unwrapResult),
    onSuccess: (result) => {
      setSelectedScenarioId(result.activeScenarioId ?? null);
      void invalidate();
    },
  });

  const setActiveMutation = useMutation({
    mutationFn: (scenarioId: string) =>
      setActiveScenario({
        data: { shotPlanId: plan!.id, scenarioId, projectId },
      }).then(unwrapResult),
    onSuccess: invalidate,
  });

  const addShotMutation = useMutation({
    mutationFn: () =>
      addShot({
        data: {
          scenarioId: currentScenario!.id,
          shotPlanId: plan!.id,
          projectId,
          shotSize: "MS",
          cameraMovement: "STATIC",
          estimatedMinutes: null,
          notes: null,
          cameraLabel: "A",
        },
      }).then(unwrapResult),
    onSuccess: invalidate,
  });

  const reorderMutation = useMutation({
    mutationFn: (orderedShotIds: string[]) =>
      reorderShots({
        data: {
          scenarioId: currentScenario!.id,
          shotPlanId: plan!.id,
          projectId,
          orderedShotIds,
        },
      }).then(unwrapResult),
    onSuccess: invalidate,
  });

  const currentScenario = plan?.scenarios.find(
    (s) => s.id === (selectedScenarioId ?? plan.activeScenarioId),
  );
  const totalMinutes = currentScenario?.totalMinutes ?? 0;

  const handleDrop = (targetShotId: string) => {
    if (!dragShotId || !currentScenario) return;
    const ids = currentScenario.shots.map((s) => s.id);
    const from = ids.indexOf(dragShotId);
    const to = ids.indexOf(targetShotId);
    if (from === to) return;
    const reordered = [...ids];
    reordered.splice(from, 1);
    reordered.splice(to, 0, dragShotId);
    reorderMutation.mutate(reordered);
    setDragShotId(null);
  };

  const interleaved = interleave(
    currentScenario?.shots ?? [],
    currentScenario?.transitions ?? [],
  );

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.sceneLabel}>{sceneLabel}</span>
        <span className={styles.total}>{totalMinutes}m total</span>
      </div>
      {plan ? (
        <>
          <ScenarioTabs
            scenarios={plan.scenarios}
            activeScenarioId={plan.activeScenarioId}
            onSelect={(id) => {
              setSelectedScenarioId(id);
              setActiveMutation.mutate(id);
            }}
            onAdd={() =>
              createMutation.mutate(
                `Piano ${String.fromCharCode(65 + plan.scenarios.length)}`,
              )
            }
          />
          <div className={styles.body}>
            <div className={styles.canvas}>
              <div className={styles.rulerRow}>
                <div className={styles.trackLabel} />
                <div className={styles.ruler}>
                  {[0, 25, 50, 75, 100].map((pct) => {
                    const mins = Math.round((pct / 100) * totalMinutes);
                    return (
                      <span key={pct} style={{ inlineSize: `${pct}%` }}>
                        {mins}m
                      </span>
                    );
                  })}
                </div>
              </div>
              <div className={styles.track}>
                <span className={styles.trackLabel}>Cam A</span>
                <div
                  className={styles.trackBlocks}
                  style={{ blockSize: "48px" }}
                >
                  {interleaved.map((item) =>
                    item.kind === "shot" ? (
                      <ShotBlock
                        key={item.shot.id}
                        shot={item.shot}
                        widthPct={
                          totalMinutes > 0
                            ? (item.shot.resolvedMinutes / totalMinutes) * 100
                            : 10
                        }
                        isSelected={item.shot.id === selectedShotId}
                        onSelect={() => setSelectedShotId(item.shot.id)}
                        onDragStart={() => setDragShotId(item.shot.id)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => handleDrop(item.shot.id)}
                      />
                    ) : (
                      <TransitionBlock
                        key={item.transition.id}
                        transition={item.transition}
                        widthPct={
                          totalMinutes > 0
                            ? ((item.transition.estimatedMinutes ?? 0) /
                                totalMinutes) *
                              100
                            : 2
                        }
                        onEdit={() => {}}
                      />
                    ),
                  )}
                  <button
                    type="button"
                    className={styles.addShot}
                    onClick={() => addShotMutation.mutate()}
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
            {selectedShotId &&
              currentScenario &&
              (() => {
                const shot = currentScenario.shots.find(
                  (s) => s.id === selectedShotId,
                );
                if (!shot) return null;
                return (
                  <ShotDetailPanel
                    shot={shot}
                    shotPlanId={plan!.id}
                    projectId={projectId}
                    sceneId={sceneId}
                    onClose={() => setSelectedShotId(null)}
                  />
                );
              })()}
          </div>
        </>
      ) : (
        <div className={styles.empty}>
          <button
            type="button"
            className={styles.startBtn}
            onClick={() => createMutation.mutate("Piano A")}
          >
            Inizia piano di ripresa
          </button>
        </div>
      )}
    </div>
  );
}

function interleave(
  shots: ShotView[],
  transitions: TransitionSlotView[],
): Array<
  | { kind: "shot"; shot: ShotView }
  | { kind: "transition"; transition: TransitionSlotView }
> {
  const result: Array<
    | { kind: "shot"; shot: ShotView }
    | { kind: "transition"; transition: TransitionSlotView }
  > = [];
  for (const shot of shots) {
    result.push({ kind: "shot", shot });
    const after = transitions.filter((t) => t.afterShotId === shot.id);
    for (const t of after) result.push({ kind: "transition", transition: t });
  }
  return result;
}
