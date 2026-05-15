import styles from "./ProjectCoverGradient.module.css";

type Size = "sm" | "md" | "lg";

interface Props {
  readonly gradient: string;
  readonly title: string;
  readonly size?: Size;
}

const truncateForCover = (title: string, max: number): string => {
  if (title.length <= max) return title;
  const words = title.split(" ").slice(0, 3).join(" ");
  return words.length <= max ? words : words.slice(0, max);
};

export function ProjectCoverGradient({ gradient, title, size = "md" }: Props) {
  const max = size === "lg" ? 24 : size === "md" ? 14 : 10;
  return (
    <div
      className={`${styles.cover} ${styles[size]}`}
      style={{ background: gradient }}
      aria-hidden="true"
    >
      <span className={styles.label}>{truncateForCover(title, max)}</span>
    </div>
  );
}
