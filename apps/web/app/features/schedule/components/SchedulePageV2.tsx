import { useEffect, useState } from "react";
import {
  useSuspenseQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { Viewbar, ViewbarSep, FloatingDock } from "@oh-writers/ui";
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
import type { StripView, ShootingDayView } from "../server/schedule.server";
import { StripBoard } from "./StripBoard";
import { UnscheduledTray } from "./UnscheduledTray";
import { SceneDrawer } from "./SceneDrawer";
import { ShootingDayDrawer } from "./ShootingDayDrawer";
import styles from "./SchedulePageV2.module.css";

type ViewTab = "day" | "byScene" | "all";

interface SchedulePageV2Props {
  projectId: string;
}

export function SchedulePageV2({ projectId }: SchedulePageV2Props) {
  const qc = useQueryClient();
  const { data } = useSuspenseQuery(scheduleQueryOptions(projectId));
  const schedule = data?.isOk ? data.value : null;

  const [tab, setTab] = useState<ViewTab>("day");
  const [isStuck, setIsStuck] = useState(false);
  const [draggingStripId, setDraggingStripId] = useState<string | null>(null);
  const [selectedStrip, setSelectedStrip] = useState<StripView | null>(null);
  const [selectedDay, setSelectedDay] = useState<ShootingDayView | null>(null);

  useEffect(() => {
    const onScroll = () => setIsStuck(window.scrollY > 48);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

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

  const sceneCount = schedule
    ? schedule.shootingDays.reduce((s, d) => s + d.strips.length, 0) +
      schedule.unscheduledStrips.length
    : 0;
  const dayCount = schedule?.shootingDays.length ?? 0;
  const totalHours = schedule
    ? schedule.shootingDays.reduce(
        (sum, d) =>
          sum +
          d.strips.reduce((s, st) => s + (st.estimatedHours ?? 0), 0),
        0,
      )
    : 0;

  const versionLabel = "v3 · 14 mag 2026";

  return (
    <div className={styles.page} data-testid="schedule-page-v2">
      <Viewbar
        isScrolled={isStuck}
        className={`${styles.viewbar} ${isStuck ? styles.isStuck : ""}`}
      >
        <button
          type="button"
          className={`${styles.filter} ${tab === "day" ? styles.isActive : ""}`}
          onClick={() => setTab("day")}
          aria-pressed={tab === "day"}
        >
          Per giornata
        </button>
        <button
          type="button"
          className={`${styles.filter} ${tab === "byScene" ? styles.isActive : ""}`}
          onClick={() => setTab("byScene")}
          aria-pressed={tab === "byScene"}
        >
          Per scena
        </button>
        <button
          type="button"
          className={`${styles.filter} ${tab === "all" ? styles.isActive : ""}`}
          onClick={() => setTab("all")}
          aria-pressed={tab === "all"}
        >
          Tutti i giorni
        </button>
        <ViewbarSep />
        <span className={styles.viewbarRight} />
        {dayCount > 0 && (
          <button
            type="button"
            className={styles.filter}
            aria-haspopup="menu"
            aria-label="Filtra per giornata"
          >
            Tutte le giornate ▾
          </button>
        )}
        <button type="button" className={styles.filter} aria-haspopup="menu">
          {versionLabel} ▾
        </button>
      </Viewbar>

      <main className={styles.main} id="main">
        <header className={styles.eyebrowRow}>
          <span className={styles.eyebrow}>
            PIANO DI RIPRESA · {dayCount} {dayCount === 1 ? "GIORNATA" : "GIORNATE"}
          </span>
          <span className={styles.eyebrowMeta}>
            {sceneCount} {sceneCount === 1 ? "scena" : "scene"}
            {totalHours > 0 && (
              <>
                {" · "}
                {formatHours(totalHours)} totali
              </>
            )}
          </span>
        </header>

        {!schedule ? (
          <div className={styles.empty}>
            <p className={styles.emptyHint}>
              Genera il piano di lavorazione per organizzare le scene in
              giornate di ripresa. Richiede uno screenplay con scene.
            </p>
            <button
              type="button"
              className={styles.generateBtn}
              data-testid="generate-schedule-btn"
              disabled={generateMutation.isPending}
              onClick={() => generateMutation.mutate()}
            >
              Genera pianificazione
            </button>
          </div>
        ) : (
          <div className={styles.boardCard}>
            <div className={styles.boardScroll}>
              <StripBoard
                schedule={schedule}
                draggingStripId={draggingStripId}
                viewMode="days"
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
          </div>
        )}
      </main>

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

      <FloatingDock
        label="PIANO DI RIPRESA"
        primaryAction={{
          label: schedule ? "Rigenera da breakdown" : "Pre-fill da breakdown",
          hotkey: "⌘⇧P",
          onClick: () => generateMutation.mutate(),
        }}
        secondaryActions={[
          { label: "Esporta", hotkey: "⌘E", onClick: () => undefined },
          { label: "Stampa", hotkey: "⌘P", onClick: () => undefined },
        ]}
        cesareNoteCount={0}
      />
    </div>
  );
}

function formatHours(hours: number): string {
  if (hours <= 0) return "0h";
  const whole = Math.floor(hours);
  const minutes = Math.round((hours - whole) * 60);
  if (minutes === 0) return `${whole}h`;
  return `${whole}h ${minutes}m`;
}
