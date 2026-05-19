import type { ReactNode } from "react";
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
  /** Optional page context label shown in mono uppercase ('BUDGET', 'SCREENPLAY').
   *  When omitted, the dock collapses to actions only — saves horizontal
   *  space on narrow viewports. Still used as the aria-label fallback. */
  label?: string;
  /** Primary action (clay filled button). Optional — omit for info-only docks. */
  primaryAction?: DockAction;
  /** Secondary ghost actions */
  secondaryActions?: DockAction[];
  /** Optional slot rendered between the secondary actions and the Cesare pill.
   *  Use it to embed an overflow menu (e.g. the screenplay editor's Import
   *  popover) without having to position a second floating element. */
  overflowSlot?: ReactNode;
  /** Number of pending Cesare notes — shown as badge */
  cesareNoteCount?: number;
  /** Whether the Cesare overlay is currently on. Drives the pill's pressed
   *  state and the leaf-dot color. Defaults to true. */
  cesareIsOn?: boolean;
  /** When true, the Cesare pill emits a soft pulsing glow — used to signal
   *  that a long-running agentic action is in progress. Replaces the
   *  floating top-right "Cesare sta lavorando…" pill. */
  cesareIsThinking?: boolean;
  /** Called when user clicks the Cesare pill. When omitted the pill is hidden. */
  onCesareClick?: () => void;
  /** Inline toast shown to the left of the actions. Auto-collapses when null. */
  toast?: string | null;
  /** Dock position. Defaults to bottom-right (standard FloatingDock).
   *  Use bottom-left for secondary info docks that must not overlap the primary. */
  position?: "bottom-right" | "bottom-left";
  /** Read-only info chips rendered after the label (for info-only docks). */
  infoChips?: { label: string; value: string }[];
};

export function FloatingDock({
  label,
  primaryAction,
  secondaryActions = [],
  overflowSlot,
  cesareNoteCount = 0,
  cesareIsOn = true,
  cesareIsThinking = false,
  onCesareClick,
  toast,
  position = "bottom-right",
  infoChips,
}: FloatingDockProps) {
  return (
    <div
      role="toolbar"
      aria-label={label ? `Azioni pagina ${label}` : "Azioni pagina"}
      className={styles.dock}
      data-position={position}
    >
      {toast && (
        <span
          role="status"
          aria-live="polite"
          className={styles.toast}
          data-testid="dock-toast"
        >
          {toast}
        </span>
      )}

      {label && (
        <span className={styles.label} aria-hidden="true">
          {label}
        </span>
      )}

      {infoChips?.map((chip, i) => (
        <span key={i} className={styles.infoChipGroup}>
          {i === 0 && label && (
            <span className={styles.sep} aria-hidden="true" />
          )}
          <span className={styles.infoChipValue}>{chip.value}</span>
        </span>
      ))}

      {primaryAction && (
        <>
          {(label || (infoChips && infoChips.length > 0)) && (
            <span className={styles.sep} aria-hidden="true" />
          )}
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
        </>
      )}

      {secondaryActions.map((action) => (
        <button
          key={action.label}
          type="button"
          className={[styles.actionBtn, styles.ghost].join(" ")}
          onClick={action.onClick}
          aria-label={action.ariaLabel ?? action.label}
          title={
            action.hotkey ? `${action.label} (${action.hotkey})` : action.label
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

      {overflowSlot && (
        <span className={styles.overflowSlot}>{overflowSlot}</span>
      )}

      {onCesareClick && (
        <>
          <span className={styles.sep} aria-hidden="true" />
          <button
            type="button"
            className={[
              styles.cesarePill,
              cesareIsOn ? styles.cesarePillOn : styles.cesarePillOff,
              cesareIsThinking ? styles.cesarePillThinking : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={onCesareClick}
            aria-pressed={cesareIsOn}
            aria-busy={cesareIsThinking || undefined}
            data-thinking={cesareIsThinking ? "true" : undefined}
            aria-label={
              cesareIsThinking
                ? "Cesare sta lavorando"
                : cesareNoteCount > 0
                  ? `Cesare — ${cesareNoteCount} ${cesareNoteCount === 1 ? "nota su questa pagina" : "note su questa pagina"}`
                  : "Cesare"
            }
            title={
              cesareIsThinking
                ? "Cesare sta lavorando…"
                : cesareNoteCount > 0
                  ? `${cesareNoteCount} ${cesareNoteCount === 1 ? "nota di Cesare su questa pagina" : "note di Cesare su questa pagina"}`
                  : cesareIsOn
                    ? "Disattiva overlay Cesare"
                    : "Attiva overlay Cesare"
            }
          >
            <span className={styles.cesareDot} aria-hidden="true" />
            Cesare
            {cesareNoteCount > 0 && !cesareIsThinking && (
              <span className={styles.cesareCount} aria-hidden="true">
                {cesareNoteCount}
              </span>
            )}
          </button>
        </>
      )}
    </div>
  );
}
