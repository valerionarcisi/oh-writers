import { useEffect, useState } from "react";
import { match } from "ts-pattern";
import { useTranslation } from "~/features/i18n";
import {
  SaveStatusValues,
  computeSaveStatus,
  formatRelativeTime,
  type SaveStatusValue,
} from "../lib/save-status";
import styles from "./SaveIndicator.module.css";

type TranslateFn = ReturnType<typeof useTranslation>["t"];

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
  t: TranslateFn,
): string =>
  match(status)
    .with(SaveStatusValues.SAVING, () => t("screenplay.save.label.saving"))
    .with(SaveStatusValues.DIRTY, () => t("screenplay.save.label.dirty"))
    .with(SaveStatusValues.ERROR, () => t("screenplay.save.label.error"))
    .with(SaveStatusValues.OFFLINE, () => t("screenplay.save.label.offline"))
    .with(SaveStatusValues.SAVED, () =>
      lastSavedAt
        ? `${t("screenplay.save.label.savedRelativePrefix")}${formatRelativeTime(lastSavedAt)}`
        : t("screenplay.save.label.saved"),
    )
    .exhaustive();

const tooltipFor = (
  status: SaveStatusValue,
  lastSavedAt: number | null,
  t: TranslateFn,
): string =>
  match(status)
    .with(SaveStatusValues.SAVING, () => t("screenplay.save.tip.saving"))
    .with(SaveStatusValues.DIRTY, () => t("screenplay.save.tip.dirty"))
    .with(SaveStatusValues.ERROR, () => t("screenplay.save.tip.error"))
    .with(SaveStatusValues.OFFLINE, () => t("screenplay.save.tip.offline"))
    .with(SaveStatusValues.SAVED, () =>
      lastSavedAt
        ? `${t("screenplay.save.tip.savedRelativePrefix")}${formatRelativeTime(lastSavedAt)}${t("screenplay.save.tip.savedRelativeSuffix")}`
        : t("screenplay.save.tip.savedAll"),
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
  const { t } = useTranslation();
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
      title={tooltipFor(status, lastSavedAt, t)}
      onClick={() => {
        if (isClickable) onFlush();
      }}
      disabled={!isClickable}
      aria-label={tooltipFor(status, lastSavedAt, t)}
      data-status={status}
      data-testid="save-indicator"
    >
      <span className={styles.dot} aria-hidden="true" />
      <span className={styles.label}>{labelFor(status, lastSavedAt, t)}</span>
    </button>
  );
}
