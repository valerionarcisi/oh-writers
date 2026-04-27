import { useMutation } from "@tanstack/react-query";
import { unwrapResult } from "@oh-writers/utils";
import { exportScreenplayPdf } from "../server/screenplay-export.server";
import { base64ToBlob, openPdfPreview } from "~/features/documents";

export const useExportScreenplayPdf = () =>
  useMutation({
    mutationFn: async (input: {
      screenplayId: string;
      includeCoverPage: boolean;
    }) => {
      const result = unwrapResult(await exportScreenplayPdf({ data: input }));
      const blob = base64ToBlob(result.pdfBase64, "application/pdf");
      const url = URL.createObjectURL(blob);
      openPdfPreview(url, result.filename);
      return result;
    },
  });
