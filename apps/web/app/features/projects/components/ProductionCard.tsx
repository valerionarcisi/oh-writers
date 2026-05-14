import styles from "./ProductionCard.module.css";

interface ProductionCardProps {
  eyebrow: string;
  title: string;
  subtitle: string;
  onClick: () => void;
}

export function ProductionCard({
  eyebrow,
  title,
  subtitle,
  onClick,
}: ProductionCardProps) {
  return (
    <button type="button" className={styles.card} onClick={onClick}>
      <span className={styles.eyebrow}>{eyebrow}</span>
      <span className={styles.title}>{title}</span>
      <span className={styles.subtitle}>{subtitle}</span>
    </button>
  );
}
