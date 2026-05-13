import { useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { scheduleQueryOptions } from "~/features/schedule/server/schedule.server";
import { DayBalanceTimeline } from "./DayBalanceTimeline";
import styles from "./ShootingPlanPage.module.css";

interface ShootingPlanPageProps {
  projectId: string;
}

export function ShootingPlanPage({ projectId }: ShootingPlanPageProps) {
  const { data } = useSuspenseQuery(scheduleQueryOptions(projectId));
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);

  const schedule = data?.isOk ? data.value : null;
  const shootDays =
    schedule?.shootingDays.filter((d) => d.dayType === "shoot") ?? [];
  const selectedDay =
    shootDays.find((d) => d.id === selectedDayId) ?? shootDays[0] ?? null;

  if (!schedule) {
    return (
      <div className={styles.empty}>
        <p>Genera prima uno schedule per pianificare le riprese.</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Piano di Ripresa</h1>
      </header>
      <div className={styles.body}>
        <aside className={styles.daySidebar}>
          <div className={styles.sidebarLabel}>Giorni di ripresa</div>
          {shootDays.map((day) => (
            <button
              key={day.id}
              type="button"
              className={styles.dayItem}
              data-active={day.id === (selectedDay?.id ?? null) || undefined}
              onClick={() => {
                setSelectedDayId(day.id);
                setSelectedSceneId(null);
              }}
            >
              <span className={styles.dayName}>GG {day.dayNumber}</span>
              <span className={styles.dayMeta}>{day.strips.length} scene</span>
              <span className={styles.dayHours}>
                {day.totalHours.toFixed(1)}h / 8h
              </span>
            </button>
          ))}
        </aside>
        <main className={styles.main}>
          {selectedDay && (
            <DayBalanceTimeline
              day={selectedDay}
              projectId={projectId}
              selectedSceneId={selectedSceneId}
              onSelectScene={setSelectedSceneId}
            />
          )}
        </main>
      </div>
    </div>
  );
}
