import styles from "./VersionTrigger.module.css";
import { Icon } from "../../icons/Icon";

export type VersionTriggerVariant = "pill" | "ghost";

export type VersionTriggerProps = {
  variant?: VersionTriggerVariant;
  label?: string;
  versionLabel?: string;
  onClick: () => void;
};

export function VersionTrigger({
  variant = "ghost",
  label = "Versioni",
  versionLabel,
  onClick,
}: VersionTriggerProps) {
  const displayLabel =
    variant === "pill" && versionLabel ? versionLabel : label;
  return (
    <button
      type="button"
      className={styles.trigger}
      data-variant={variant}
      onClick={onClick}
      aria-haspopup="dialog"
    >
      <span className={styles.label}>{displayLabel}</span>
      {variant === "pill" ? (
        <Icon name="chevron-down" className={styles.chevron} />
      ) : null}
    </button>
  );
}
