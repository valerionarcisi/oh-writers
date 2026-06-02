import { useRef } from "react";
import { useToggleButton } from "react-aria";
import { useToggleState } from "react-stately";
import type { CSSProperties } from "react";
import styles from "./ToggleChip.module.css";

export type ToggleChipProps = {
  isOn: boolean;
  onToggle: () => void;
  label: string;
  categoryColor?: string;
  hotkey?: string;
  "aria-label"?: string;
};

export function ToggleChip({
  isOn,
  onToggle,
  label,
  categoryColor,
  "aria-label": ariaLabel,
}: ToggleChipProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const state = useToggleState({
    isSelected: isOn,
    onChange: () => onToggle(),
  });
  const { buttonProps } = useToggleButton(
    { "aria-label": ariaLabel },
    state,
    ref,
  );

  // useToggleButton emits aria-pressed (toggle-button semantics). This control is
  // a switch, so drop aria-pressed and expose role="switch" + aria-checked instead.
  const { "aria-pressed": _ariaPressed, ...switchProps } = buttonProps;

  return (
    <button
      {...switchProps}
      ref={ref}
      role="switch"
      aria-checked={isOn}
      className={[styles.chip, isOn ? styles.isOn : ""]
        .filter(Boolean)
        .join(" ")}
      style={
        categoryColor
          ? ({ "--chip-color": categoryColor } as CSSProperties)
          : undefined
      }
    >
      {categoryColor && <span className={styles.dot} aria-hidden="true" />}
      {label}
    </button>
  );
}
