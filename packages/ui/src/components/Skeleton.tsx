import styles from "./Skeleton.module.css";

type SkeletonTone = "default" | "agent";

interface SkeletonProps {
  /** Single rectangle width. Ignored when `lines` is set. */
  width?: string;
  /** Single rectangle height. Default "1em". Ignored when `lines` is set. */
  height?: string;
  /** Pill border-radius. */
  rounded?: boolean;
  /** Extra className for composition. */
  className?: string;
  /** Render N stacked lines with shimmer. When set, width/height are ignored. */
  lines?: number;
  /** Per-line widths (cycled if shorter than lines). */
  widths?: string[];
  /** Gap between lines. Default `var(--ds-space-2)`. */
  gap?: string;
  /** ARIA label for the loading region. Default "Caricamento". */
  ariaLabel?: string;
  /** Brand the shimmer with the agent color. */
  tone?: SkeletonTone;
}

const DEFAULT_WIDTHS = ["100%", "92%", "70%"] as const;

export function Skeleton({
  width,
  height = "1em",
  rounded,
  className,
  lines,
  widths,
  gap,
  ariaLabel = "Caricamento",
  tone = "default",
}: SkeletonProps) {
  if (typeof lines === "number" && lines > 0) {
    const widthList =
      widths && widths.length > 0 ? widths : [...DEFAULT_WIDTHS];
    const containerStyle = gap ? { gap } : undefined;

    return (
      <div
        className={[
          styles.shimmerGroup,
          tone === "agent" ? styles.toneAgent : "",
          className ?? "",
        ]
          .filter(Boolean)
          .join(" ")}
        style={containerStyle}
        role="status"
        aria-busy="true"
        aria-label={ariaLabel}
      >
        {Array.from({ length: lines }).map((_, i) => (
          <span
            key={i}
            className={styles.shimmerLine}
            style={{ width: widthList[i % widthList.length] }}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className={[
        styles.skeleton,
        rounded ? styles.rounded : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ width, height }}
      role="status"
      aria-busy="true"
      aria-label={ariaLabel}
    />
  );
}

interface SkeletonCardProps {
  className?: string;
  ariaLabel?: string;
}

export function SkeletonCard({
  className,
  ariaLabel = "Caricamento",
}: SkeletonCardProps) {
  return (
    <div
      className={[styles.card, className ?? ""].filter(Boolean).join(" ")}
      role="status"
      aria-busy="true"
      aria-label={ariaLabel}
    >
      <span
        className={styles.shimmerLine}
        style={{ width: "60%", blockSize: "14px" }}
      />
      <span
        className={styles.shimmerLine}
        style={{ width: "100%", blockSize: "10px" }}
      />
      <span
        className={styles.shimmerLine}
        style={{ width: "40%", blockSize: "10px" }}
      />
    </div>
  );
}
