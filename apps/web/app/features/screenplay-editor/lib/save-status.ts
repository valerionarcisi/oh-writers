// The save-status state machine is the SHARED one (Spec 63 F4) so the editor's
// SaveIndicator and the TopBar pill derive identical states from identical
// flags. Re-exported here for the screenplay editor's existing imports.
export {
  computeSaveStatus,
  SaveStatusValues,
  type SaveState,
  type SaveState as SaveStatusValue,
  type SaveStatusInput,
} from "@oh-writers/ui";

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
