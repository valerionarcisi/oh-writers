import { useState } from "react";
import { DsButton, Modal } from "@oh-writers/ui";
import { openPdfPreview, downloadTextFile } from "~/features/documents";
import { useExportBudget } from "../hooks/useExportBudget";
import styles from "./ExportBudgetModal.module.css";

interface Props {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly projectId: string;
}

export function ExportBudgetModal({ isOpen, onClose, projectId }: Props) {
  const [format, setFormat] = useState<"pdf" | "csv">("pdf");
  const exportMut = useExportBudget();

  const handleGenerate = () => {
    exportMut.mutate(
      { projectId, format },
      {
        onSuccess: (res) => {
          if (res.format === "pdf") {
            const bytes = Uint8Array.from(atob(res.data.pdfBase64), (c) =>
              c.charCodeAt(0),
            );
            const blob = new Blob([bytes], { type: "application/pdf" });
            openPdfPreview(URL.createObjectURL(blob), res.data.filename);
          } else {
            downloadTextFile(
              res.data.csv,
              res.data.filename,
              "text/csv;charset=utf-8",
            );
          }
          onClose();
        },
      },
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Esporta budget"
      footer={
        <>
          <DsButton variant="ghost" onClick={onClose}>
            Annulla
          </DsButton>
          <DsButton
            variant="primary"
            data-testid="budget-export-generate"
            onClick={handleGenerate}
            disabled={exportMut.isPending}
          >
            {exportMut.isPending ? "Generazione…" : "Genera"}
          </DsButton>
        </>
      }
    >
      <div className={styles.body}>
        <label className={styles.field}>
          <span className={styles.label}>Formato</span>
          <select
            className={styles.input}
            data-testid="budget-export-format"
            value={format}
            onChange={(e) => setFormat(e.target.value as "pdf" | "csv")}
          >
            <option value="pdf">PDF</option>
            <option value="csv">CSV</option>
          </select>
        </label>
      </div>
    </Modal>
  );
}
