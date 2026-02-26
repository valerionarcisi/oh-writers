import { z } from "zod";
import { Formats, Genres } from "@oh-writers/shared";

type FormatValue = (typeof Formats)[keyof typeof Formats];
type GenreValue = (typeof Genres)[keyof typeof Genres];

// Object.values loses literal types; cast back to preserve them for z.enum inference
const formatValues = Object.values(Formats) as unknown as [
  FormatValue,
  ...FormatValue[],
];
const genreValues = Object.values(Genres) as unknown as [
  GenreValue,
  ...GenreValue[],
];

export const CreateProjectInput = z.object({
  title: z.string().min(1).max(200),
  format: z.enum(formatValues),
  genre: z.enum(genreValues).optional(),
  teamId: z.string().uuid().optional(),
});

export const UpdateProjectInput = z.object({
  projectId: z.string().uuid(),
  data: z.object({
    title: z.string().min(1).max(200).optional(),
    format: z.enum(formatValues).optional(),
    genre: z.enum(genreValues).optional().nullable(),
    logline: z.string().max(500).optional().nullable(),
  }),
});

export type CreateProjectData = z.infer<typeof CreateProjectInput>;
export type UpdateProjectData = z.infer<typeof UpdateProjectInput>;
