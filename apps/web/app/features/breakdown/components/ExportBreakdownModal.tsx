import { useState } from "react";
import { DsButton, Modal } from "@oh-writers/ui";
import { useTranslation } from "~/features/i18n";
import { useExportBreakdown } from "../hooks/useBreakdown";
import { openPdfPreview } from "~/features/documents";
import { downloadCsv } from "../lib/download-csv";
import styles from "./ExportBreakdownModal.module.css";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  versionId: string;
}

export function ExportBreakdownModal({
  isOpen,
  onClose,
  projectId,
  versionId,
}: Props) {
  const { t } = useTranslation();
  const [format, setFormat] = useState<"pdf" | "csv">("pdf");
  const exportMut = useExportBreakdown();

  const handleGenerate = () => {
    exportMut.mutate(
      { projectId, screenplayVersionId: versionId, format },
      {
        onSuccess: (res) => {
          if (res.format === "pdf") {
            const bytes = Uint8Array.from(atob(res.data.pdfBase64), (c) =>
              c.charCodeAt(0),
            );
            const blob = new Blob([bytes], { type: "application/pdf" });
            openPdfPreview(URL.createObjectURL(blob), res.data.filename);
          } else {
            downloadCsv(res.data.csv, res.data.filename);
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
      title={t("breakdown.exportModal.title")}
      footer={
        <>
          <DsButton variant="ghost" onClick={onClose}>
            {t("breakdown.exportModal.cancel")}
          </DsButton>
          <DsButton
            variant="primary"
            data-testid="breakdown-export-generate"
            onClick={handleGenerate}
            disabled={exportMut.isPending}
          >
            {exportMut.isPending
              ? t("breakdown.exportModal.generating")
              : t("breakdown.exportModal.generate")}
          </DsButton>
        </>
      }
    >
      <div className={styles.body}>
        <label className={styles.field}>
          <span className={styles.label}>
            {t("breakdown.exportModal.format")}
          </span>
          <select
            className={styles.input}
            data-testid="breakdown-export-format"
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
