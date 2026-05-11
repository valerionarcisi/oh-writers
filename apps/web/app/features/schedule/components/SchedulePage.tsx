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
} from "../server/schedule.server";
import { StripBoard } from "./StripBoard";
import { UnscheduledTray } from "./UnscheduledTray";
import styles from "./SchedulePage.module.css";

interface SchedulePageProps {
  projectId: string;
}

export function SchedulePage({ projectId }: SchedulePageProps) {
  const qc = useQueryClient();
  const { data } = useSuspenseQuery(scheduleQueryOptions(projectId));
  const [draggingStripId, setDraggingStripId] = useState<string | null>(null);

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

  return (
    <div className={styles.page} data-testid="schedule-page">
      <div className={styles.toolbar}>
        <h2 className={styles.toolbarTitle}>Piano di Lavorazione</h2>
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
              onDragStart={setDraggingStripId}
              onDrop={handleDrop}
              onLockToggle={(stripId) => lockMutation.mutate(stripId)}
              onDateChange={(dayId, date) =>
                dateMutation.mutate({ dayId, date })
              }
              onRemoveDay={(dayId) => removeDayMutation.mutate(dayId)}
              onAddDay={() => addDayMutation.mutate()}
            />
          </div>
          <UnscheduledTray
            strips={schedule.unscheduledStrips}
            onDragStart={setDraggingStripId}
            onDrop={handleDropUnscheduled}
            onLockToggle={(stripId) => lockMutation.mutate(stripId)}
          />
        </>
      )}
    </div>
  );
}
