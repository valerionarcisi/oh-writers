import type { StripView } from "../server/schedule.server";
import styles from "./StripCard.module.css";

interface StripCardProps {
  strip: StripView;
  onDragStart: (stripId: string) => void;
  onLockToggle: (stripId: string) => void;
}

export function StripCard({
  strip,
  onDragStart,
  onLockToggle,
}: StripCardProps) {
  return (
    <div
      className={`${styles.strip} ${strip.isLocked ? styles.locked : ""}`}
      draggable={!strip.isLocked}
      data-testid={`strip-${strip.id}`}
      data-scene={strip.sceneNumber}
      onDragStart={(e) => {
        if (strip.isLocked) {
          e.preventDefault();
          return;
        }
        e.dataTransfer.setData("text/plain", strip.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart(strip.id);
      }}
    >
      <div className={styles.colorBand} data-color={strip.bannerColor} />
      <div className={styles.body}>
        <div className={styles.sceneNumber}>Sc. {strip.sceneNumber}</div>
        <div className={styles.location}>{strip.location}</div>
        <div className={styles.meta}>
          <span>{strip.intExt}</span>
          {strip.timeOfDay && <span>· {strip.timeOfDay}</span>}
          <span>· {strip.pageCount}p</span>
        </div>
      </div>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.lockBtn}
          data-testid={`strip-lock-${strip.id}`}
          title={strip.isLocked ? "Sblocca" : "Blocca"}
          onClick={(e) => {
            e.stopPropagation();
            onLockToggle(strip.id);
          }}
        >
          <i className={styles.lockIcon}>{strip.isLocked ? "🔒" : "🔓"}</i>
        </button>
      </div>
    </div>
  );
}
