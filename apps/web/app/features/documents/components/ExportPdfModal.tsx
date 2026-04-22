import { useState } from "react";
import { Button, Dialog } from "@oh-writers/ui";
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

  return (
    <Dialog
      isOpen
      onClose={onClose}
      title="Esporta PDF"
      showCloseButton
      data-testid="narrative-export-modal"
      actions={
        <>
          <Button variant="ghost" onClick={onClose} disabled={isPending}>
            Annulla
          </Button>
          <Button
            variant="primary"
            data-testid="narrative-export-generate"
            disabled={isPending}
            onClick={() =>
              onGenerate({
                includeTitlePage: includeTitlePage && canIncludeTitlePage,
              })
            }
          >
            {isPending ? "Generazione…" : "Genera"}
          </Button>
        </>
      }
    >
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
    </Dialog>
  );
}
