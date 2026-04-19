import { useEffect, useState } from "react";
import styles from "./ExportPdfModal.module.css";

interface ExportPdfModalProps {
  /**
   * True only when the project has a title page filled in (i.e. an author
   * is set). When false the cover-page checkbox is rendered disabled with
   * an inline hint explaining why (Spec 04c, OHW-230).
   */
  canIncludeTitlePage: boolean;
  isPending: boolean;
  onClose: () => void;
  onGenerate: (opts: { includeTitlePage: boolean }) => void;
}

export function ExportPdfModal({
  canIncludeTitlePage,
  isPending,
  onClose,
  onGenerate,
}: ExportPdfModalProps) {
  const [includeTitlePage, setIncludeTitlePage] = useState(false);

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
      data-testid="narrative-export-modal-overlay"
    >
      <div
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="narrative-export-modal-title"
        data-testid="narrative-export-modal"
      >
        <div className={styles.header}>
          <h2 id="narrative-export-modal-title" className={styles.title}>
            Esporta PDF
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
              data-testid="narrative-export-include-title-page"
              checked={includeTitlePage && canIncludeTitlePage}
              disabled={!canIncludeTitlePage}
              onChange={(e) => setIncludeTitlePage(e.target.checked)}
            />
            <span>Includi title page</span>
          </label>
          {!canIncludeTitlePage && (
            <p className={styles.hint}>
              Compila la title page del progetto per abilitare questa opzione.
            </p>
          )}
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
            data-testid="narrative-export-generate"
            disabled={isPending}
            onClick={() =>
              onGenerate({
                includeTitlePage: includeTitlePage && canIncludeTitlePage,
              })
            }
          >
            {isPending ? "Generazione…" : "Genera"}
          </button>
        </div>
      </div>
    </div>
  );
}
