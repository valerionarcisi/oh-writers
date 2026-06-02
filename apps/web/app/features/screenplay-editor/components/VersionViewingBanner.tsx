import { useTranslation } from "~/features/i18n";
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
  const { t } = useTranslation();
  return (
    <div
      className={styles.banner}
      role="status"
      aria-live="polite"
      data-testid="version-viewing-banner"
    >
      <div className={styles.message}>
        {restoreConfirm ? (
          t("screenplay.viewing.unsavedChanges")
        ) : (
          <>
            {t("screenplay.viewing.youAreViewingPrefix")}
            <span className={styles.label}>{label}</span>
            <span className={styles.date}>
              {t("screenplay.viewing.savedOnPrefix")}
              {new Date(createdAt).toLocaleString()}
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
              {t("screenplay.viewing.cancel")}
            </button>
            <button
              type="button"
              className={`${styles.button} ${styles.danger}`}
              onClick={restoreConfirm.onRestoreOnly}
              data-testid="version-restore-only"
            >
              {t("screenplay.viewing.restoreWithoutSaving")}
            </button>
            <button
              type="button"
              className={`${styles.button} ${styles.primary}`}
              onClick={restoreConfirm.onSaveAndRestore}
              data-testid="version-save-and-restore"
            >
              {t("screenplay.viewing.saveVersionAndRestore")}
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
              {t("screenplay.viewing.backToDraft")}
            </button>
            <button
              type="button"
              className={`${styles.button} ${styles.primary}`}
              onClick={onRestore}
              disabled={isRestoring}
              data-testid="version-viewing-restore"
            >
              {isRestoring
                ? t("screenplay.viewing.restoring")
                : t("screenplay.viewing.restoreThisVersion")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
