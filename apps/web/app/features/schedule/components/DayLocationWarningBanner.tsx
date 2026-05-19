import { useState, useRef } from "react";
import { useButton } from "react-aria";
import { useQuery } from "@tanstack/react-query";
import { dayLocationWarningsQueryOptions } from "../server/schedule.server";
import styles from "./DayLocationWarningBanner.module.css";

interface DayLocationWarningBannerProps {
  readonly dayId: string;
  readonly dayNumber: number;
}

const STATUS_LABEL: Record<string, string> = {
  pending: "pending",
  scouting: "scouting",
};

const dismissKey = (dayId: string): string => `ohw:loc-warn:${dayId}`;

function DismissButton({ onPress }: { onPress: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const { buttonProps } = useButton(
    {
      onPress,
      "aria-label": "Nascondi avviso location",
    },
    ref,
  );
  return (
    <button {...buttonProps} ref={ref} type="button" className={styles.dismiss}>
      ✕
    </button>
  );
}

export function DayLocationWarningBanner({
  dayId,
  dayNumber,
}: DayLocationWarningBannerProps) {
  const { data } = useQuery(dayLocationWarningsQueryOptions(dayId));
  const warnings = data && data.isOk ? data.value : [];

  const initialDismissed = (() => {
    if (typeof window === "undefined") return false;
    return window.sessionStorage.getItem(dismissKey(dayId)) === "1";
  })();
  const [dismissed, setDismissed] = useState(initialDismissed);

  if (dismissed || warnings.length === 0) return null;

  const handleDismiss = () => {
    setDismissed(true);
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(dismissKey(dayId), "1");
    }
  };

  return (
    <div
      className={styles.banner}
      role="status"
      data-testid={`day-location-warning-${dayId}`}
      aria-label={`Avviso location per il giorno ${dayNumber}`}
    >
      <span className={styles.icon} aria-hidden="true">
        ⚠
      </span>
      <div className={styles.body}>
        <p className={styles.headline}>
          Questa giornata ha {warnings.length}{" "}
          {warnings.length === 1
            ? "scena con location non ancora confermata"
            : "scene con location non ancora confermate"}
          :
        </p>
        <ul className={styles.list}>
          {warnings.map((w) => (
            <li key={`${w.sceneId}-${w.requirementName}`}>
              Sc.{w.sceneNumber} ({w.requirementName} ·{" "}
              {STATUS_LABEL[w.status] ?? w.status})
            </li>
          ))}
        </ul>
      </div>
      <DismissButton onPress={handleDismiss} />
    </div>
  );
}
