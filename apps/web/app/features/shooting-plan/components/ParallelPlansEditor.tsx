import { useCallback, useMemo, useState } from "react";
import {
  useSuspenseQuery,
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { unwrapResult } from "@oh-writers/utils";
import type { PatternId, ShotSize, BreakdownSummary } from "@oh-writers/domain";
import { SHOOTING_DAY_MINUTES, recommendPattern } from "@oh-writers/domain";
import {
  shotPlanQueryOptions,
  breakdownSummaryQueryOptions,
  applyPattern,
  addShot,
  deleteShot,
  setActiveScenario,
  moveShot,
  addReverseShot,
  createShotPlanAndScenario,
  type ShotPlanView,
  type ScenarioView,
  type ShotView,
} from "../server/shooting-plan.server";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { PlanPicker } from "./PlanPicker";
import { PlanTrack } from "./PlanTrack";
import { QuickAddToolbar } from "./QuickAddToolbar";
import { ShotContextMenu } from "./ShotContextMenu";
import { ShotDetailPanel } from "./ShotDetailPanel";
import styles from "./ParallelPlansEditor.module.css";

interface ParallelPlansEditorProps {
  sceneId: string;
  projectId: string;
  sceneNumber: number;
  scenePageStart: number | null;
  scenePageEnd: number | null;
  sceneHasSpecialEffect: boolean;
  onShotListChanged?: () => void;
}

const RULER_HOURS = [0, 1, 2, 3, 4, 5, 6, 7, 8];

export function ParallelPlansEditor({
  sceneId,
  projectId,
  scenePageStart,
  scenePageEnd,
  sceneHasSpecialEffect,
  onShotListChanged,
}: ParallelPlansEditorProps) {
  const qc = useQueryClient();
  const { data: planRes } = useSuspenseQuery(
    shotPlanQueryOptions(sceneId, projectId),
  );
  const plan: ShotPlanView | null = planRes?.isOk ? planRes.value : null;

  const { data: breakdownRes } = useQuery(breakdownSummaryQueryOptions(sceneId));
  const breakdown: BreakdownSummary | null = breakdownRes?.isOk
    ? breakdownRes.value
    : null;

  const recommendedPatternId: PatternId | null = useMemo(() => {
    if (!plan) return null;
    return recommendPattern(breakdown, {
      pageStart: scenePageStart,
      pageEnd: scenePageEnd,
      hasSpecialEffect: sceneHasSpecialEffect,
    });
  }, [breakdown, scenePageStart, scenePageEnd, sceneHasSpecialEffect, plan]);

  const [visibleIds, setVisibleIds] = useLocalStorage<string[]>(
    `ohw:shooting-plan:scene:${sceneId}:visible-plans`,
    plan ? plan.scenarios.map((s) => s.id) : [],
  );
  const visibleSet = useMemo(() => new Set(visibleIds), [visibleIds]);

  const visibleScenarios = useMemo(
    () => (plan ? plan.scenarios.filter((s) => visibleSet.has(s.id)) : []),
    [plan, visibleSet],
  );

  const activeHidden =
    !!plan && !!plan.activeScenarioId && !visibleSet.has(plan.activeScenarioId);

  const [dragState, setDragState] = useState<{
    shotId: string;
    sourceScenarioId: string;
  } | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    scenarioId: string;
    position: number;
    leftPct: number;
  } | null>(null);

  const [contextMenu, setContextMenu] = useState<{
    shotId: string;
    position: { x: number; y: number };
  } | null>(null);

  const [selectedShotId, setSelectedShotId] = useState<string | null>(null);
  const selectedShot: ShotView | null = useMemo(() => {
    if (!plan || !selectedShotId) return null;
    for (const s of plan.scenarios) {
      const found = s.shots.find((sh) => sh.id === selectedShotId);
      if (found) return found;
    }
    return null;
  }, [plan, selectedShotId]);

  const invalidate = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ["shot-plan", sceneId] });
    void qc.invalidateQueries({
      queryKey: ["shooting-plan", "scenes", projectId],
    });
    onShotListChanged?.();
  }, [qc, sceneId, projectId, onShotListChanged]);

  const addShotMut = useMutation({
    mutationFn: async (vars: { scenarioId: string; size: ShotSize }) => {
      if (!plan) throw new Error("No plan");
      return addShot({
        data: {
          scenarioId: vars.scenarioId,
          shotPlanId: plan.id,
          projectId,
          shotSize: vars.size,
          cameraMovement: "STATIC",
          estimatedMinutes: null,
          notes: null,
          cameraLabel: "A",
        },
      }).then(unwrapResult);
    },
    onSuccess: invalidate,
  });

  const applyPatternMut = useMutation({
    mutationFn: (vars: { scenarioId: string; patternId: PatternId }) =>
      applyPattern({
        data: { scenarioId: vars.scenarioId, patternId: vars.patternId },
      }).then(unwrapResult),
    onSuccess: invalidate,
  });

  const setActiveMut = useMutation({
    mutationFn: (scenarioId: string) => {
      if (!plan) throw new Error("No plan");
      return setActiveScenario({
        data: { shotPlanId: plan.id, scenarioId, projectId },
      }).then(unwrapResult);
    },
    onSuccess: invalidate,
  });

  const moveShotMut = useMutation({
    mutationFn: (vars: {
      shotId: string;
      targetScenarioId: string;
      position: number;
    }) => moveShot({ data: vars }).then(unwrapResult),
    onSuccess: invalidate,
  });

  const deleteShotMut = useMutation({
    mutationFn: (shotId: string) => {
      if (!plan) throw new Error("No plan");
      return deleteShot({
        data: { shotId, shotPlanId: plan.id, projectId },
      }).then(unwrapResult);
    },
    onSuccess: invalidate,
  });

  const addReverseMut = useMutation({
    mutationFn: (shotId: string) =>
      addReverseShot({ data: { shotId } }).then(unwrapResult),
    onSuccess: invalidate,
  });

  const createPlanMut = useMutation({
    mutationFn: (vars: { name: string }) =>
      createShotPlanAndScenario({
        data: { sceneId, projectId, scenarioName: vars.name },
      }).then(unwrapResult),
    onSuccess: invalidate,
  });

  if (!plan) {
    return (
      <div className={styles.empty}>
        <p>Caricamento piano in corso…</p>
      </div>
    );
  }

  const activeScenarioId = plan.activeScenarioId;

  const handleAddShot = (size: ShotSize) => {
    if (!activeScenarioId) return;
    addShotMut.mutate({ scenarioId: activeScenarioId, size });
  };

  const handleApplyPattern = (patternId: PatternId) => {
    if (!activeScenarioId) return;
    applyPatternMut.mutate({ scenarioId: activeScenarioId, patternId });
  };

  const handleDragStart = (shotId: string, e: React.DragEvent) => {
    const shotWithSc = plan.scenarios
      .flatMap((s) => s.shots.map((sh) => ({ ...sh, scenarioId: s.id })))
      .find((sh) => sh.id === shotId);
    if (!shotWithSc) return;
    setDragState({ shotId, sourceScenarioId: shotWithSc.scenarioId });
    e.dataTransfer.setData("application/x-shot-id", shotId);
    e.dataTransfer.setData(
      "application/x-source-scenario",
      shotWithSc.scenarioId,
    );
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOverTrack =
    (scenarioId: string) => (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (!dragState) return;
      const trackEl = e.currentTarget as HTMLElement;
      const rect = trackEl.getBoundingClientRect();
      const relX = e.clientX - rect.left;
      const scenario = plan.scenarios.find((s) => s.id === scenarioId);
      if (!scenario) return;
      const shotsSorted = [...scenario.shots].sort(
        (a, b) => a.position - b.position,
      );
      let leftPx = 0;
      let position = shotsSorted.length;
      for (let i = 0; i < shotsSorted.length; i++) {
        const sh = shotsSorted[i]!;
        const wPct = (sh.resolvedMinutes / SHOOTING_DAY_MINUTES) * 100;
        const wPx = (wPct / 100) * rect.width;
        if (relX < leftPx + wPx / 2) {
          position = i;
          setDropTarget({
            scenarioId,
            position,
            leftPct: (leftPx / rect.width) * 100,
          });
          return;
        }
        leftPx += wPx + 2;
      }
      setDropTarget({
        scenarioId,
        position,
        leftPct: Math.min(100, (leftPx / rect.width) * 100),
      });
    };

  const handleDropOnTrack =
    (scenarioId: string) => (e: React.DragEvent) => {
      e.preventDefault();
      if (!dragState || !dropTarget) return;
      moveShotMut.mutate({
        shotId: dragState.shotId,
        targetScenarioId: scenarioId,
        position: dropTarget.position,
      });
      setDragState(null);
      setDropTarget(null);
    };

  const handleContextMenuShot = (shotId: string, e: React.MouseEvent) => {
    setContextMenu({ shotId, position: { x: e.clientX, y: e.clientY } });
  };

  const contextShot: ShotView | null = contextMenu
    ? plan.scenarios
        .flatMap((s) => s.shots)
        .find((sh) => sh.id === contextMenu.shotId) ?? null
    : null;

  const contextShotScenario: ScenarioView | null = contextShot
    ? plan.scenarios.find((s) =>
        s.shots.some((sh) => sh.id === contextShot.id),
      ) ?? null
    : null;

  const canAddReverse =
    !!contextShot &&
    (contextShot.shotSize === "OTS" || contextShot.shotSize === "MS") &&
    (breakdown?.castWithDialogue.length ?? 0) === 2;

  return (
    <div className={styles.editor}>
      <div className={styles.pickerRow}>
        <PlanPicker
          scenarios={plan.scenarios}
          visibleScenarioIds={visibleSet}
          onToggleVisible={(sid) => {
            const next = new Set(visibleIds);
            if (next.has(sid)) next.delete(sid);
            else next.add(sid);
            setVisibleIds(Array.from(next));
          }}
          onCreatePlan={() => {
            const nextName = `Piano ${String.fromCharCode(
              65 + plan.scenarios.length,
            )}`;
            createPlanMut.mutate({ name: nextName });
          }}
        />
      </div>

      {activeHidden && (
        <div className={styles.activeHiddenBanner} role="alert">
          Il piano attivo è nascosto —{" "}
          <button
            type="button"
            onClick={() => {
              if (plan.activeScenarioId) {
                setVisibleIds([...visibleIds, plan.activeScenarioId]);
              }
            }}
          >
            mostra
          </button>
        </div>
      )}

      <QuickAddToolbar
        recommendedPatternId={recommendedPatternId}
        onAddShot={handleAddShot}
        onApplyPattern={handleApplyPattern}
        disabled={!activeScenarioId}
      />

      <div className={styles.rulerRow}>
        <div className={styles.rulerLabel}></div>
        <div className={styles.ruler}>
          {RULER_HOURS.map((h) => (
            <span
              key={h}
              className={styles.rulerTick}
              data-end={h === 8 || undefined}
            >
              {h === 8 ? "8h fine GG" : `${h}h`}
            </span>
          ))}
        </div>
      </div>

      <div className={styles.tracks}>
        {visibleScenarios.map((s) => (
          <PlanTrack
            key={s.id}
            scenario={s}
            isActive={s.id === activeScenarioId}
            selectedShotId={selectedShotId}
            onSelectShot={setSelectedShotId}
            onContextMenuShot={handleContextMenuShot}
            onMakeActive={() => setActiveMut.mutate(s.id)}
            onDragStart={handleDragStart}
            onDragOverTrack={handleDragOverTrack(s.id)}
            onDropOnTrack={handleDropOnTrack(s.id)}
            dropIndicatorLeftPct={
              dropTarget?.scenarioId === s.id ? dropTarget.leftPct : null
            }
            dropIndicatorIsSamePlan={
              dropTarget?.scenarioId === s.id &&
              dragState?.sourceScenarioId === s.id
            }
          />
        ))}
      </div>

      {selectedShot && (
        <div className={styles.detailPanel}>
          <ShotDetailPanel
            shot={selectedShot}
            shotPlanId={plan.id}
            projectId={projectId}
            sceneId={sceneId}
            onClose={() => setSelectedShotId(null)}
          />
        </div>
      )}

      {contextMenu && contextShot && contextShotScenario && (
        <ShotContextMenu
          shot={contextShot}
          otherScenarios={plan.scenarios.filter(
            (s) => s.id !== contextShotScenario.id,
          )}
          position={contextMenu.position}
          canAddReverse={canAddReverse}
          onDuplicate={() => {
            addShotMut.mutate({
              scenarioId: contextShotScenario.id,
              size: contextShot.shotSize,
            });
          }}
          onAddReverse={() => addReverseMut.mutate(contextShot.id)}
          onMoveTo={(target) =>
            moveShotMut.mutate({
              shotId: contextShot.id,
              targetScenarioId: target,
              position: 9999,
            })
          }
          onDelete={() => deleteShotMut.mutate(contextShot.id)}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
