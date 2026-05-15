import { useEffect, useMemo, useRef, useState } from "react";
import { useDragAutoScroll } from "../hooks/useDragAutoScroll";
import {
  useSuspenseQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { match } from "ts-pattern";
import {
  Viewbar,
  FloatingDock,
  VersionTrigger,
  SegmentedControl,
} from "@oh-writers/ui";
import { unwrapResult } from "@oh-writers/utils";
import {
  formatDayHours,
  analyzeSchedule,
  type Suggestion,
} from "@oh-writers/domain";
import { useVersionsDrawer } from "~/features/versions";
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
import { ScheduleCesareBanner } from "./ScheduleCesareBanner";
import { ScheduleCalendarView } from "./ScheduleCalendarView";
import { ScheduleTimelineView } from "./ScheduleTimelineView";
import { ScheduleDayView } from "./ScheduleDayView";
import styles from "./SchedulePage.module.css";

type ViewTab = "strip" | "calendar" | "timeline" | "day";

const TABS: ReadonlyArray<{ id: ViewTab; label: string }> = [
  { id: "strip", label: "Strip Board" },
  { id: "calendar", label: "Calendario" },
  { id: "timeline", label: "Timeline" },
  { id: "day", label: "Giornata" },
];

interface SchedulePageProps {
  projectId: string;
}

export function SchedulePage({ projectId }: SchedulePageProps) {
  const qc = useQueryClient();
  const { data } = useSuspenseQuery(scheduleQueryOptions(projectId));
  const schedule = data?.isOk ? data.value : null;
  const versionsDrawer = useVersionsDrawer();

  const [tab, setTab] = useState<ViewTab>("strip");
  const [isStuck, setIsStuck] = useState(false);
  const [draggingStripId, setDraggingStripId] = useState<string | null>(null);
  const [selectedStrip, setSelectedStrip] = useState<StripView | null>(null);
  const [selectedDay, setSelectedDay] = useState<ShootingDayView | null>(null);
  const boardScrollRef = useRef<HTMLDivElement | null>(null);
  useDragAutoScroll(boardScrollRef, draggingStripId !== null);
  const [activeDayId, setActiveDayId] = useState<string | null>(null);

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

  const notesMutation = useMutation({
    mutationFn: (vars: { dayId: string; notes: string | null }) =>
      updateShootingDay({
        data: { dayId: vars.dayId, patch: { notes: vars.notes } },
      }).then(unwrapResult),
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

  const handleSelectDayInView = (dayId: string) => {
    setActiveDayId(dayId);
  };

  const handleSelectDayFromOtherTab = (dayId: string) => {
    setActiveDayId(dayId);
    setTab("day");
  };

  const suggestions = useMemo<Suggestion[]>(
    () =>
      schedule
        ? analyzeSchedule({
            shootingDays: schedule.shootingDays.map((d) => ({
              id: d.id,
              dayNumber: d.dayNumber,
              strips: d.strips.map((s) => ({
                id: s.id,
                sceneNumber: s.sceneNumber,
                location: s.location,
                resolvedHours: s.resolvedHours,
                timeOfDay: s.timeOfDay,
                sceneHeading: s.sceneHeading,
              })),
            })),
          })
        : [],
    [schedule],
  );

  const handleApplySuggestion = (s: Suggestion) => {
    if (s.payload.stripId && s.payload.targetDayId) {
      moveMutation.mutate({
        stripId: s.payload.stripId,
        targetDayId: s.payload.targetDayId,
        targetPosition: 0,
      });
      return;
    }
    // TODO Spec 12c: magic-hour suggestions need a day-level start-time
    // field (shooting_days.shootStartTime) before they can be applied.
    console.warn("[cesare] suggestion not yet applicable", s);
  };

  const handleOpenVersions = () => {
    if (!schedule?.screenplayId) return;
    // TODO Spec 12d: dedicated schedule version scope. For now we surface the
    // screenplay history because the schedule is bound to a screenplay snapshot.
    versionsDrawer.open({
      kind: "screenplay",
      screenplayId: schedule.screenplayId,
    });
  };

  const sceneCount = schedule
    ? schedule.shootingDays.reduce((s, d) => s + d.strips.length, 0) +
      schedule.unscheduledStrips.length
    : 0;
  const dayCount = schedule?.shootingDays.length ?? 0;
  const totalHours = schedule
    ? schedule.shootingDays.reduce(
        (sum, d) =>
          sum + d.strips.reduce((s, st) => s + (st.resolvedHours ?? 0), 0),
        0,
      )
    : 0;
  const totalPages = schedule
    ? schedule.shootingDays.reduce(
        (sum, d) => sum + d.strips.reduce((s, st) => s + st.pageCount, 0),
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
        <SegmentedControl<ViewTab>
          options={TABS}
          activeId={tab}
          onSelect={setTab}
          ariaLabel="Vista piano di lavorazione"
        />
        <span className={styles.viewbarRight} />
        <VersionTrigger
          variant="pill"
          versionLabel={versionLabel}
          onClick={handleOpenVersions}
        />
      </Viewbar>

      <main className={styles.main} id="main">
        <header className={styles.eyebrowRow}>
          <span className={styles.eyebrow}>
            PIANO DI RIPRESA · <strong>{dayCount}</strong>{" "}
            {dayCount === 1 ? "GIORNATA" : "GIORNATE"} · {sceneCount} SCENE
          </span>
          <span className={styles.eyebrowMeta}>
            {totalPages > 0 && <>{totalPages} pag · </>}
            {totalHours > 0 && <>{formatDayHours(totalHours)} totali</>}
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
          <>
            {match(tab)
              .with("strip", () => (
                <>
                  <ScheduleCesareBanner
                    suggestions={suggestions}
                    onApply={handleApplySuggestion}
                  />
                  <div className={styles.boardCard}>
                    <div className={styles.boardScroll} ref={boardScrollRef}>
                      <StripBoard
                        schedule={schedule}
                        draggingStripId={draggingStripId}
                        viewMode="days"
                        unscheduledStrips={schedule.unscheduledStrips}
                        onMoveStrip={(stripId, targetDayId) =>
                          moveMutation.mutate({
                            stripId,
                            targetDayId,
                            targetPosition: 0,
                          })
                        }
                        onDragStart={setDraggingStripId}
                        onDrop={handleDrop}
                        onLockToggle={(stripId) =>
                          lockMutation.mutate(stripId)
                        }
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
                </>
              ))
              .with("calendar", () => (
                <ScheduleCalendarView
                  schedule={schedule}
                  onSelectDay={handleSelectDayFromOtherTab}
                />
              ))
              .with("timeline", () => (
                <ScheduleTimelineView
                  schedule={schedule}
                  onSelectDay={handleSelectDayFromOtherTab}
                />
              ))
              .with("day", () => (
                <ScheduleDayView
                  schedule={schedule}
                  dayId={activeDayId}
                  onSelectDay={handleSelectDayInView}
                  onNotesChange={(dayId, notes) =>
                    notesMutation.mutate({ dayId, notes })
                  }
                  notesSaving={notesMutation.isPending}
                />
              ))
              .exhaustive()}
          </>
        )}
      </main>

      {selectedStrip && (
        <SceneDrawer
          strip={selectedStrip}
          screenplayVersionId={schedule?.screenplayVersionId ?? null}
          onClose={() => setSelectedStrip(null)}
        />
      )}

      {selectedDay && (
        <ShootingDayDrawer
          day={selectedDay}
          onClose={() => setSelectedDay(null)}
          onEffortChange={(stripId, estimatedHours) =>
            effortMutation.mutate({ stripId, estimatedHours })
          }
        />
      )}

      <FloatingDock
        label="PIANO DI RIPRESA"
        primaryAction={{
          label: schedule ? "Rigenera" : "Genera",
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
