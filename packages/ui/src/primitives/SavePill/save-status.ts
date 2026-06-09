// Shared save-status state machine (Spec 63 F4). Promoted from the screenplay
// editor so the narrative editor, the screenplay editor and the TopBar pill all
// derive the SAME states from the SAME flags — one source of truth, no divergent
// indicators.

export const SaveStatusValues = {
  SAVED: "saved",
  DIRTY: "dirty",
  SAVING: "saving",
  ERROR: "error",
  OFFLINE: "offline",
} as const;

/** The five save states a document/editor can be in. */
export type SaveState =
  (typeof SaveStatusValues)[keyof typeof SaveStatusValues];

export interface SaveStatusInput {
  isDirty: boolean;
  isSaving: boolean;
  isError: boolean;
  isOffline: boolean;
}

/**
 * Derive the save state from the primitive flags coming out of an autosave hook.
 * Precedence is deliberate:
 *   offline > error > saving > dirty > saved
 * Offline wins over everything else because while offline we neither save nor
 * surface errors (the Yjs layer buffers updates locally). `dirty` (porcelain,
 * unsaved) is distinct from `saving` (a write is in flight) — collapsing them was
 * the Spec 63 P3 bug.
 */
export const computeSaveStatus = ({
  isDirty,
  isSaving,
  isError,
  isOffline,
}: SaveStatusInput): SaveState => {
  if (isOffline) return SaveStatusValues.OFFLINE;
  if (isError) return SaveStatusValues.ERROR;
  if (isSaving) return SaveStatusValues.SAVING;
  if (isDirty) return SaveStatusValues.DIRTY;
  return SaveStatusValues.SAVED;
};
