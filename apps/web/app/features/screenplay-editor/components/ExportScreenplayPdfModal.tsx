import { useEffect, useState } from "react";
import styles from "./ExportScreenplayPdfModal.module.css";

interface ExportScreenplayPdfModalProps {
  isPending: boolean;
  onClose: () => void;
  onGenerate: (opts: { includeCoverPage: boolean }) => void;
}

export function ExportScreenplayPdfModal({
  isPending,
  onClose,
  onGenerate,
}: ExportScreenplayPdfModalProps) {
  const [includeCoverPage, setIncludeCoverPage] = useState(false);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div
      className={styles.overlay}
      onClick={onClose}
      data-testid="screenplay-export-modal-overlay"
    >
      <div
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="screenplay-export-modal-title"
        data-testid="screenplay-export-modal"
      >
        <div className={styles.header}>
          <h2 id="screenplay-export-modal-title" className={styles.title}>
            Esporta sceneggiatura
          </h2>
          <button
            type="button"
            className={styles.closeBtn}
            aria-label="Chiudi"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className={styles.body}>
          <label className={styles.checkboxRow}>
            <input
              type="checkbox"
              data-testid="screenplay-export-include-cover-page"
              checked={includeCoverPage}
              onChange={(e) => setIncludeCoverPage(e.target.checked)}
            />
            <span>Includi cover page</span>
          </label>
        </div>
        <div className={styles.footer}>
          <button
            type="button"
            className={styles.btn}
            onClick={onClose}
            disabled={isPending}
          >
            Annulla
          </button>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPrimary}`}
            data-testid="screenplay-export-generate"
            disabled={isPending}
            onClick={() => onGenerate({ includeCoverPage })}
          >
            {isPending ? "Generazione…" : "Genera"}
          </button>
        </div>
      </div>
    </div>
  );
}
