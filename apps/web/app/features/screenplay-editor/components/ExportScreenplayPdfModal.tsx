import { useState } from "react";
import { Button, Dialog } from "@oh-writers/ui";
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

  return (
    <Dialog
      isOpen
      onClose={onClose}
      title="Esporta sceneggiatura"
      showCloseButton
      data-testid="screenplay-export-modal"
      actions={
        <>
          <Button variant="ghost" onClick={onClose} disabled={isPending}>
            Annulla
          </Button>
          <Button
            variant="primary"
            data-testid="screenplay-export-generate"
            disabled={isPending}
            onClick={() => onGenerate({ includeCoverPage })}
          >
            {isPending ? "Generazione…" : "Genera"}
          </Button>
        </>
      }
    >
      <label className={styles.checkboxRow}>
        <input
          type="checkbox"
          data-testid="screenplay-export-include-cover-page"
          checked={includeCoverPage}
          onChange={(e) => setIncludeCoverPage(e.target.checked)}
        />
        <span>Includi cover page</span>
      </label>
    </Dialog>
  );
}
