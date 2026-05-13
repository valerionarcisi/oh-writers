import styles from "./BlockingPlaceholder.module.css";

export function BlockingPlaceholder() {
  return (
    <div className={styles.root} aria-label="Blocking 2D — disponibile in versione futura">
      <span className={styles.icon} aria-hidden="true">🎬</span>
      <span className={styles.text}>
        Blocking 2D — disponibile in versione futura (planimetria + posizioni camera)
      </span>
    </div>
  );
}
