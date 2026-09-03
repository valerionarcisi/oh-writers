import { z } from "zod";
import { DRAFT_COLOR_VALUES, type DraftColor } from "./title-page.schema";
import type { TitlePageDocJSON } from "~/features/screenplay-editor";

const DateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

const DraftColorEnum = z.enum(
  DRAFT_COLOR_VALUES as [DraftColor, ...DraftColor[]],
);

// PM doc shape is enforced client-side by the PM schema; on the wire we accept
// any plain JSON object and let the client rebuild + re-validate via PMNode.fromJSON.
// Index value type matches Drizzle's jsonb $type (NonNullable<unknown>) so the
// state shape is wire-compatible with the projects.title_page_doc column.
const TitlePageDocSchema: z.ZodType<Record<string, NonNullable<unknown>>> =
  z.record(z.unknown()) as unknown as z.ZodType<
    Record<string, NonNullable<unknown>>
  >;

export const TitlePageStateSchema = z.object({
  doc: TitlePageDocSchema.nullable().default(null),
  draftDate: DateString.nullable().default(null),
  draftColor: DraftColorEnum.nullable().default(null),
});

export type TitlePageState = z.infer<typeof TitlePageStateSchema>;

// The wire schema above deliberately accepts any plain object (see comment
// on TitlePageDocSchema) — TitlePageDocJSON (the PDF title-page extractor's
// output shape) is runtime-compatible (plain JSON) but structurally distinct
// from `Record<string, unknown>` to TypeScript, since it has fixed-shape
// fields rather than an index signature. Centralises the one unavoidable
// cast here so it exists in exactly one place instead of being re-typed at
// every call site that hands a title-page doc to this mutation.
export const titlePageDocForWire = (
  doc: TitlePageDocJSON,
): Record<string, NonNullable<unknown>> =>
  doc as unknown as Record<string, NonNullable<unknown>>;

export const EMPTY_TITLE_PAGE_STATE: TitlePageState = {
  doc: null,
  draftDate: null,
  draftColor: null,
};

export const UpdateTitlePageStateInput = z.object({
  projectId: z.string().uuid(),
  state: TitlePageStateSchema,
  // When true (the default), the project title is kept in sync with the title
  // extracted from the title-page doc — the correct behaviour when the writer
  // edits the title page by hand. A PDF import passes false: adopting a foreign
  // PDF's title as the project name would silently rename the project.
  syncProjectTitle: z.boolean().default(true),
});

export type UpdateTitlePageStateInput = z.infer<
  typeof UpdateTitlePageStateInput
>;
