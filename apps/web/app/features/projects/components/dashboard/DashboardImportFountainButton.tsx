import { useRef, useState } from "react";
import { Button } from "@oh-writers/ui";
import { useCreateProjectFromScreenplay } from "../../hooks/useCreateProjectFromScreenplay";
import { useTranslation } from "~/features/i18n";
import styles from "./DashboardImportFountainButton.module.css";

// Strip a trailing `.fountain` / `.txt` extension and fall back to a default
// title when the filename is empty after stripping.
const titleFromFileName = (fileName: string, fallbackTitle: string): string => {
  const base = fileName.replace(/\.(fountain|txt)$/i, "").trim();
  return base.length > 0 ? base : fallbackTitle;
};

/**
 * Dashboard-level "Importa Fountain" entry. Picks a `.fountain` file, creates a
 * fresh feature project titled from the filename, writes the imported text into
 * the project's screenplay, and lands the user in the editor. Keeps the whole
 * round-trip on the client by chaining the existing project/screenplay server
 * functions — no new endpoint is introduced.
 */
export function DashboardImportFountainButton() {
  const { t } = useTranslation();
  const { createAndImport } = useCreateProjectFromScreenplay();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isImporting, setImporting] = useState(false);

  const openPicker = () => {
    setError(null);
    inputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (inputRef.current) inputRef.current.value = "";
    if (!file) return;

    setImporting(true);
    setError(null);

    const fountain = await file.text();
    const title = titleFromFileName(
      file.name,
      t("dashboard.import.defaultTitle"),
    );
    const ok = await createAndImport(title, fountain);

    setImporting(false);
    if (!ok) setError(t("dashboard.import.failed"));
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".fountain,.txt,text/plain"
        aria-hidden
        tabIndex={-1}
        className={styles.hiddenInput}
        onChange={handleFileChange}
        data-testid="dashboard-import-fountain-input"
      />
      <Button
        variant="secondary"
        type="button"
        onClick={openPicker}
        disabled={isImporting}
        data-testid="dashboard-import-fountain"
      >
        {isImporting
          ? t("dashboard.import.importing")
          : t("dashboard.import.label")}
      </Button>
      {error && (
        <span role="alert" className={styles.error}>
          {error}
        </span>
      )}
    </>
  );
}
