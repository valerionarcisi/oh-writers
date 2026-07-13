import { useMutation } from "@tanstack/react-query";
import { unwrapResult } from "@oh-writers/utils";
import { openPdfPreview, downloadBlob } from "~/features/documents";
import {
  exportScheduleCsv,
  exportSchedulePdf,
} from "../server/schedule-export.server";

export const useExportSchedule = (projectId: string) => {
  const csvMut = useMutation({
    mutationFn: async () =>
      unwrapResult(await exportScheduleCsv({ data: { projectId } })),
    onSuccess: ({ csv, filename }) => {
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      downloadBlob(blob, filename);
    },
  });

  const pdfMut = useMutation({
    mutationFn: async () =>
      unwrapResult(await exportSchedulePdf({ data: { projectId } })),
    onSuccess: ({ pdfBase64, filename }) => {
      const bytes = Uint8Array.from(atob(pdfBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      openPdfPreview(URL.createObjectURL(blob), filename);
    },
  });

  // `mutate` is referentially stable (TanStack Query). Returning fresh arrow
  // wrappers here broke every downstream `useMemo` chain and re-published the
  // TopBar actions slot each render — the /schedule "Maximum update depth"
  // loop (live regression, 2026-07-13).
  return {
    exportCsv: csvMut.mutate,
    exportPdf: pdfMut.mutate,
    isCsvPending: csvMut.isPending,
    isPdfPending: pdfMut.isPending,
  };
};
