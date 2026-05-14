// packages/ui/src/shell/SkipLink/SkipLink.tsx
import styles from "./SkipLink.module.css";

export type SkipLinkProps = {
  /** ID of the main content area to skip to */
  targetId?: string;
};

export function SkipLink({ targetId = "main-content" }: SkipLinkProps) {
  return (
    <a href={`#${targetId}`} className={styles.link}>
      Salta al contenuto
    </a>
  );
}
