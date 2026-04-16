export const SaveStatusValues = {
  SAVED: "saved",
  DIRTY: "dirty",
  SAVING: "saving",
  ERROR: "error",
  OFFLINE: "offline",
} as const;

export type SaveStatusValue =
  (typeof SaveStatusValues)[keyof typeof SaveStatusValues];

export interface SaveStatusInput {
  isDirty: boolean;
  isSaving: boolean;
  isError: boolean;
  isOffline: boolean;
}

/**
 * Derive the save indicator state from the primitive flags coming out of
 * the autosave hook. Offline wins over everything else because while offline
 * we neither save nor surface errors — the Yjs layer buffers updates locally.
 */
export const computeSaveStatus = ({
  isDirty,
  isSaving,
  isError,
  isOffline,
}: SaveStatusInput): SaveStatusValue => {
  if (isOffline) return SaveStatusValues.OFFLINE;
  if (isError) return SaveStatusValues.ERROR;
  if (isSaving) return SaveStatusValues.SAVING;
  if (isDirty) return SaveStatusValues.DIRTY;
  return SaveStatusValues.SAVED;
};

const MINUTE = 60_000;
const HOUR = MINUTE * 60;

/** Human-readable "N minutes ago" relative time, IT locale. */
export const formatRelativeTime = (
  from: number,
  now: number = Date.now(),
): string => {
  const diff = Math.max(0, now - from);
  if (diff < 30_000) return "adesso";
  if (diff < MINUTE) return "pochi secondi fa";
  if (diff < HOUR) {
    const mins = Math.round(diff / MINUTE);
    return `${mins} ${mins === 1 ? "minuto" : "minuti"} fa`;
  }
  const hours = Math.round(diff / HOUR);
  return `${hours} ${hours === 1 ? "ora" : "ore"} fa`;
};
