import { Link } from "@tanstack/react-router";
import { SaveStatus } from "~/features/documents";
import { ImportPdfButton } from "./ImportPdfButton";
import styles from "./ScreenplayToolbar.module.css";

interface ScreenplayToolbarProps {
  projectId: string;
  currentPage: number;
  totalPages: number;
  isDirty: boolean;
  isSaving: boolean;
  isError: boolean;
  isFocusMode: boolean;
  hasContent: boolean;
  onToggleFocusMode: () => void;
  onImport: (fountain: string) => void;
}

export function ScreenplayToolbar({
  projectId,
  currentPage,
  totalPages,
  isDirty,
  isSaving,
  isError,
  isFocusMode,
  hasContent,
  onToggleFocusMode,
  onImport,
}: ScreenplayToolbarProps) {
  return (
    <div className={styles.toolbar}>
      <div className={styles.left}>
        <Link
          to="/projects/$id"
          params={{ id: projectId }}
          className={styles.backLink}
        >
          ← Back
        </Link>
        <span className={styles.title}>Screenplay</span>
      </div>

      <div className={styles.center}>
        <span className={styles.pageCount} data-testid="page-indicator">
          Page {currentPage} of {totalPages} (~{totalPages} min)
        </span>
      </div>

      <div className={styles.right}>
        <SaveStatus isDirty={isDirty} isSaving={isSaving} isError={isError} />
        <Link
          to="/projects/$id/screenplay/versions"
          params={{ id: projectId }}
          className={styles.versionsBtn}
        >
          Versions
        </Link>
        <button
          className={`${styles.focusBtn} ${isFocusMode ? styles.focusBtnActive : ""}`}
          onClick={onToggleFocusMode}
          type="button"
          title="Toggle focus mode (Ctrl+Shift+F)"
          aria-pressed={isFocusMode}
        >
          Focus
        </button>
        <ImportPdfButton hasExistingContent={hasContent} onImport={onImport} />
        <button
          className={styles.exportBtn}
          type="button"
          disabled
          title="Coming in Spec 08"
        >
          Export PDF
        </button>
      </div>
    </div>
  );
}
