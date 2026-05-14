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
  return (
    <button
      type="button"
      role="switch"
      aria-checked={isOn}
      aria-label={ariaLabel}
      className={[styles.chip, isOn ? styles.isOn : ""].filter(Boolean).join(" ")}
      style={categoryColor ? ({ "--chip-color": categoryColor } as React.CSSProperties) : undefined}
      onClick={onToggle}
    >
      {categoryColor && <span className={styles.dot} aria-hidden="true" />}
      {label}
    </button>
  );
}
