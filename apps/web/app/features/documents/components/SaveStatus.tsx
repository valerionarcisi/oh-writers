import { useTranslation } from "~/features/i18n";
import styles from "./SaveStatus.module.css";

interface SaveStatusProps {
  isDirty: boolean;
  isSaving: boolean;
  isError: boolean;
}

export function SaveStatus({ isDirty, isSaving, isError }: SaveStatusProps) {
  const { t } = useTranslation();
  if (isError)
    return (
      <span className={`${styles.status} ${styles.error}`}>
        {t("documents.saveStatus.error")}
      </span>
    );
  if (isSaving)
    return (
      <span className={`${styles.status} ${styles.saving}`}>
        {t("documents.saveStatus.saving")}
      </span>
    );
  if (isDirty)
    return (
      <span className={`${styles.status} ${styles.dirty}`}>
        {t("documents.saveStatus.dirty")}
      </span>
    );
  return (
    <span className={`${styles.status} ${styles.saved}`}>
      {t("documents.saveStatus.saved")}
    </span>
  );
}
