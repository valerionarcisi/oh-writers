import { z } from "zod";
import type { ScreenplayVersion } from "@oh-writers/db";

export const ListVersionsInput = z.object({
  screenplayId: z.string().uuid(),
});

export const GetVersionInput = z.object({
  versionId: z.string().uuid(),
});

export const CreateVersionFromScratchInput = z.object({
  screenplayId: z.string().uuid(),
});

export const DuplicateVersionInput = z.object({
  versionId: z.string().uuid(),
});

export const RenameVersionInput = z.object({
  versionId: z.string().uuid(),
  label: z.string().max(80).nullable(),
});

export const SwitchVersionInput = z.object({
  versionId: z.string().uuid(),
});

export const DeleteVersionInput = z.object({
  versionId: z.string().uuid(),
});

export const SaveVersionContentInput = z.object({
  versionId: z.string().uuid(),
  content: z.string(),
  pageCount: z.number().int().min(0),
});

// Legacy shape — kept so existing UI (VersionsList) compiles without
// rewrite while Block 5 ships the new popover.
export const CreateManualVersionInput = z.object({
  screenplayId: z.string().uuid(),
  label: z.string().min(1).max(100),
});

export const RestoreVersionInput = SwitchVersionInput;

// Strip binary yjsSnapshot before sending to client
export type VersionView = Omit<ScreenplayVersion, "yjsSnapshot">;

export type ListVersionsData = z.infer<typeof ListVersionsInput>;
export type GetVersionData = z.infer<typeof GetVersionInput>;
export type CreateVersionFromScratchData = z.infer<
  typeof CreateVersionFromScratchInput
>;
export type DuplicateVersionData = z.infer<typeof DuplicateVersionInput>;
export type RenameVersionData = z.infer<typeof RenameVersionInput>;
export type SwitchVersionData = z.infer<typeof SwitchVersionInput>;
export type DeleteVersionData = z.infer<typeof DeleteVersionInput>;
export type SaveVersionContentData = z.infer<typeof SaveVersionContentInput>;
export type CreateManualVersionData = z.infer<typeof CreateManualVersionInput>;
export type RestoreVersionData = z.infer<typeof RestoreVersionInput>;
