import styles from "./FloatingDock.module.css";

export type DockAction = {
  label: string;
  hotkey?: string;
  onClick: () => void;
  variant?: "primary" | "ghost";
  /** For aria-label on icon-only buttons */
  ariaLabel?: string;
};

export type FloatingDockProps = {
  /** Page context label shown in mono uppercase: "BUDGET", "SCREENPLAY", "PIANO" */
  label: string;
  /** Primary action (clay filled button) */
  primaryAction: DockAction;
  /** Secondary ghost actions */
  secondaryActions?: DockAction[];
  /** Number of pending Cesare notes — shown as badge */
  cesareNoteCount?: number;
  /** Called when user clicks the Cesare pill */
  onCesareClick?: () => void;
};

export function FloatingDock({
  label,
  primaryAction,
  secondaryActions = [],
  cesareNoteCount = 0,
  onCesareClick,
}: FloatingDockProps) {
  return (
    <div
      role="toolbar"
      aria-label={`Azioni pagina ${label}`}
      className={styles.dock}
    >
      <span className={styles.label} aria-hidden="true">
        {label}
      </span>

      <button
        type="button"
        className={[styles.actionBtn, styles.primary].join(" ")}
        onClick={primaryAction.onClick}
        aria-label={primaryAction.ariaLabel ?? primaryAction.label}
        title={
          primaryAction.hotkey
            ? `${primaryAction.label} (${primaryAction.hotkey})`
            : primaryAction.label
        }
      >
        {primaryAction.label}
        {primaryAction.hotkey && (
          <span className={styles.hotkey} aria-hidden="true">
            {primaryAction.hotkey}
          </span>
        )}
      </button>

      {secondaryActions.map((action) => (
        <button
          key={action.label}
          type="button"
          className={[styles.actionBtn, styles.ghost].join(" ")}
          onClick={action.onClick}
          aria-label={action.ariaLabel ?? action.label}
          title={
            action.hotkey
              ? `${action.label} (${action.hotkey})`
              : action.label
          }
        >
          {action.label}
          {action.hotkey && (
            <span className={styles.hotkey} aria-hidden="true">
              {action.hotkey}
            </span>
          )}
        </button>
      ))}

      <span className={styles.sep} aria-hidden="true" />

      <button
        type="button"
        className={styles.cesarePill}
        onClick={onCesareClick}
        aria-label={
          cesareNoteCount > 0 ? `Cesare — ${cesareNoteCount} note` : "Cesare"
        }
      >
        <span className={styles.cesareDot} aria-hidden="true" />
        Cesare
        {cesareNoteCount > 0 && (
          <span className={styles.cesareCount} aria-hidden="true">
            {cesareNoteCount}
          </span>
        )}
      </button>
    </div>
  );
}
