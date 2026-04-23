import { useMutation } from "@tanstack/react-query";
import { unwrapResult } from "@oh-writers/utils";
import type { ExportFormat } from "@oh-writers/domain";
import { exportScreenplayPdf } from "../server/screenplay-export.server";
import { base64ToBlob } from "~/features/documents/lib/download";
import { openPdfPreview } from "~/features/documents/lib/pdf-preview";

export interface ExportScreenplayPdfInput {
  screenplayId: string;
  includeCoverPage: boolean;
  format: ExportFormat;
  /** Required when `format === "sides"`. */
  sceneNumbers?: string[];
}

export const useExportScreenplayPdf = () =>
  useMutation({
    mutationFn: async (input: ExportScreenplayPdfInput) => {
      const result = unwrapResult(await exportScreenplayPdf({ data: input }));
      const blob = base64ToBlob(result.pdfBase64, "application/pdf");
      const url = URL.createObjectURL(blob);
      openPdfPreview(url, result.filename);
      return result;
    },
  });
