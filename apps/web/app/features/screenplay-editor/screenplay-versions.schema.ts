import { z } from "zod";
import type { ScreenplayVersion } from "@oh-writers/db";

export const ListVersionsInput = z.object({
  screenplayId: z.string().uuid(),
});

export const GetVersionInput = z.object({
  versionId: z.string().uuid(),
});

export const CreateManualVersionInput = z.object({
  screenplayId: z.string().uuid(),
  label: z.string().min(1).max(100),
});

export const RestoreVersionInput = z.object({
  versionId: z.string().uuid(),
});

export const DeleteVersionInput = z.object({
  versionId: z.string().uuid(),
});

export const RenameVersionInput = z.object({
  versionId: z.string().uuid(),
  label: z.string().min(1).max(100),
});

export const DuplicateVersionInput = z.object({
  versionId: z.string().uuid(),
  label: z.string().min(1).max(100),
});

// Strip binary yjsSnapshot before sending to client
export type VersionView = Omit<ScreenplayVersion, "yjsSnapshot">;

export type ListVersionsData = z.infer<typeof ListVersionsInput>;
export type GetVersionData = z.infer<typeof GetVersionInput>;
export type CreateManualVersionData = z.infer<typeof CreateManualVersionInput>;
export type RestoreVersionData = z.infer<typeof RestoreVersionInput>;
export type DeleteVersionData = z.infer<typeof DeleteVersionInput>;
export type RenameVersionData = z.infer<typeof RenameVersionInput>;
export type DuplicateVersionData = z.infer<typeof DuplicateVersionInput>;
