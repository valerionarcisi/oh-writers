import { useRef, useState } from "react";
import { importPdf } from "../server/pdf-import.server";
import type { ImportPdfError } from "../pdf-import.errors";
import styles from "./ImportPdfButton.module.css";

interface ImportPdfButtonProps {
  hasExistingContent: boolean;
  onImport: (fountain: string) => void;
}

type Status =
  | { type: "idle" }
  | { type: "confirm"; fountain: string }
  | { type: "loading" }
  | { type: "error"; message: string };

const errorMessage = (error: ImportPdfError): string => error.message;

/** Reads a File as a base64-encoded string (without the data-URL prefix). */
const toBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // result is "data:application/pdf;base64,AAAA..." — strip the prefix
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

export function ImportPdfButton({
  hasExistingContent,
  onImport,
}: ImportPdfButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>({ type: "idle" });

  const handleClick = () => {
    setStatus({ type: "idle" });
    inputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset so the same file can be re-selected after an error
    if (inputRef.current) inputRef.current.value = "";
    if (!file) return;

    setStatus({ type: "loading" });

    let base64: string;
    try {
      base64 = await toBase64(file);
    } catch {
      setStatus({ type: "error", message: "Could not read the file." });
      return;
    }

    const result = await importPdf({ data: { fileName: file.name, base64 } });

    if (!result.isOk) {
      setStatus({ type: "error", message: errorMessage(result.error) });
      return;
    }

    if (hasExistingContent) {
      setStatus({ type: "confirm", fountain: result.value });
    } else {
      onImport(result.value);
      setStatus({ type: "idle" });
    }
  };

  const handleConfirm = () => {
    if (status.type !== "confirm") return;
    onImport(status.fountain);
    setStatus({ type: "idle" });
  };

  const handleCancel = () => setStatus({ type: "idle" });

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,application/pdf"
        className={styles.hiddenInput}
        onChange={handleFileChange}
        aria-hidden="true"
        tabIndex={-1}
        data-testid="pdf-file-input"
      />

      <button
        className={styles.importBtn}
        type="button"
        onClick={handleClick}
        disabled={status.type === "loading"}
        title="Import screenplay from PDF"
        data-testid="import-pdf-btn"
      >
        {status.type === "loading" ? "Importing…" : "Import PDF"}
      </button>

      {status.type === "error" && (
        <div
          className={styles.errorBanner}
          role="alert"
          data-testid="import-error"
        >
          {status.message}
          <button
            type="button"
            className={styles.dismissBtn}
            onClick={handleCancel}
          >
            ✕
          </button>
        </div>
      )}

      {status.type === "confirm" && (
        <div
          className={styles.confirmOverlay}
          role="dialog"
          aria-modal="true"
          data-testid="import-confirm"
        >
          <div className={styles.confirmBox}>
            <p className={styles.confirmText}>
              Replace the current screenplay with the imported content?
            </p>
            <div className={styles.confirmActions}>
              <button
                type="button"
                className={styles.confirmBtn}
                onClick={handleConfirm}
                data-testid="import-confirm-ok"
              >
                Replace
              </button>
              <button
                type="button"
                className={styles.cancelBtn}
                onClick={handleCancel}
                data-testid="import-confirm-cancel"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
