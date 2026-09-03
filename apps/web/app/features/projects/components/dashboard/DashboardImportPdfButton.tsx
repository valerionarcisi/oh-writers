import { useRef, useState } from "react";
import { Button } from "@oh-writers/ui";
import { useImportPdf } from "~/features/screenplay-editor";
import type { TitlePageDocJSON } from "~/features/screenplay-editor";
import { useCreateProjectFromScreenplay } from "../../hooks/useCreateProjectFromScreenplay";
import { useTranslation } from "~/features/i18n";
import styles from "./DashboardImportPdfButton.module.css";

/**
 * Dashboard-level "Importa PDF" entry — same round-trip as
 * DashboardImportFountainButton (create project, write the screenplay, land
 * in the editor), but the text comes from the existing PDF-import pipeline
 * (`useImportPdf`, already used inside the editor) instead of a raw file
 * read. No new parsing logic: this only wires that hook to a fresh project.
 */
export function DashboardImportPdfButton() {
  const { t } = useTranslation();
  const { createAndImport } = useCreateProjectFromScreenplay();
  const [error, setError] = useState<string | null>(null);
  const [isImporting, setImporting] = useState(false);

  const createAndSave = async (
    fountain: string,
    titlePageDoc: TitlePageDocJSON | null,
  ) => {
    setImporting(true);
    setError(null);

    const ok = await createAndImport(
      t("dashboard.import.defaultTitle"),
      fountain,
      titlePageDoc,
    );

    setImporting(false);
    if (!ok) setError(t("dashboard.importPdf.failed"));
  };

  // Import lands on a fresh, still-untitled project — unlike importing into
  // an existing screenplay, there is no prior title page to protect, so the
  // PDF's own title page (when Pass 0 detects one) is applied directly rather
  // than staged behind a confirm step. useImportPdf calls onTitlePageDetected
  // before onImport (for exactly this case), so titlePageRef is already set
  // by the time onImport fires.
  const titlePageRef = useRef<TitlePageDocJSON | null>(null);
  const pdfImport = useImportPdf({
    hasExistingContent: false,
    onImport: (fountain) => {
      void createAndSave(fountain, titlePageRef.current);
      titlePageRef.current = null;
    },
    onTitlePageDetected: (doc) => {
      titlePageRef.current = doc;
    },
  });

  return (
    <>
      <input {...pdfImport.fileInputProps} className={styles.hiddenInput} />
      <Button
        variant="secondary"
        type="button"
        onClick={pdfImport.openPicker}
        disabled={isImporting || pdfImport.isLoading}
        data-testid="dashboard-import-pdf"
      >
        {isImporting || pdfImport.isLoading
          ? t("dashboard.importPdf.importing")
          : t("dashboard.importPdf.label")}
      </Button>
      {pdfImport.status.type === "error" && (
        <span role="alert" className={styles.error}>
          {pdfImport.status.message}
        </span>
      )}
      {error && (
        <span role="alert" className={styles.error}>
          {error}
        </span>
      )}
    </>
  );
}
