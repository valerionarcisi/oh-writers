import { useRef } from "react";
import { Lock, LockOpen } from "lucide-react";
import { pageCountColor } from "@oh-writers/domain";
import type { StripView } from "../server/schedule.server";
import styles from "./StripCard.module.css";

interface StripCardProps {
  strip: StripView;
  onDragStart: (stripId: string) => void;
  onLockToggle: (stripId: string) => void;
  onStripClick: (sceneId: string) => void;
}

export function StripCard({
  strip,
  onDragStart,
  onLockToggle,
  onStripClick,
}: StripCardProps) {
  const dragged = useRef(false);
  const pageColor = pageCountColor(strip.pageCount);

  return (
    <div
      className={`${styles.strip} ${strip.isLocked ? styles.locked : ""}`}
      draggable={!strip.isLocked}
      data-testid={`strip-${strip.id}`}
      data-scene={strip.sceneNumber}
      onMouseDown={() => {
        dragged.current = false;
      }}
      onDragStart={(e) => {
        if (strip.isLocked) {
          e.preventDefault();
          return;
        }
        dragged.current = true;
        e.dataTransfer.setData("text/plain", strip.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart(strip.id);
      }}
      onClick={() => {
        if (!dragged.current) onStripClick(strip.sceneId);
        dragged.current = false;
      }}
    >
      <div className={styles.colorBand} data-color={strip.bannerColor} />

      <div className={styles.body}>
        <div className={styles.topRow}>
          <span className={styles.sceneNumber}>Sc. {strip.sceneNumber}</span>
          <span
            className={styles.pageCount}
            data-color={pageColor}
            title={`${strip.pageCount} pagine`}
          >
            {strip.pageCount}p
          </span>
        </div>

        <div className={styles.location}>{strip.location}</div>

        {strip.sceneHeading && (
          <div className={styles.heading}>{strip.sceneHeading}</div>
        )}

        <div className={styles.meta}>
          <span>{strip.intExt}</span>
          {strip.timeOfDay && <span>· {strip.timeOfDay}</span>}
        </div>
      </div>

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
        {strip.isLocked ? (
          <Lock size={12} strokeWidth={2} />
        ) : (
          <LockOpen size={12} strokeWidth={2} />
        )}
      </button>
    </div>
  );
}
