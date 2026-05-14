// packages/ui/src/icons/Icon.tsx
import type { IconName } from "./icon-names";
import styles from "./Icon.module.css";

export type IconProps = {
  name: IconName;
  size?: number | string;
  className?: string;
  "aria-label"?: string;
  "aria-hidden"?: boolean;
};

export function Icon({
  name,
  size = 16,
  className,
  "aria-label": ariaLabel,
  "aria-hidden": ariaHidden,
}: IconProps) {
  const isDecorative = ariaLabel === undefined;
  return (
    <svg
      className={[styles.icon, className].filter(Boolean).join(" ")}
      width={size}
      height={size}
      role={isDecorative ? "presentation" : "img"}
      aria-hidden={isDecorative ? true : ariaHidden}
      aria-label={ariaLabel}
    >
      <use href={`#i-${name}`} />
    </svg>
  );
}
