import styles from "./VersionViewingBanner.module.css";

interface RestoreConfirmHandlers {
  onSaveAndRestore: () => void;
  onRestoreOnly: () => void;
  onCancel: () => void;
}

interface VersionViewingBannerProps {
  label: string;
  createdAt: string;
  onReturn: () => void;
  onRestore: () => void;
  isRestoring?: boolean;
  restoreConfirm?: RestoreConfirmHandlers;
}

export function VersionViewingBanner({
  label,
  createdAt,
  onReturn,
  onRestore,
  isRestoring = false,
  restoreConfirm,
}: VersionViewingBannerProps) {
  return (
    <div
      className={styles.banner}
      role="status"
      aria-live="polite"
      data-testid="version-viewing-banner"
    >
      <div className={styles.message}>
        {restoreConfirm ? (
          "Hai modifiche non salvate."
        ) : (
          <>
            Stai visualizzando <span className={styles.label}>{label}</span>
            <span className={styles.date}>
              · salvata il {new Date(createdAt).toLocaleString()}
            </span>
          </>
        )}
      </div>
      <div className={styles.actions}>
        {restoreConfirm ? (
          <>
            <button
              type="button"
              className={`${styles.button} ${styles.ghost}`}
              onClick={restoreConfirm.onCancel}
              data-testid="version-restore-cancel"
            >
              Annulla
            </button>
            <button
              type="button"
              className={`${styles.button} ${styles.danger}`}
              onClick={restoreConfirm.onRestoreOnly}
              data-testid="version-restore-only"
            >
              Ripristina senza salvare
            </button>
            <button
              type="button"
              className={`${styles.button} ${styles.primary}`}
              onClick={restoreConfirm.onSaveAndRestore}
              data-testid="version-save-and-restore"
            >
              Salva versione e ripristina
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className={`${styles.button} ${styles.ghost}`}
              onClick={onReturn}
              data-testid="version-viewing-return"
            >
              Torna alla bozza
            </button>
            <button
              type="button"
              className={`${styles.button} ${styles.primary}`}
              onClick={onRestore}
              disabled={isRestoring}
              data-testid="version-viewing-restore"
            >
              {isRestoring ? "Ripristino…" : "Ripristina questa versione"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
