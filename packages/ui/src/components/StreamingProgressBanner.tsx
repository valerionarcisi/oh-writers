import { Banner, type BannerVariant } from "./Banner.js";
import { Progress } from "./Progress.js";
import styles from "./StreamingProgressBanner.module.css";

export interface StreamingProgressBannerProps {
  /** Items processed so far. */
  done: number;
  /** Total items expected. When null, the bar is indeterminate. */
  total: number | null;
  /** Heading text rendered above the progress bar. */
  message: string;
  /** ARIA label used by the inner progress bar. */
  progressLabel: string;
  variant?: BannerVariant;
  onCancel?: () => void;
  cancelLabel?: string;
  className?: string;
  "data-testid"?: string;
}

export function StreamingProgressBanner({
  done,
  total,
  message,
  progressLabel,
  variant = "cesare",
  onCancel,
  cancelLabel = "Annulla",
  className,
  ...rest
}: StreamingProgressBannerProps) {
  const isIndeterminate = total === null;
  const counter = isIndeterminate ? `${done}` : `${done}/${total}`;

  const body = (
    <div className={styles.wrapper}>
      <div>
        {message} — <strong>{counter}</strong>
      </div>
      <Progress
        className={styles.progress}
        label={progressLabel}
        value={isIndeterminate ? undefined : done}
        max={isIndeterminate ? undefined : (total ?? undefined)}
      />
    </div>
  );

  return (
    <Banner
      variant={variant}
      message={body}
      actions={
        onCancel
          ? [{ label: cancelLabel, onClick: onCancel, variant: "secondary" }]
          : undefined
      }
      className={className}
      data-testid={rest["data-testid"]}
    />
  );
}
