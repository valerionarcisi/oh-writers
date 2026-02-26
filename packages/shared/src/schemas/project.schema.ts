import { z } from "zod";
import { Genres, Formats, DocumentTypes } from "../constants.js";

export const ProjectSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(200),
  slug: z.string().min(1).max(200),
  genre: z
    .enum([
      Genres.DRAMA,
      Genres.COMEDY,
      Genres.THRILLER,
      Genres.HORROR,
      Genres.ACTION,
      Genres.SCI_FI,
      Genres.DOCUMENTARY,
      Genres.OTHER,
    ])
    .nullable(),
  format: z.enum([
    Formats.FEATURE,
    Formats.SHORT,
    Formats.SERIES_EPISODE,
    Formats.PILOT,
  ]),
  logline: z.string().max(500).nullable(),
  ownerId: z.string().uuid().nullable(),
  teamId: z.string().uuid().nullable(),
  isArchived: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const DocumentSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  type: z.enum([
    DocumentTypes.LOGLINE,
    DocumentTypes.SYNOPSIS,
    DocumentTypes.OUTLINE,
    DocumentTypes.TREATMENT,
  ]),
  title: z.string().min(1).max(200),
  content: z.string(),
  createdBy: z.string().uuid(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type Project = z.infer<typeof ProjectSchema>;
export type Document = z.infer<typeof DocumentSchema>;
