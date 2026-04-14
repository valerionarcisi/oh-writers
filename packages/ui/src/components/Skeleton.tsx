import styles from "./Skeleton.module.css";

interface SkeletonProps {
  width?: string;
  height?: string;
  rounded?: boolean;
  className?: string;
}

export function Skeleton({
  width,
  height = "1em",
  rounded,
  className,
}: SkeletonProps) {
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
      aria-hidden="true"
    />
  );
}
