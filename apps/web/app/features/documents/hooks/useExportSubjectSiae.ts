import { useMutation } from "@tanstack/react-query";
import { unwrapResult } from "@oh-writers/utils";
import { exportSubjectSiae } from "../server/subject-export-siae.server";
import type { SiaeExportInput } from "../documents.schema";
import { base64ToBlob, downloadBlob } from "../lib/download";

// Pure side-effecting mutation: calls the server, unwraps the Result, then
// downloads the PDF in the browser. No cache invalidation — the export does
// not touch DB state.
export const useExportSubjectSiae = () =>
  useMutation({
    mutationFn: async (input: SiaeExportInput) => {
      const payload = unwrapResult(await exportSubjectSiae({ data: input }));
      const blob = base64ToBlob(payload.base64, payload.mimeType);
      downloadBlob(blob, payload.filename);
      return payload;
    },
  });
