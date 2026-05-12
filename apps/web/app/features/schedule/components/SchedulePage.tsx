import { useState } from "react";
import {
  useSuspenseQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { unwrapResult } from "@oh-writers/utils";
import {
  scheduleQueryOptions,
  generateSchedule,
  moveStrip,
  toggleStripLock,
  updateShootingDay,
  addShootingDay,
  removeShootingDay,
  updateStripEffort,
} from "../server/schedule.server";
import { StripBoard } from "./StripBoard";
import { UnscheduledTray } from "./UnscheduledTray";
import { SceneDrawer } from "./SceneDrawer";
import { ShootingDayDrawer } from "./ShootingDayDrawer";
import type { StripView, ShootingDayView } from "../server/schedule.server";
import styles from "./SchedulePage.module.css";

interface SchedulePageProps {
  projectId: string;
}

type ViewMode = "days" | "weeks";

export function SchedulePage({ projectId }: SchedulePageProps) {
  const qc = useQueryClient();
  const { data } = useSuspenseQuery(scheduleQueryOptions(projectId));
  const [draggingStripId, setDraggingStripId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("days");
  const [selectedStrip, setSelectedStrip] = useState<StripView | null>(null);
  const [selectedDay, setSelectedDay] = useState<ShootingDayView | null>(null);

  const schedule = data?.isOk ? data.value : null;

  const invalidate = () =>
    qc.refetchQueries({ queryKey: ["schedule", projectId] });

  const generateMutation = useMutation({
    mutationFn: () =>
      generateSchedule({ data: { projectId } }).then(unwrapResult),
    onSuccess: invalidate,
  });

  const moveMutation = useMutation({
    mutationFn: (vars: {
      stripId: string;
      targetDayId: string | null;
      targetPosition: number;
    }) => moveStrip({ data: vars }).then(unwrapResult),
    onSuccess: invalidate,
  });

  const lockMutation = useMutation({
    mutationFn: (stripId: string) =>
      toggleStripLock({ data: { stripId } }).then(unwrapResult),
    onSuccess: invalidate,
  });

  const dateMutation = useMutation({
    mutationFn: (vars: { dayId: string; date: string | null }) =>
      updateShootingDay({
        data: { dayId: vars.dayId, patch: { date: vars.date } },
      }).then(unwrapResult),
    onSuccess: invalidate,
  });

  const addDayMutation = useMutation({
    mutationFn: () => {
      if (!schedule) throw new Error("no schedule");
      return addShootingDay({
        data: {
          scheduleId: schedule.id,
          afterDayNumber: schedule.shootingDays.length,
        },
      }).then(unwrapResult);
    },
    onSuccess: invalidate,
  });

  const removeDayMutation = useMutation({
    mutationFn: (dayId: string) =>
      removeShootingDay({ data: { dayId } }).then(unwrapResult),
    onSuccess: invalidate,
  });

  const effortMutation = useMutation({
    mutationFn: (vars: { stripId: string; estimatedHours: number | null }) =>
      updateStripEffort({ data: vars }).then(unwrapResult),
    onSuccess: (updatedSchedule) => {
      // Optimistically keep day drawer open with fresh data
      if (selectedDay) {
        const fresh = updatedSchedule.shootingDays.find(
          (d) => d.id === selectedDay.id,
        );
        if (fresh) setSelectedDay(fresh);
      }
      invalidate();
    },
  });

  const handleDrop = (dayId: string, position: number) => {
    if (!draggingStripId) return;
    moveMutation.mutate({
      stripId: draggingStripId,
      targetDayId: dayId,
      targetPosition: position,
    });
    setDraggingStripId(null);
  };

  const handleDropUnscheduled = () => {
    if (!draggingStripId) return;
    moveMutation.mutate({
      stripId: draggingStripId,
      targetDayId: null,
      targetPosition: 0,
    });
    setDraggingStripId(null);
  };

  const handleStripClick = (sceneId: string) => {
    if (!schedule) return;
    const allStrips = [
      ...schedule.shootingDays.flatMap((d) => d.strips),
      ...schedule.unscheduledStrips,
    ];
    const strip = allStrips.find((s) => s.sceneId === sceneId) ?? null;
    setSelectedStrip(strip);
  };

  const handleDayClick = (dayId: string) => {
    if (!schedule) return;
    const day = schedule.shootingDays.find((d) => d.id === dayId) ?? null;
    setSelectedDay(day);
  };

  return (
    <div className={styles.page} data-testid="schedule-page">
      <div className={styles.toolbar}>
        <h2 className={styles.toolbarTitle}>Piano di Lavorazione</h2>

        {schedule && (
          <div className={styles.viewToggle}>
            <button
              type="button"
              className={`${styles.viewBtn} ${viewMode === "days" ? styles.viewBtnActive : ""}`}
              onClick={() => setViewMode("days")}
            >
              Giornate
            </button>
            <button
              type="button"
              className={`${styles.viewBtn} ${viewMode === "weeks" ? styles.viewBtnActive : ""}`}
              onClick={() => setViewMode("weeks")}
            >
              Settimane
            </button>
          </div>
        )}

        <button
          type="button"
          className={styles.generateBtn}
          data-testid="generate-schedule-btn"
          disabled={generateMutation.isPending}
          onClick={() => generateMutation.mutate()}
        >
          {schedule ? "Rigenera" : "Genera pianificazione"}
        </button>
      </div>

      {!schedule ? (
        <div className={styles.empty}>
          <p className={styles.emptyHint}>
            Genera il piano di lavorazione per organizzare le scene in giorni di
            ripresa. Richiede uno screenplay con scene.
          </p>
        </div>
      ) : (
        <>
          <div className={styles.boardScroll}>
            <StripBoard
              schedule={schedule}
              draggingStripId={draggingStripId}
              viewMode={viewMode}
              onDragStart={setDraggingStripId}
              onDrop={handleDrop}
              onLockToggle={(stripId) => lockMutation.mutate(stripId)}
              onDateChange={(dayId, date) =>
                dateMutation.mutate({ dayId, date })
              }
              onRemoveDay={(dayId) => removeDayMutation.mutate(dayId)}
              onAddDay={() => addDayMutation.mutate()}
              onStripClick={handleStripClick}
              onDayClick={handleDayClick}
            />
          </div>
          <UnscheduledTray
            strips={schedule.unscheduledStrips}
            onDragStart={setDraggingStripId}
            onDrop={handleDropUnscheduled}
            onLockToggle={(stripId) => lockMutation.mutate(stripId)}
            onStripClick={handleStripClick}
          />
        </>
      )}

      <SceneDrawer
        strip={selectedStrip}
        screenplayVersionId={schedule?.screenplayVersionId ?? null}
        onClose={() => setSelectedStrip(null)}
      />

      <ShootingDayDrawer
        day={selectedDay}
        onClose={() => setSelectedDay(null)}
        onEffortChange={(stripId, estimatedHours) =>
          effortMutation.mutate({ stripId, estimatedHours })
        }
      />
    </div>
  );
}
