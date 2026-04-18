import { z } from "zod";
import { DRAFT_COLOR_VALUES, type DraftColor } from "./title-page.schema";

const DateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

const DraftColorEnum = z.enum(
  DRAFT_COLOR_VALUES as [DraftColor, ...DraftColor[]],
);

// PM doc shape is enforced client-side by the PM schema; on the wire we accept
// any plain JSON object and let the client rebuild + re-validate via PMNode.fromJSON.
const TitlePageDocSchema = z.record(z.unknown());

export const TitlePageStateSchema = z.object({
  doc: TitlePageDocSchema.nullable().default(null),
  draftDate: DateString.nullable().default(null),
  draftColor: DraftColorEnum.nullable().default(null),
});

export type TitlePageState = z.infer<typeof TitlePageStateSchema>;

export const EMPTY_TITLE_PAGE_STATE: TitlePageState = {
  doc: null,
  draftDate: null,
  draftColor: null,
};

export const UpdateTitlePageStateInput = z.object({
  projectId: z.string().uuid(),
  state: TitlePageStateSchema,
});

export type UpdateTitlePageStateInput = z.infer<
  typeof UpdateTitlePageStateInput
>;
