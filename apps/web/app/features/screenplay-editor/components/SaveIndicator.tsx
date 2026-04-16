import { useEffect, useState } from "react";
import { match } from "ts-pattern";
import {
  SaveStatusValues,
  computeSaveStatus,
  formatRelativeTime,
  type SaveStatusValue,
} from "../lib/save-status";
import styles from "./SaveIndicator.module.css";

interface SaveIndicatorProps {
  isDirty: boolean;
  isSaving: boolean;
  isError: boolean;
  isOffline: boolean;
  lastSavedAt: number | null;
  onFlush: () => void;
}

const labelFor = (
  status: SaveStatusValue,
  lastSavedAt: number | null,
): string =>
  match(status)
    .with(SaveStatusValues.SAVING, () => "Salvataggio…")
    .with(SaveStatusValues.DIRTY, () => "Non salvato")
    .with(SaveStatusValues.ERROR, () => "Errore")
    .with(SaveStatusValues.OFFLINE, () => "Offline")
    .with(SaveStatusValues.SAVED, () =>
      lastSavedAt ? `Salvato · ${formatRelativeTime(lastSavedAt)}` : "Salvato",
    )
    .exhaustive();

const tooltipFor = (
  status: SaveStatusValue,
  lastSavedAt: number | null,
): string =>
  match(status)
    .with(SaveStatusValues.SAVING, () => "Salvataggio in corso…")
    .with(
      SaveStatusValues.DIRTY,
      () => "Modifiche non salvate — clicca per salvare ora",
    )
    .with(
      SaveStatusValues.ERROR,
      () => "Salvataggio fallito — clicca per riprovare",
    )
    .with(SaveStatusValues.OFFLINE, () => "Offline — le modifiche sono in coda")
    .with(SaveStatusValues.SAVED, () =>
      lastSavedAt
        ? `Salvato ${formatRelativeTime(lastSavedAt)} — clicca per salvare ora`
        : "Tutte le modifiche salvate — clicca per salvare ora",
    )
    .exhaustive();

const stateClass: Record<SaveStatusValue, string> = {
  saved: styles.saved ?? "",
  dirty: styles.dirty ?? "",
  saving: styles.saving ?? "",
  error: styles.error ?? "",
  offline: styles.offline ?? "",
};

/**
 * Visible save state with a clickable "save now" affordance.
 *
 * - Green when saved, amber when dirty/saving, red on error, grey while offline
 * - Click or Cmd/Ctrl+S forces an immediate save when dirty or on error
 * - Warns via beforeunload when leaving with unsaved changes
 */
export function SaveIndicator({
  isDirty,
  isSaving,
  isError,
  isOffline,
  lastSavedAt,
  onFlush,
}: SaveIndicatorProps) {
  const status = computeSaveStatus({ isDirty, isSaving, isError, isOffline });
  const isClickable = status !== SaveStatusValues.OFFLINE;
  const needsGuard =
    status === SaveStatusValues.DIRTY || status === SaveStatusValues.ERROR;

  // Refresh the relative-time label every 30s while idle, so "adesso"
  // progresses to "1 minuto fa" without requiring a re-render from above.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (status !== SaveStatusValues.SAVED || !lastSavedAt) return;
    const handle = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(handle);
  }, [status, lastSavedAt]);

  // Cmd/Ctrl+S → force save (prevents the browser's native save dialog).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isSave = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s";
      if (!isSave) return;
      e.preventDefault();
      if (isClickable) onFlush();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isClickable, onFlush]);

  // beforeunload guard when there are pending or failed changes.
  useEffect(() => {
    if (!needsGuard) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [needsGuard]);

  return (
    <button
      type="button"
      className={`${styles.pill} ${stateClass[status]}`}
      title={tooltipFor(status, lastSavedAt)}
      onClick={() => {
        if (isClickable) onFlush();
      }}
      disabled={!isClickable}
      aria-label={tooltipFor(status, lastSavedAt)}
      data-status={status}
      data-testid="save-indicator"
    >
      <span className={styles.dot} aria-hidden="true" />
      <span className={styles.label}>{labelFor(status, lastSavedAt)}</span>
    </button>
  );
}
