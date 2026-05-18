import { useMutation } from "@tanstack/react-query";
import { unwrapResult } from "@oh-writers/utils";
import { downloadTextFile } from "~/features/documents/lib/download";
import { exportLocationsCsv } from "../server/locations-export.server";

export const useExportLocations = (projectId: string) =>
  useMutation({
    mutationFn: async () => {
      const result = await exportLocationsCsv({ data: { projectId } });
      return unwrapResult(result);
    },
    onSuccess: ({ csv, filename }) => {
      downloadTextFile(csv, filename, "text/csv;charset=utf-8");
    },
  });
