import styles from "./InlineGenerateButton.module.css";

export interface InlineGenerateButtonProps {
  readonly label: string;
  readonly onClick: () => void;
  readonly isLoading?: boolean;
  readonly disabled?: boolean;
  readonly testId?: string;
}

export const InlineGenerateButton = ({
  label,
  onClick,
  isLoading = false,
  disabled = false,
  testId,
}: InlineGenerateButtonProps) => (
  <button
    type="button"
    className={styles.button}
    onClick={onClick}
    disabled={disabled || isLoading}
    data-testid={testId}
    data-loading={isLoading || undefined}
  >
    <span className={styles.icon} aria-hidden="true">
      {isLoading ? "\u231B" : "\u2728"}
    </span>
    <span className={styles.label}>{label}</span>
  </button>
);
