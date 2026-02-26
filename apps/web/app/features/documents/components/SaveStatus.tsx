import styles from "./SaveStatus.module.css";

interface SaveStatusProps {
  isDirty: boolean;
  isSaving: boolean;
  isError: boolean;
}

export function SaveStatus({ isDirty, isSaving, isError }: SaveStatusProps) {
  if (isError)
    return (
      <span className={`${styles.status} ${styles.error}`}>Error saving</span>
    );
  if (isSaving)
    return <span className={`${styles.status} ${styles.saving}`}>Saving…</span>;
  if (isDirty)
    return (
      <span className={`${styles.status} ${styles.dirty}`}>
        Unsaved changes
      </span>
    );
  return <span className={`${styles.status} ${styles.saved}`}>Saved</span>;
}
