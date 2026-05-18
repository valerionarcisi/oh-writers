import { useMutation } from "@tanstack/react-query";
import { unwrapResult } from "@oh-writers/utils";
import { exportBudgetCsv, exportBudgetPdf } from "../server/budget-export.server";

export const useExportBudget = () =>
  useMutation({
    mutationFn: async (input: {
      projectId: string;
      format: "pdf" | "csv";
    }) => {
      if (input.format === "pdf") {
        return {
          format: "pdf" as const,
          data: unwrapResult(
            await exportBudgetPdf({ data: { projectId: input.projectId } }),
          ),
        };
      }
      return {
        format: "csv" as const,
        data: unwrapResult(
          await exportBudgetCsv({ data: { projectId: input.projectId } }),
        ),
      };
    },
  });
