import styles from "./ShootingPlanDock.module.css";

interface ShootingPlanDockProps {
  projectId: string;
  suggestedShotCount: number;
  onPrefill?: () => void;
  onExport?: () => void;
  onPrint?: () => void;
}

export function ShootingPlanDock({
  suggestedShotCount,
  onPrefill,
  onExport,
  onPrint,
}: ShootingPlanDockProps) {
  return (
    <div className={styles.dock} role="toolbar" aria-label="Azioni piano">
      <span className={styles.dockLabel}>Piano</span>

      <button
        type="button"
        className={styles.btnPrimary}
        onClick={onPrefill}
        title="Pre-popola le inquadrature dal breakdown (⇧⌘P)"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M3 12a9 9 0 1 1 3 6.7" />
          <path d="M3 19v-6h6" />
        </svg>
        Pre-fill da breakdown
        <kbd className={styles.kbd}>⇧⌘P</kbd>
      </button>

      <button
        type="button"
        className={styles.btnGhost}
        onClick={onExport}
        title="Esporta il piano confermato (⌘E)"
      >
        Esporta
        <kbd className={styles.kbd}>⌘E</kbd>
      </button>

      <button
        type="button"
        className={styles.btnGhost}
        onClick={onPrint}
        title="Stampa per la troupe (⌘P)"
      >
        Stampa
        <kbd className={styles.kbd}>⌘P</kbd>
      </button>

      <div className={styles.sep} aria-hidden="true" />

      <button
        type="button"
        className={styles.cesareBtn}
        title="Note di Cesare"
      >
        <span className={styles.cesareDot} aria-hidden="true" />
        Cesare
        {suggestedShotCount > 0 && (
          <span className={styles.cesareCount}>{suggestedShotCount}</span>
        )}
      </button>
    </div>
  );
}
