import { useRef } from "react";
import { Lock, LockOpen } from "lucide-react";
import type { StripView } from "../server/schedule.server";
import styles from "./StripCard.module.css";

interface StripCardProps {
  strip: StripView;
  onDragStart: (stripId: string) => void;
  onLockToggle: (stripId: string) => void;
  onStripClick: (sceneId: string) => void;
}

const formatHours = (h: number): string => {
  if (h <= 0) return "—";
  const whole = Math.floor(h);
  const minutes = Math.round((h - whole) * 60);
  if (minutes === 0) return `${whole}h`;
  return `${whole}h ${minutes}m`;
};

export function StripCard({
  strip,
  onDragStart,
  onLockToggle,
  onStripClick,
}: StripCardProps) {
  const dragged = useRef(false);
  const hours = strip.resolvedHours;
  const slugMeta = [strip.timeOfDay, strip.intExt]
    .filter((v): v is string => Boolean(v))
    .join(" · ");

  return (
    <div
      className={`${styles.strip} ${strip.isLocked ? styles.locked : ""}`}
      draggable={!strip.isLocked}
      data-testid={`strip-${strip.id}`}
      data-scene={strip.sceneNumber}
      data-color={strip.bannerColor}
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
      <span className={styles.colorBand} aria-hidden="true" />

      <span className={styles.sceneNumber}>SC. {strip.sceneNumber}</span>

      <span className={styles.title}>
        <span className={styles.heading}>{strip.location}</span>
        {slugMeta && <small className={styles.slug}>{slugMeta}</small>}
      </span>

      <span className={styles.pages}>
        {strip.pageCount} <small>p</small>
      </span>

      <span className={styles.hours}>{formatHours(hours)}</span>

      <button
        type="button"
        className={styles.lockBtn}
        data-testid={`strip-lock-${strip.id}`}
        title={strip.isLocked ? "Sblocca" : "Blocca"}
        aria-label={strip.isLocked ? "Sblocca scena" : "Blocca scena"}
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
