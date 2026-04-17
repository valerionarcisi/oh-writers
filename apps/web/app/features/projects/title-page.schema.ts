import { z } from "zod";

export const DraftColors = {
  WHITE: "white",
  BLUE: "blue",
  PINK: "pink",
  YELLOW: "yellow",
  GREEN: "green",
  GOLDENROD: "goldenrod",
  BUFF: "buff",
  SALMON: "salmon",
  CHERRY: "cherry",
  TAN: "tan",
} as const;

export type DraftColor = (typeof DraftColors)[keyof typeof DraftColors];

export const DRAFT_COLOR_VALUES = Object.values(DraftColors);

// YYYY-MM-DD, empty string coerces to null at the edges.
const DateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

export const TitlePageSchema = z.object({
  author: z.string().max(200).nullable().default(null),
  basedOn: z.string().max(500).nullable().default(null),
  contact: z.string().max(1000).nullable().default(null),
  draftDate: DateString.nullable().default(null),
  draftColor: z
    .enum(DRAFT_COLOR_VALUES as [DraftColor, ...DraftColor[]])
    .nullable()
    .default(null),
  wgaRegistration: z.string().max(50).nullable().default(null),
  notes: z.string().max(200).nullable().default(null),
});

export type TitlePage = z.infer<typeof TitlePageSchema>;

export const EMPTY_TITLE_PAGE: TitlePage = {
  author: null,
  basedOn: null,
  contact: null,
  draftDate: null,
  draftColor: null,
  wgaRegistration: null,
  notes: null,
};

export const UpdateTitlePageInput = z.object({
  projectId: z.string().uuid(),
  titlePage: TitlePageSchema,
});

export type UpdateTitlePageInput = z.infer<typeof UpdateTitlePageInput>;
