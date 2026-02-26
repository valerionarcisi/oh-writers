import { z } from "zod";

export const GetScreenplayInput = z.object({
  projectId: z.string().uuid(),
});

export const SaveScreenplayInput = z.object({
  screenplayId: z.string().uuid(),
  content: z.string(),
});

export type GetScreenplayData = z.infer<typeof GetScreenplayInput>;
export type SaveScreenplayData = z.infer<typeof SaveScreenplayInput>;
