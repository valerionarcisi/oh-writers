import type { ExportFormat } from "@oh-writers/domain";
import { extractTitlePageExportFields } from "~/features/projects/title-page-pm/export-fields";
import { buildExportPipeline, type PipelineResult } from "./export-pipeline";
import { canonicalizeFountain } from "./fountain-canonical";
import {
  buildTitlePageFields,
  prependTitlePageToFountain,
  type LegacyTitlePageColumns,
} from "./title-page-prepend";

interface SerializeScreenplayExportInput {
  readonly fountain: string;
  readonly format: ExportFormat;
  readonly includeCoverPage: boolean;
  readonly sceneSelection?: readonly string[];
  readonly legacyTitlePage: LegacyTitlePageColumns;
  readonly titlePageDoc: unknown;
}

export const serializeScreenplayExport = (
  input: SerializeScreenplayExportInput,
): PipelineResult => {
  const canonicalFountain = canonicalizeFountain(input.fountain);
  const fountainWithCover = input.includeCoverPage
    ? prependTitlePageToFountain(
        canonicalFountain,
        buildTitlePageFields(
          input.legacyTitlePage,
          extractTitlePageExportFields(input.titlePageDoc),
        ),
      )
    : canonicalFountain;

  return buildExportPipeline(input.format, {
    fountain: fountainWithCover,
    sceneSelection: input.sceneSelection,
  });
};
