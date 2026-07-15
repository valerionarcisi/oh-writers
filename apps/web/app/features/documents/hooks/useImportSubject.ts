import { useRef, useState } from "react";
import { match } from "ts-pattern";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { unwrapResult } from "@oh-writers/utils";
import type { DocumentType } from "@oh-writers/domain";
import { extractImportText } from "../server/import-extract.server";
import { importNarrativeVersion } from "../server/versions.server";
import type { ImportDocumentError } from "../import.errors";
import { useTranslation } from "~/features/i18n";

type Status =
  | { type: "idle" }
  | { type: "confirm"; text: string; sourceFileName: string }
  | { type: "loading" }
  | { type: "error"; message: string };

interface UseImportSubjectOptions {
  documentId: string;
  projectId: string;
  type: DocumentType;
  hasExistingContent: boolean;
}

interface UseImportSubjectResult {
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
  cancel: () => void;
}

type Translate = ReturnType<typeof useTranslation>["t"];

// Map the typed import error to a localised (IT/EN) banner message via i18n —
// the server returns only the `_tag`, the client owns the copy.
const errorMessage = (error: ImportDocumentError, t: Translate): string =>
  match(error)
    .with({ _tag: "InvalidPdfError" }, () =>
      t("documents.import.error.invalid"),
    )
    .with({ _tag: "EncryptedPdfError" }, () =>
      t("documents.import.error.encrypted"),
    )
    .with({ _tag: "InvalidDocxError" }, () =>
      t("documents.import.error.invalid"),
    )
    .with({ _tag: "UnsupportedFormatError" }, () =>
      t("documents.import.error.unsupported"),
    )
    .with({ _tag: "EmptyImportError" }, () => t("documents.import.error.empty"))
    .with({ _tag: "FileTooLargeError" }, () =>
      t("documents.import.error.tooLarge"),
    )
    .exhaustive();

// importNarrativeVersion's error union isn't JSON-safe once thrown by
// unwrapResult (it's `unknown`), so match structurally on `_tag` rather than
// importing the server-side error classes into client code.
const commitErrorMessage = (error: unknown, t: Translate): string => {
  const tag =
    error instanceof Object && "_tag" in error ? error._tag : undefined;
  return match(tag)
    .with("ValidationError", () => t("documents.import.error.tooLong"))
    .with("DocumentNotFoundError", () => t("documents.import.error.notFound"))
    .with("ForbiddenError", () => t("documents.import.error.forbidden"))
    .otherwise(() => t("documents.import.error.generic"));
};

const TEXT_EXTENSIONS = new Set(["txt", "md"]);

const extensionOf = (fileName: string): string =>
  (fileName.split(".").pop() ?? "").toLowerCase();

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
 * Encapsulates the Soggetto import flow — file picker, extraction (server-side
 * for PDF/DOCX, client-side for TXT/MD), optional replace confirmation, and
 * committing the extracted text as a new activated document version.
 * Rendering (trigger button, error banner, confirm dialog) is left to the
 * caller so the hook can be consumed by any UI shell.
 */
export function useImportSubject({
  documentId,
  projectId,
  type,
  hasExistingContent,
}: UseImportSubjectOptions): UseImportSubjectResult {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [status, setStatus] = useState<Status>({ type: "idle" });

  const commitMutation = useMutation({
    mutationFn: async (input: { content: string; sourceFileName: string }) =>
      unwrapResult(
        await importNarrativeVersion({
          data: {
            documentId,
            sourceFileName: input.sourceFileName,
            content: input.content,
          },
        }),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["documents", projectId, type],
      });
      void queryClient.invalidateQueries({
        queryKey: ["document-versions", documentId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["projects", projectId],
      });
    },
  });

  const openPicker = () => {
    setStatus({ type: "idle" });
    inputRef.current?.click();
  };

  const commitText = async (text: string, sourceFileName: string) => {
    try {
      await commitMutation.mutateAsync({ content: text, sourceFileName });
      setStatus({ type: "idle" });
    } catch (e) {
      setStatus({ type: "error", message: commitErrorMessage(e, t) });
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (inputRef.current) inputRef.current.value = "";
    if (!file) return;

    setStatus({ type: "loading" });

    const extension = extensionOf(file.name);

    let text: string;
    if (TEXT_EXTENSIONS.has(extension)) {
      text = (await file.text()).trim();
      if (!text) {
        setStatus({
          type: "error",
          message: t("documents.import.error.empty"),
        });
        return;
      }
    } else {
      let base64: string;
      try {
        base64 = await toBase64(file);
      } catch {
        setStatus({
          type: "error",
          message: t("documents.import.error.generic"),
        });
        return;
      }

      let result: Awaited<ReturnType<typeof extractImportText>>;
      try {
        result = await extractImportText({
          data: { fileName: file.name, base64 },
        });
      } catch {
        setStatus({
          type: "error",
          message: t("documents.import.error.generic"),
        });
        return;
      }

      if (!result.isOk) {
        setStatus({ type: "error", message: errorMessage(result.error, t) });
        return;
      }
      text = result.value.text;
    }

    if (hasExistingContent) {
      setStatus({ type: "confirm", text, sourceFileName: file.name });
    } else {
      await commitText(text, file.name);
    }
  };

  const confirm = () => {
    if (status.type !== "confirm") return;
    void commitText(status.text, status.sourceFileName);
  };

  const cancel = () => setStatus({ type: "idle" });

  return {
    status,
    isLoading: status.type === "loading" || commitMutation.isPending,
    openPicker,
    fileInputProps: {
      ref: inputRef,
      type: "file",
      accept: ".pdf,.docx,.txt,.md",
      onChange: handleFileChange,
      "aria-hidden": true,
      tabIndex: -1,
    },
    confirm,
    cancel,
  };
}
