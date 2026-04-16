import { useRef, useState } from "react";
import { importPdf } from "../server/pdf-import.server";
import type { ImportPdfError } from "../pdf-import.errors";

type Status =
  | { type: "idle" }
  | { type: "confirm"; fountain: string }
  | { type: "loading" }
  | { type: "error"; message: string };

interface UseImportPdfOptions {
  hasExistingContent: boolean;
  onImport: (fountain: string) => void;
  /** When provided and there are existing versions, the dialog offers a
   *  "save as new version then import" action in addition to plain overwrite. */
  onCreateVersionThenImport?: (fountain: string) => void;
}

interface UseImportPdfResult {
  status: Status;
  isLoading: boolean;
  openPicker: () => void;
  fileInputProps: {
    ref: React.RefObject<HTMLInputElement | null>;
    type: "file";
    accept: string;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    "aria-hidden": true;
    tabIndex: -1;
  };
  confirm: () => void;
  confirmWithVersion: () => void;
  cancel: () => void;
}

const errorMessage = (error: ImportPdfError): string => error.message;

/** Reads a File as a base64-encoded string (without the data-URL prefix). */
const toBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

/**
 * Encapsulates the PDF import flow — file picker, upload, optional replace
 * confirmation. Rendering (trigger button, error banner, confirm dialog) is
 * left to the caller so the hook can be consumed by any UI shell.
 */
export function useImportPdf({
  hasExistingContent,
  onImport,
  onCreateVersionThenImport,
}: UseImportPdfOptions): UseImportPdfResult {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [status, setStatus] = useState<Status>({ type: "idle" });

  const openPicker = () => {
    setStatus({ type: "idle" });
    inputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
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

  const confirm = () => {
    if (status.type !== "confirm") return;
    onImport(status.fountain);
    setStatus({ type: "idle" });
  };

  const confirmWithVersion = () => {
    if (status.type !== "confirm") return;
    if (onCreateVersionThenImport) {
      onCreateVersionThenImport(status.fountain);
    } else {
      onImport(status.fountain);
    }
    setStatus({ type: "idle" });
  };

  const cancel = () => setStatus({ type: "idle" });

  return {
    status,
    isLoading: status.type === "loading",
    openPicker,
    fileInputProps: {
      ref: inputRef,
      type: "file",
      accept: ".pdf,application/pdf",
      onChange: handleFileChange,
      "aria-hidden": true,
      tabIndex: -1,
    },
    confirm,
    confirmWithVersion,
    cancel,
  };
}
