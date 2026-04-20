import { createServerFn } from "@tanstack/start";
import { z } from "zod";
import { ResultAsync, err } from "neverthrow";
import { toShape, type ResultShape } from "@oh-writers/utils";
import { requireUser } from "~/server/context";
import { getDb } from "~/server/db";
import { DbError, ForbiddenError } from "../breakdown.errors";
import { canViewBreakdown } from "../lib/permissions";
import { breakdownToCsv } from "../lib/export-csv";
import { buildBreakdownPdf } from "../lib/export-pdf";
import { resolveBreakdownAccessByProjectId } from "./breakdown-access";
import { getProjectBreakdownRows } from "./breakdown.server";

const ExportInput = z.object({
  projectId: z.string().uuid(),
  screenplayVersionId: z.string().uuid(),
});

export const exportBreakdownPdf = createServerFn({ method: "POST" })
  .validator(ExportInput)
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        { pdfBase64: string; filename: string },
        ForbiddenError | DbError
      >
    > => {
      const user = await requireUser();
      const db = await getDb();

      const accessResult = await resolveBreakdownAccessByProjectId(
        db,
        user.id,
        data.projectId,
      );
      if (accessResult.isErr()) return toShape(err(accessResult.error));
      const access = accessResult.value;
      if (!canViewBreakdown(access))
        return toShape(err(new ForbiddenError("export breakdown")));

      const result = await getProjectBreakdownRows(
        db,
        data.projectId,
        data.screenplayVersionId,
      ).andThen((rows) =>
        ResultAsync.fromPromise(
          buildBreakdownPdf(
            access.projectTitle,
            rows.map((r) => ({
              category: r.element.category,
              name: r.element.name,
              totalQuantity: r.totalQuantity,
              scenes: r.scenesPresent
                .map((s) => s.sceneNumber)
                .sort((a, b) => a - b),
            })),
          ),
          (e) => new DbError("export/pdf", e),
        ).map((buf) => ({
          pdfBase64: buf.toString("base64"),
          filename: `breakdown-${access.projectSlug}-${new Date().toISOString().slice(0, 10)}.pdf`,
        })),
      );
      return toShape(result);
    },
  );

export const exportBreakdownCsv = createServerFn({ method: "POST" })
  .validator(ExportInput)
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<{ csv: string; filename: string }, ForbiddenError | DbError>
    > => {
      const user = await requireUser();
      const db = await getDb();

      const accessResult = await resolveBreakdownAccessByProjectId(
        db,
        user.id,
        data.projectId,
      );
      if (accessResult.isErr()) return toShape(err(accessResult.error));
      const access = accessResult.value;
      if (!canViewBreakdown(access))
        return toShape(err(new ForbiddenError("export breakdown")));

      const result = await getProjectBreakdownRows(
        db,
        data.projectId,
        data.screenplayVersionId,
      ).map((rows) => ({
        csv: breakdownToCsv(
          rows.map((r) => ({
            category: r.element.category,
            name: r.element.name,
            description: r.element.description,
            totalQuantity: r.totalQuantity,
            scenes: r.scenesPresent
              .map((s) => s.sceneNumber)
              .sort((a, b) => a - b),
          })),
        ),
        filename: `breakdown-${access.projectSlug}-${new Date().toISOString().slice(0, 10)}.csv`,
      }));
      return toShape(result);
    },
  );
