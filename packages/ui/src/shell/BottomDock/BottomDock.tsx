// packages/ui/src/shell/BottomDock/BottomDock.tsx
//
// Spec 47b FIX 1: the dock is now a single Cesare launcher pill. Bell / avatar /
// gear moved to the LeftRail footer (their single home) so they are never
// duplicated across surfaces.
import { useRef } from "react";
import { useButton } from "react-aria";
import styles from "./BottomDock.module.css";

export type BottomDockProps = {
  /** Toggle the Cesare sub-window. */
  onCesareToggle: () => void;
  /** When true (default), the Cesare label is shown next to the spark.
   *  Set to false to render an icon-only pill on tight screens. */
  showCesareLabel?: boolean;
};

function CesareButton({
  onPress,
  showLabel,
}: {
  onPress: () => void;
  showLabel: boolean;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const { buttonProps } = useButton(
    {
      onPress,
      "aria-label": "Apri Cesare",
    },
    ref,
  );
  return (
    <button
      ref={ref}
      {...buttonProps}
      className={styles.cesare}
      title="Apri Cesare"
      data-cesare-trigger=""
      data-testid="cesare-open-btn"
    >
      <span className={styles.cesareIcon} aria-hidden="true" />
      {showLabel && <span className={styles.cesareLabel}>Cesare</span>}
    </button>
  );
}

export function BottomDock({
  onCesareToggle,
  showCesareLabel = true,
}: BottomDockProps) {
  return (
    <div
      className={styles.dock}
      role="toolbar"
      aria-label="Azioni globali"
      data-testid="bottom-dock"
    >
      <CesareButton onPress={onCesareToggle} showLabel={showCesareLabel} />
    </div>
  );
}
