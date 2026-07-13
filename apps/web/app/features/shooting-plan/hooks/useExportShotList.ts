import { useMutation } from "@tanstack/react-query";
import { unwrapResult } from "@oh-writers/utils";
import {
  base64ToBlob,
  downloadBlob,
  downloadTextFile,
} from "~/features/documents";
import {
  exportShotListCsv,
  exportShotListPdf,
} from "../server/shooting-plan-export.server";

/**
 * Provides `exportCsv` and `exportPdf` mutations for the shooting plan.
 * Triggers a browser download on success; exposes `isPending` for both
 * operations so the dock can show loading state.
 */
export const useExportShotList = (projectId: string) => {
  const csvMutation = useMutation({
    mutationFn: async () => {
      const result = unwrapResult(
        await exportShotListCsv({ data: { projectId } }),
      );
      downloadTextFile(result.csv, result.filename, "text/csv;charset=utf-8");
      return result;
    },
  });

  const pdfMutation = useMutation({
    mutationFn: async () => {
      const result = unwrapResult(
        await exportShotListPdf({ data: { projectId } }),
      );
      const blob = base64ToBlob(result.pdfBase64, "application/pdf");
      downloadBlob(blob, result.filename);
      return result;
    },
  });

  // `mutate` is referentially stable — fresh arrow wrappers would break the
  // TopBar actions memo chain into a publish loop (same defect as
  // useExportSchedule, fixed 2026-07-13).
  return {
    exportCsv: csvMutation.mutate,
    exportPdf: pdfMutation.mutate,
    isCsvPending: csvMutation.isPending,
    isPdfPending: pdfMutation.isPending,
  };
};
