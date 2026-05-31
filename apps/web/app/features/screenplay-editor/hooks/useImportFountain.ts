import { useRef, useState } from "react";
import { ResultAsync } from "neverthrow";

type Status =
  | { type: "idle" }
  | { type: "confirm"; fountain: string }
  | { type: "error"; message: string };

interface UseImportFountainOptions {
  hasExistingContent: boolean;
  onImport: (fountain: string) => void;
  /** When provided and there are existing versions, the dialog offers a
   *  "save as new version then import" action in addition to plain overwrite. */
  onCreateVersionThenImport?: (fountain: string) => void;
}

interface UseImportFountainResult {
  status: Status;
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

/**
 * Imports a screenplay from a plain `.fountain` (or `.txt`) file. Fountain is
 * already the editor's storage format, so the file text is fed straight to
 * `onImport` — no server round-trip is needed (unlike the PDF path, which must
 * extract text server-side).
 *
 * Rendering (trigger button, error banner, replace-confirm dialog) is left to
 * the caller so the hook stays UI-agnostic and mirrors `useImportPdf`.
 */
export function useImportFountain({
  hasExistingContent,
  onImport,
  onCreateVersionThenImport,
}: UseImportFountainOptions): UseImportFountainResult {
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

    const read = await ResultAsync.fromPromise(
      file.text(),
      () => "read-failed" as const,
    );

    if (read.isErr()) {
      setStatus({ type: "error", message: "Impossibile leggere il file." });
      return;
    }

    const fountain = read.value;
    if (hasExistingContent) {
      setStatus({ type: "confirm", fountain });
    } else {
      onImport(fountain);
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
    if (onCreateVersionThenImport) onCreateVersionThenImport(status.fountain);
    else onImport(status.fountain);
    setStatus({ type: "idle" });
  };

  const cancel = () => setStatus({ type: "idle" });

  return {
    status,
    openPicker,
    fileInputProps: {
      ref: inputRef,
      type: "file",
      accept: ".fountain,.txt,text/plain",
      onChange: handleFileChange,
      "aria-hidden": true,
      tabIndex: -1,
    },
    confirm,
    confirmWithVersion,
    cancel,
  };
}
