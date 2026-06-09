import { z } from "zod";
import type { ScreenplayVersion } from "@oh-writers/db";
import { DRAFT_REVISION_COLORS } from "@oh-writers/domain";

export const DraftColorEnum = z.enum(
  DRAFT_REVISION_COLORS as unknown as [string, ...string[]],
);

const DateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

export const UpdateVersionMetaInput = z.object({
  versionId: z.string().uuid(),
  draftColor: DraftColorEnum.nullable().optional(),
  draftDate: DateString.nullable().optional(),
});

export type UpdateVersionMetaData = z.infer<typeof UpdateVersionMetaInput>;

export const ListVersionsInput = z.object({
  screenplayId: z.string().uuid(),
});

export const GetVersionInput = z.object({
  versionId: z.string().uuid(),
});

// A brand-new BLANK version (empty content) that becomes the active one — the
// "+ Nuova versione" button. The optional label titles the new version.
export const CreateVersionFromScratchInput = z.object({
  screenplayId: z.string().uuid(),
  label: z.string().min(1).max(100).nullable().optional(),
});

export const DuplicateVersionInput = z.object({
  versionId: z.string().uuid(),
  label: z.string().min(1).max(100),
});

export const RenameVersionInput = z.object({
  versionId: z.string().uuid(),
  label: z.string().min(1).max(100),
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

// Spec 71: import the given Fountain as a brand-new version that becomes the
// ACTIVE one. The previous draft stays in its own version row. Distinct from
// `createManualVersion` (checkpoints the current content, no activation) and
// `createBlankVersion` (activates an EMPTY version).
export const ImportAsActiveVersionInput = z.object({
  screenplayId: z.string().uuid(),
  label: z.string().min(1).max(100),
  content: z.string(),
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
export type ImportAsActiveVersionData = z.infer<
  typeof ImportAsActiveVersionInput
>;
export type RestoreVersionData = z.infer<typeof RestoreVersionInput>;
