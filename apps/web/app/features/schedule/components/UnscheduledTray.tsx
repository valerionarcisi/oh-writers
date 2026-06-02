import { useState } from "react";
import type { StripView } from "../server/schedule.server";
import { StripCard } from "./StripCard";
import { useTranslation } from "~/features/i18n";
import styles from "./UnscheduledTray.module.css";

interface UnscheduledTrayProps {
  strips: StripView[];
  onDragStart: (stripId: string) => void;
  onDrop: () => void;
  onLockToggle: (stripId: string) => void;
  onStripClick?: (sceneId: string) => void;
}

export function UnscheduledTray({
  strips,
  onDragStart,
  onDrop,
  onLockToggle,
  onStripClick,
}: UnscheduledTrayProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(true);
  const [dragOver, setDragOver] = useState(false);

  if (strips.length === 0 && !open) return null;

  return (
    <div className={styles.tray} data-testid="unscheduled-tray">
      <div className={styles.trayHeader} onClick={() => setOpen((v) => !v)}>
        <h4 className={styles.trayTitle}>{t("schedule.unscheduled.title")}</h4>
        {strips.length > 0 && (
          <span className={styles.trayCount}>{strips.length}</span>
        )}
        <span className={`${styles.chevron} ${open ? styles.open : ""}`}>
          ▼
        </span>
      </div>

      {open && (
        <div
          className={`${styles.dropTarget} ${dragOver ? styles.dragOver : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            onDrop();
          }}
          data-testid="unscheduled-drop"
        >
          <div className={styles.strips}>
            {strips.map((strip) => (
              <StripCard
                key={strip.id}
                strip={strip}
                onDragStart={onDragStart}
                onLockToggle={onLockToggle}
                onStripClick={onStripClick ?? (() => {})}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
