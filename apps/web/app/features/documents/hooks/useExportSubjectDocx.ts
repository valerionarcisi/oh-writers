import { useMutation } from "@tanstack/react-query";
import { unwrapResult } from "@oh-writers/utils";
import { exportSubjectDocx } from "../server/subject-export-docx.server";
import { base64ToBlob, downloadBlob } from "../lib/download";

export const useExportSubjectDocx = () =>
  useMutation({
    mutationFn: async (input: { projectId: string }) => {
      const result = unwrapResult(await exportSubjectDocx({ data: input }));
      const blob = base64ToBlob(result.base64, result.mimeType);
      downloadBlob(blob, result.filename);
      return result;
    },
  });
