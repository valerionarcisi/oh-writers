// packages/ui/src/shell/SkipLink/SkipLink.tsx
import styles from "./SkipLink.module.css";

export type SkipLinkProps = {
  /** ID of the main content area to skip to */
  targetId?: string;
  /** Visible link text. Defaults to the Italian copy for backward-compat. */
  label?: string;
};

export function SkipLink({
  targetId = "main-content",
  label = "Salta al contenuto",
}: SkipLinkProps) {
  return (
    <a href={`#${targetId}`} className={styles.link}>
      {label}
    </a>
  );
}
