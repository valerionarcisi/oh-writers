import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useCesareOpen,
  useSetActiveScene,
  useSetActiveShootingDay,
  useContextActions,
  useTopBarSlotPublisher,
} from "~/features/app-shell";
import type { ContextActionHandlers } from "~/features/app-shell";
import {
  useLocationAnchors,
  pickPrimaryExteriorLocation,
} from "../hooks/useLocationAnchors";
import type { DayWeatherAnchor } from "../hooks/useDayEstimate";
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
  ActionsMenu,
  SegmentedControl,
} from "@oh-writers/ui";
import { unwrapResult } from "@oh-writers/utils";
import {
  formatDayHours,
  analyzeSchedule,
  ContextActionIds,
  type Suggestion,
} from "@oh-writers/domain";
import { useExportSchedule } from "../hooks/useExportSchedule";
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
import { ScheduleDayView } from "./ScheduleDayView";
import { useTranslation } from "~/features/i18n";
import type { TranslationKey } from "@oh-writers/domain";
import styles from "./SchedulePage.module.css";

type ViewTab = "strip" | "day" | "days" | "weeks";

const TAB_LABEL_KEYS: ReadonlyArray<{ id: ViewTab; labelKey: TranslationKey }> =
  [
    { id: "strip", labelKey: "schedule.page.tabStrip" },
    { id: "day", labelKey: "schedule.page.tabDay" },
    { id: "days", labelKey: "schedule.page.tabDays" },
    { id: "weeks", labelKey: "schedule.page.tabWeeks" },
  ];

interface SchedulePageProps {
  projectId: string;
}

