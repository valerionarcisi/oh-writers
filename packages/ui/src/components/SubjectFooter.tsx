import { Banner } from "./Banner";
import styles from "./SubjectFooter.module.css";

export interface SubjectLength {
  readonly cartelle: number;
  readonly pages: number;
  readonly words: number;
  readonly chars: number;
  readonly isOverSoftLimit: boolean;
}

export interface SubjectFooterLabels {
  readonly cartelle: string;
  readonly pageOf: (n: number, total: number) => string;
  readonly words: string;
  readonly softWarning: string;
  readonly dismissWarning: string;
}

const defaultLabels: SubjectFooterLabels = {
  cartelle: "cartelle",
  pageOf: (n, total) => `page ${n} of ${total}`,
  words: "words",
  softWarning: "You are entering treatment territory.",
  dismissWarning: "Dismiss warning",
};

export interface SubjectFooterProps {
  readonly length: SubjectLength;
  readonly labels?: Partial<SubjectFooterLabels>;
  readonly isWarningDismissed: boolean;
  readonly onDismissWarning: () => void;
  readonly testId?: string;
}

export function SubjectFooter({
  length,
  labels,
  isWarningDismissed,
  onDismissWarning,
  testId,
}: SubjectFooterProps) {
  const l = { ...defaultLabels, ...labels };
  const showWarning = length.isOverSoftLimit && !isWarningDismissed;
  const totalPages = Math.max(1, Math.ceil(length.pages));
  const currentPage = Math.min(
    totalPages,
    Math.max(1, Math.ceil(length.pages)),
  );

  return (
    <div className={styles.root} data-testid={testId}>
      <div
        className={styles.counters}
        data-over-limit={length.isOverSoftLimit || undefined}
      >
        <span>
          {length.cartelle} {l.cartelle}
        </span>
        <span className={styles.sep} aria-hidden="true">
          ·
        </span>
        <span>{l.pageOf(currentPage, totalPages)}</span>
        <span className={styles.sep} aria-hidden="true">
          ·
        </span>
        <span>
          {length.words} {l.words}
        </span>
      </div>
      {showWarning && (
        <Banner
          variant="warning"
          message={l.softWarning}
          onDismiss={onDismissWarning}
        />
      )}
    </div>
  );
}
