import { useRef, useState } from "react";
import { match } from "ts-pattern";
import { importPdf } from "../server/pdf-import.server";
import type { ImportPdfError } from "../pdf-import.errors";
import type { TitlePageDocJSON } from "../lib/title-page-from-pdf";
import { dispatchSceneNumberToast } from "../lib/plugins/scene-number-commands";

// Count the `#...#` forced-scene-number markers in the imported Fountain.
// Each one becomes a locked heading in the PM doc — we surface the total
// via a post-import toast so the writer understands Ricalcola will skip them.
const countForcedSceneNumbers = (fountain: string): number => {
  const matches = fountain.match(/^.*#[^#\n]+#\s*$/gm);
  return matches ? matches.length : 0;
};

const announceImport = (fountain: string): void => {
  const n = countForcedSceneNumbers(fountain);
  if (n === 0) return;
  dispatchSceneNumberToast(
    `Importate ${n} scene con numerazione originale. I numeri sono bloccati — sblocca dal menu della scena per rinumerare.`,
  );
};

type Status =
  | { type: "idle" }
  | { type: "confirm"; fountain: string; titlePageDoc: TitlePageDocJSON | null }
  | { type: "loading" }
  | { type: "error"; message: string };

interface UseImportPdfOptions {
  hasExistingContent: boolean;
  onImport: (fountain: string) => void;
  /** When provided and there are existing versions, the dialog offers a
   *  "save as new version then import" action in addition to plain overwrite. */
  onCreateVersionThenImport?: (fountain: string) => void;
  /** Fires whenever Pass 0 detected a title page in the imported PDF. Callers
   *  decide whether to apply it (potentially showing their own confirm dialog
   *  when the project already has a non-empty front page). */
  onTitlePageDetected?: (doc: TitlePageDocJSON) => void;
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

const errorMessage = (error: ImportPdfError): string =>
  match(error)
    .with({ _tag: "InvalidPdfError" }, (e) => e.message)
    .with({ _tag: "EncryptedPdfError" }, (e) => e.message)
    .with({ _tag: "EmptyPdfError" }, (e) => e.message)
    .with({ _tag: "FileTooLargeError" }, (e) => e.message)
    .exhaustive();

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
  onTitlePageDetected,
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

    const { fountain, titlePageDoc } = result.value;

    if (hasExistingContent) {
      setStatus({ type: "confirm", fountain, titlePageDoc });
    } else {
      onImport(fountain);
      announceImport(fountain);
      if (titlePageDoc) onTitlePageDetected?.(titlePageDoc);
      setStatus({ type: "idle" });
    }
  };

  const confirm = () => {
    if (status.type !== "confirm") return;
    onImport(status.fountain);
    announceImport(status.fountain);
    if (status.titlePageDoc) onTitlePageDetected?.(status.titlePageDoc);
    setStatus({ type: "idle" });
  };

  const confirmWithVersion = () => {
    if (status.type !== "confirm") return;
    if (onCreateVersionThenImport) {
      onCreateVersionThenImport(status.fountain);
    } else {
      onImport(status.fountain);
    }
    announceImport(status.fountain);
    if (status.titlePageDoc) onTitlePageDetected?.(status.titlePageDoc);
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
