// packages/ui/src/composites/SplitDrawer/SplitDrawer.tsx
/**
 * SplitDrawer — right-anchored auxiliary panel (Spec 44).
 *
 * Notion `»` chevron pattern. Used for `VersionsDrawer`, the
 * `NotificationCenterDrawer` cronologia, the trace flow from Cesare's
 * full-page chat, and any future "open this thing alongside the page"
 * surface. It is COMPLETELY SEPARATE from the Cesare drawer: do not
 * conflate the two. Cesare is a floating bottom-right sub-window; this
 * primitive is a right-anchored full-height column.
 *
 * Chrome only: the consumer passes `header`, optional `footer`, and the
 * body as `children`. The drawer manages:
 *   - The three states (`closed | open | full`) plus the corresponding
 *     CSS animation handoff via `data-state`.
 *   - Drag-resize of the left edge when `open` (min 360, max 60vw).
 *   - localStorage persistence of the user's preferred width.
 *
 * Public API mirrors {@link CesareDrawer}: the consumer owns state and
 * passes both `state` and `onStateChange` plus the dispatcher methods.
 * In practice consumers wire via {@link useSplitDrawerState}.
 */

import { useCallback, useMemo, useRef, type ReactNode } from "react";
import { useButton } from "react-aria";
import styles from "./SplitDrawer.module.css";
import type { SplitDrawerState } from "./use-split-drawer-state";
import {
  useSplitDrawerResize,
  readPersistedSplitSize,
  SPLIT_DRAWER_STORAGE_KEYS,
} from "./use-split-drawer-resize";

// ─── Public types ───────────────────────────────────────────────────────────

export interface SplitDrawerSize {
  width: number;
}

export interface SplitDrawerProps {
  /** Current state (controlled). */
  state: SplitDrawerState;
  /** State change callback — exposes the new state to the controller. */
  onStateChange: (next: SplitDrawerState) => void;
  /** Dispatcher methods. The consumer typically forwards from useSplitDrawerState. */
  onCycle?: () => void;
  onStepBack?: () => void;
  onClose: () => void;

  /** Header content: title, breadcrumb, etc. The drawer adds the window controls. */
  header: ReactNode;
  /** Optional footer (accept/reject actions when used for trace, etc.). */
  footer?: ReactNode;
  /** Body content. */
  children: ReactNode;

  /**
   * Controlled width (in CSS px) for the `open` state. When omitted the
   * drawer falls back to localStorage + a 480px default. Ignored in `full`.
   */
  size?: SplitDrawerSize;
  /** Notified on every drag tick. */
  onSizeChange?: (next: SplitDrawerSize) => void;

  /** Class hook for caller-side styling (test selectors). */
  className?: string;

  /** Accessible label for the drawer landmark. */
  ariaLabel?: string;

  /** Hook used by E2E tests. */
  testId?: string;
}

// ─── Internal building blocks ───────────────────────────────────────────────

function HeaderButton({
  onPress,
  label,
  icon,
  isDanger,
}: {
  onPress: () => void;
  label: string;
  icon: ReactNode;
  isDanger?: boolean;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const { buttonProps } = useButton({ onPress, "aria-label": label }, ref);
  return (
    <button
      ref={ref}
      {...buttonProps}
      type="button"
      className={[styles.iconBtn, isDanger ? styles.iconBtnDanger : ""]
        .filter(Boolean)
        .join(" ")}
      title={label}
    >
      {icon}
    </button>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────

export function SplitDrawer({
  state,
  onStateChange: _onStateChange,
  onCycle,
  onStepBack,
  onClose,
  header,
  footer,
  children,
  size,
  onSizeChange,
  className,
  ariaLabel = "Split drawer",
  testId,
}: SplitDrawerProps) {
  const isOpen = state === "open";

  // Width is either fully controlled (caller passes `size`/`onSizeChange`)
  // or self-managed via localStorage + the resize hook.
  const initialWidth = useMemo(
    () => size?.width ?? readPersistedSplitSize(SPLIT_DRAWER_STORAGE_KEYS.width, 480),
    [size?.width],
  );

  const persistWidth = useCallback(
    (px: number) => {
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(
            SPLIT_DRAWER_STORAGE_KEYS.width,
            String(px),
          );
        } catch {
          // localStorage may be unavailable (private mode); silently ignore.
        }
      }
      onSizeChange?.({ width: px });
    },
    [onSizeChange],
  );

  const resize = useSplitDrawerResize({
    initialSize: initialWidth,
    min: 360,
    max: "60vw",
    onSizeChange: persistWidth,
    isDisabled: !isOpen,
  });

  // When `size` is provided externally, prefer it; otherwise use the hook.
  const effectiveWidth = size?.width ?? resize.size;

  const rootStyle = useMemo<React.CSSProperties>(() => {
    const style: Record<string, string> = {};
    if (isOpen) {
      style["--split-inline-size"] = `${effectiveWidth}px`;
    }
    return style as React.CSSProperties;
  }, [isOpen, effectiveWidth]);

  // ─── Render ─────────────────────────────────────────────────────────────
  return (
    <aside
      className={[
        styles.root,
        resize.isResizing ? styles.isResizing : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-state={state}
      data-testid={testId ?? "split-drawer"}
      style={rootStyle}
      aria-label={ariaLabel}
      role="complementary"
    >
      {/* Drag handle — only painted in `open` (CSS handles the display logic). */}
      <div className={styles.handleLeft} {...resize.handleProps} />

      <div className={styles.frame}>
        <header className={styles.header}>
          <div className={styles.headerSlot}>{header}</div>
          <div className={styles.headerControls}>
            {onCycle && (
              <HeaderButton
                onPress={onCycle}
                label="Espandi"
                icon={<span aria-hidden="true">↗</span>}
              />
            )}
            {state === "full" && onStepBack && (
              <HeaderButton
                onPress={onStepBack}
                label="Riduci"
                icon={<span aria-hidden="true">↙</span>}
              />
            )}
            <HeaderButton
              onPress={onClose}
              label="Chiudi"
              icon={<span aria-hidden="true">×</span>}
              isDanger
            />
          </div>
        </header>

        <div className={styles.body} data-testid="split-drawer-body">
          {children}
        </div>

        {footer && <footer className={styles.footer}>{footer}</footer>}
      </div>
    </aside>
  );
}
