// packages/ui/src/primitives/SavePill/SavePill.tsx
import styles from "./SavePill.module.css";
import type { SaveState } from "./save-status";

export type { SaveState } from "./save-status";

export type SavePillProps = {
  state: SaveState;
  secondsAgo?: number;
};

const labels: Record<SaveState, string> = {
  saved: "Salvato",
  dirty: "Non salvato",
  saving: "Salvando…",
  error: "Errore salvataggio",
  offline: "Offline",
};

function formatSecondsAgo(s: number): string {
  if (s < 10) return "adesso";
  if (s < 60) return `${s}s fa`;
  const m = Math.floor(s / 60);
  return `${m}m fa`;
}

export function SavePill({ state, secondsAgo }: SavePillProps) {
  const label =
    state === "saved" && secondsAgo != null
      ? `${labels.saved} ${formatSecondsAgo(secondsAgo)}`
      : labels[state];

  return (
    <span
      className={[styles.pill, styles[state]].join(" ")}
      aria-live="polite"
      aria-atomic="true"
    >
      <span className={styles.dot} aria-hidden="true" />
      {label}
    </span>
  );
}
