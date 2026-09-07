import { createServerFn } from "@tanstack/start";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { ResultAsync, ok } from "neverthrow";
import { schedules } from "@oh-writers/db/schema";
import { translations } from "@oh-writers/domain";
import { toShape, type ResultShape } from "@oh-writers/utils";
import { withProjectAccess } from "~/server/pipeline";
import { ForbiddenError, DbError } from "../schedule.errors";
import { ProjectNotFoundError } from "~/features/projects";
import { loadScheduleView } from "./schedule.server";
import { scheduleToCsv } from "../lib/export-csv";
import { buildSchedulePdf } from "../lib/export-pdf";

const ExportInput = z.object({ projectId: z.string().uuid() });

export const exportScheduleCsv = createServerFn({ method: "POST" })
  .validator(ExportInput)
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        { csv: string; filename: string },
        ProjectNotFoundError | ForbiddenError | DbError
      >
    > =>
      toShape(
        await withProjectAccess(data.projectId, "view", ({ db, access }) => {
          const slug = access.project.slug;
          const date = new Date().toISOString().slice(0, 10);
          const filename = `${slug}-schedule-${date}.csv`;

          return ResultAsync.fromPromise(
            db.query.schedules
              .findFirst({ where: eq(schedules.projectId, data.projectId) })
              .then((r) => r ?? null),
            (e) => new DbError("exportScheduleCsv/findSchedule", e),
          ).andThen((schedule) => {
            if (!schedule) return ok({ csv: "", filename });
            const aiDisclosureNote = schedule.everAiTouched
              ? translations.it["schedule.export.aiDisclosureNote"]
              : undefined;
            return ResultAsync.fromPromise(
              loadScheduleView(db, schedule.id),
              (e) => new DbError("exportScheduleCsv/loadView", e),
            ).map((view) => ({
              csv: view
                ? scheduleToCsv(view.shootingDays, aiDisclosureNote)
                : "",
              filename,
            }));
          });
        }),
      ),
  );

export const exportSchedulePdf = createServerFn({ method: "POST" })
  .validator(ExportInput)
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        { pdfBase64: string; filename: string },
        ProjectNotFoundError | ForbiddenError | DbError
      >
    > =>
      toShape(
        await withProjectAccess(data.projectId, "view", ({ db, access }) => {
          const slug = access.project.slug;
          const title = access.project.title;
          const date = new Date().toISOString().slice(0, 10);
          const filename = `${slug}-schedule-${date}.pdf`;

          return ResultAsync.fromPromise(
            db.query.schedules
              .findFirst({ where: eq(schedules.projectId, data.projectId) })
              .then((r) => r ?? null),
            (e) => new DbError("exportSchedulePdf/findSchedule", e),
          ).andThen((schedule) => {
            if (!schedule) {
              return ResultAsync.fromPromise(
                buildSchedulePdf(title, []),
                (e) => new DbError("exportSchedulePdf/buildPdf", e),
              ).map((buf) => ({
                pdfBase64: buf.toString("base64"),
                filename,
              }));
            }
            const aiDisclosureNote = schedule.everAiTouched
              ? translations.it["schedule.export.aiDisclosureNote"]
              : undefined;
            return ResultAsync.fromPromise(
              loadScheduleView(db, schedule.id),
              (e) => new DbError("exportSchedulePdf/loadView", e),
            ).andThen((view) =>
              ResultAsync.fromPromise(
                buildSchedulePdf(title, view?.shootingDays ?? [], {
                  aiDisclosureNote,
                }),
                (e) => new DbError("exportSchedulePdf/buildPdf", e),
              ).map((buf) => ({
                pdfBase64: buf.toString("base64"),
                filename,
              })),
            );
          });
        }),
      ),
  );