export function SchedulePage({ projectId }: SchedulePageProps) {
  const { t } = useTranslation();
  const tabs = TAB_LABEL_KEYS.map(({ id, labelKey }) => ({
    id,
    label: t(labelKey),
  }));
  const qc = useQueryClient();
  // Cesare now lives in the shell-level BottomDock (Spec 44 TKT-LEAD-01).
  const _openCesare = useCesareOpen();
  void _openCesare;
  const setActiveScene = useSetActiveScene();
  const setActiveShootingDay = useSetActiveShootingDay();
  const { data } = useSuspenseQuery(scheduleQueryOptions(projectId));
  const schedule = data?.isOk ? data.value : null;
  const locationAnchors = useLocationAnchors(projectId);

  const getWeatherAnchor = useCallback(
    (day: {
      strips: ReadonlyArray<{ intExt: string; location: string }>;
    }): DayWeatherAnchor | null => {
      const extLocation = pickPrimaryExteriorLocation(day.strips);
      if (!extLocation) return null;
      return locationAnchors.findByName(extLocation);
    },
    [locationAnchors],
  );

  const { exportCsv, exportPdf, isCsvPending, isPdfPending } =
    useExportSchedule(projectId);

  // Spec 67 — the page's two exports (CSV + Print/PDF) live in the standard
  // TopBar `⋯` menu. No versions on production pages.
  const contextActionHandlers = useMemo<ContextActionHandlers>(
    () => ({
      [ContextActionIds.EXPORT_CSV]: {
        onSelect: () => void exportCsv(),
        disabled: isCsvPending,
      },
      [ContextActionIds.EXPORT_PDF]: {
        onSelect: () => void exportPdf(),
        disabled: isPdfPending,
      },
    }),
    [exportCsv, exportPdf, isCsvPending, isPdfPending],
  );
  const contextActionItems = useContextActions(
    "schedule",
    contextActionHandlers,
  );
  const scheduleActionsMenu = useMemo(
    () => (
      <ActionsMenu
        data-testid="schedule-actions-menu"
        items={contextActionItems}
      />
    ),
    [contextActionItems],
  );
  useTopBarSlotPublisher("actions", scheduleActionsMenu);

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

  useEffect(() => {
    return () => {
      setActiveScene(null);
      setActiveShootingDay(null);
    };
  }, [setActiveScene, setActiveShootingDay]);

  const invalidate = () =>
    qc.refetchQueries({ queryKey: ["schedule", projectId] });

  const generateMutation = useMutation({
    mutationFn: () =>
      generateSchedule({ data: { projectId } }).then(unwrapResult),
    onSuccess: invalidate,
  });

  const autoGenerated = useRef(false);
  const scheduleIsEmpty =
    !schedule ||
    (schedule.shootingDays.length === 0 &&
      schedule.unscheduledStrips.length === 0);
  useEffect(() => {
    if (scheduleIsEmpty && !autoGenerated.current) {
      autoGenerated.current = true;
      generateMutation.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduleIsEmpty]);

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

  const timesMutation = useMutation({
    mutationFn: (vars: {
      dayId: string;
      crewCallTime?: string | null;
      shootStartTime?: string | null;
      wrapTime?: string | null;
    }) =>
      updateShootingDay({
        data: {
          dayId: vars.dayId,
          patch: {
            crewCallTime: vars.crewCallTime,
            shootStartTime: vars.shootStartTime,
            wrapTime: vars.wrapTime,
          },
        },
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
    if (strip) {
      setActiveScene({
        sceneId: strip.sceneId,
        sceneNumber: strip.sceneNumber,
      });
    } else {
      setActiveScene(null);
    }
  };

  const handleDayClick = (dayId: string) => {
    if (!schedule) return;
    const day = schedule.shootingDays.find((d) => d.id === dayId) ?? null;
    setSelectedDay(day);
    if (day) {
      setActiveShootingDay({ dayId: day.id, dayNumber: day.dayNumber });
    } else {
      setActiveShootingDay(null);
    }
  };

  const handleSelectDayInView = (dayId: string) => {
    setActiveDayId(dayId);
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

  return (
    <div className={styles.page} data-testid="schedule-page-v2">
      <Viewbar
        isScrolled={isStuck}
        className={`${styles.viewbar} ${isStuck ? styles.isStuck : ""}`}
      >
        <SegmentedControl<ViewTab>
          options={tabs}
          activeId={tab}
          onSelect={setTab}
          ariaLabel={t("schedule.page.viewAria")}
        />
        <span className={styles.viewbarRight} />
      </Viewbar>

      <main className={styles.main} id="main">
        <header className={styles.eyebrowRow}>
          <span className={styles.eyebrow}>
            {t("schedule.page.eyebrowPrefix")} <strong>{dayCount}</strong>{" "}
            {dayCount === 1
              ? t("schedule.page.dayOne")
              : t("schedule.page.dayOther")}{" "}
            ·{" "}
            {t("schedule.page.eyebrowScenes").replace(
              "{scenes}",
              String(sceneCount),
            )}
          </span>
          <span className={styles.eyebrowMeta}>
            {totalPages > 0 && (
              <>
                {totalPages} {t("schedule.pagesShortBare")} ·{" "}
              </>
            )}
            {totalHours > 0 && (
              <>
                {formatDayHours(totalHours)} {t("schedule.page.total")}
              </>
            )}
          </span>
        </header>

        {scheduleIsEmpty ? (
          <div className={styles.empty}>
            <p className={styles.emptyHint}>{t("schedule.page.emptyHint")}</p>
            <button
              type="button"
              className={styles.generateBtn}
              data-testid="generate-schedule-btn"
              disabled={generateMutation.isPending}
              onClick={() => generateMutation.mutate()}
            >
              {t("schedule.page.generatePlan")}
            </button>
          </div>
        ) : (
          <>
            {match(tab)
              .with("strip", "days", "weeks", (t) => (
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
                        viewMode={t === "weeks" ? "weeks" : "days"}
                        unscheduledStrips={schedule.unscheduledStrips}
                        getWeatherAnchor={getWeatherAnchor}
                        onMoveStrip={(stripId, targetDayId) =>
                          moveMutation.mutate({
                            stripId,
                            targetDayId,
                            targetPosition: 0,
                          })
                        }
                        onDragStart={setDraggingStripId}
                        onDrop={handleDrop}
                        onLockToggle={(stripId) => lockMutation.mutate(stripId)}
                        onDateChange={(dayId, date) =>
                          dateMutation.mutate({ dayId, date })
                        }
                        onRemoveDay={(dayId) => removeDayMutation.mutate(dayId)}
                        onAddDay={() => addDayMutation.mutate()}
                        onAddWeek={() => addDayMutation.mutate()}
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
              .with("day", () => (
                <ScheduleDayView
                  schedule={schedule}
                  dayId={activeDayId}
                  onSelectDay={handleSelectDayInView}
                  onNotesChange={(dayId, notes) =>
                    notesMutation.mutate({ dayId, notes })
                  }
                  onTimesChange={(dayId, patch) =>
                    timesMutation.mutate({ dayId, ...patch })
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

      {/* Spec 44 TKT-LEAD-01: page-scoped CTAs only, bottom-left. The
       * shell-level BottomDock owns bottom-right + the universal ✦ Cesare. */}
      {/* Export (CSV + Print) moved to the TopBar `⋯` menu (Spec 67) — the dock
          keeps only the page's primary CTA (regenerate). */}
      <FloatingDock
        label={t("schedule.page.dockLabel")}
        primaryAction={{
          label: schedule
            ? t("schedule.page.regenerate")
            : t("schedule.page.generate"),
          hotkey: "⌘⇧P",
          onClick: () => generateMutation.mutate(),
        }}
      />
    </div>
  );
}
