// packages/ui/src/primitives/Scrim/Scrim.tsx
import styles from "./Scrim.module.css";

export type ScrimProps = {
  onClick?: () => void;
  className?: string;
};

export function Scrim({ onClick, className }: ScrimProps) {
  return (
    <div
      className={[styles.scrim, className].filter(Boolean).join(" ")}
      aria-hidden="true"
      onClick={onClick}
    />
  );
}
