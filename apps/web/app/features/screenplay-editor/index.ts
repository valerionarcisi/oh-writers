// Components
export { ScreenplayEditor } from "./components/ScreenplayEditor";
export { ScreenplayToolbar } from "./components/ScreenplayToolbar";
export { MonacoWrapper } from "./components/MonacoWrapper";
export { ToolbarMenu } from "./components/ToolbarMenu";
export { SaveIndicator } from "./components/SaveIndicator";
export { VersionsList } from "./components/VersionsList";
export { VersionsPanel } from "./components/VersionsPanel";
export { VersionViewingBanner } from "./components/VersionViewingBanner";
export { VersionViewer } from "./components/VersionViewer";
export { VersionDiff } from "./components/VersionDiff";
export { ReadOnlyScreenplayView } from "./components/ReadOnlyScreenplayView";

// Hooks
export {
  useScreenplay,
  useSaveScreenplay,
  useAutoSave,
} from "./hooks/useScreenplay";
export {
  useVersions,
  useVersion,
  useCreateManualVersion,
  useRestoreVersion,
  useDeleteVersion,
  useRenameVersion,
  useDuplicateVersion,
  useUpdateVersionMeta,
  versionsQueryOptions,
  versionQueryOptions,
} from "./hooks/useVersions";
export { useMenuPopover } from "./hooks/useMenuPopover";
export { ensureFirstVersion } from "./server/versions.server";

// Server
export {
  getScreenplay,
  saveScreenplay,
  screenplayQueryOptions,
} from "./hooks/useScreenplay";
export {
  listVersions,
  getVersion,
  createManualVersion,
  restoreVersion,
  deleteVersion,
  renameVersion,
  duplicateVersion,
} from "./hooks/useVersions";

// Lib
export {
  estimatePageCount,
  currentPageFromLine,
  formatPageCount,
} from "./lib/page-counter";
export { registerFountainLanguage } from "./lib/fountain-language";
export { registerFountainKeybindings } from "./lib/fountain-keybindings";
export {
  registerFountainAutocomplete,
  extractCharacterNames,
  extractLocations,
} from "./lib/fountain-autocomplete";
export { diffScreenplays, diffStats } from "./lib/diff";

// Types
export type { ScreenplayView } from "./server/screenplay.server";
export type { SaveScreenplayData } from "./screenplay.schema";
export type { ScreenplayError } from "./screenplay.errors";
export type { VersionView } from "./screenplay-versions.schema";
export type { VersionsError } from "./screenplay-versions.errors";
export type { ImportPdfError } from "./pdf-import.errors";

// Lib — PDF import
export { fountainFromPdf } from "./lib/fountain-from-pdf";
export { fountainToDoc } from "./lib/fountain-to-doc";
export { schema as screenplaySchema } from "./lib/schema";
