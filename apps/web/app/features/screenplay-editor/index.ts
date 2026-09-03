// Components
export { ScreenplayEditor } from "./components/ScreenplayEditor";
export type { ScreenplayEditorHandle } from "./components/ScreenplayEditor";
export { ScreenplayEditorShell } from "./components/ScreenplayEditorShell";
export type { ScreenplayEditorShellProps } from "./components/ScreenplayEditorShell";
export { ScreenplayElementChips } from "./components/ScreenplayElementChips";
export { ScreenplayCesarePanel } from "./components/ScreenplayCesarePanel";
export { MonacoWrapper } from "./components/MonacoWrapper";
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
export { useImportPdf } from "./hooks/useImportPdf";
export {
  useVersions,
  useVersion,
  useCurrentVersionId as useScreenplayCurrentVersionId,
  useCreateManualVersion,
  useImportAsActiveVersion,
  useCreateBlankVersion,
  useRestoreVersion,
  useDeleteVersion,
  useRenameVersion,
  useDuplicateVersion,
  useUpdateVersionMeta,
  versionsQueryOptions,
  versionQueryOptions,
} from "./hooks/useVersions";
export {
  ensureFirstVersion,
  importAsActiveVersionTx,
} from "./server/versions.server";

// Server
export {
  getScreenplay,
  saveScreenplay,
  screenplayQueryOptions,
} from "./hooks/useScreenplay";
export { syncStateQueryOptions } from "./server/screenplay.server";
export {
  listVersions,
  getVersion,
  createManualVersion,
  importAsActiveVersion,
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
export { detectElement } from "./lib/fountain-element-detector";
export type { ElementType } from "./lib/fountain-element-detector";

// Server — scene sync
export { syncScenesFromFountain, extractSceneRows } from "./server/scenes-sync";

// Server — Yjs CRDT seeding (used cross-feature to reseed the editor on version
// activate/promote so the Yjs-backed editor reloads the activated content).
export { yjsSnapshotFromFountain } from "./server/yjs-seed.server";

// Types
export type { ScreenplayView } from "./server/screenplay.server";
export type { SaveScreenplayData } from "./screenplay.schema";
export type { ScreenplayError } from "./screenplay.errors";
export type { VersionView } from "./screenplay-versions.schema";
export type { VersionsError } from "./screenplay-versions.errors";
export type { ImportPdfError } from "./pdf-import.errors";
export type { TitlePageDocJSON } from "./lib/title-page-from-pdf";

// Lib — PDF import
export { fountainFromPdf } from "./lib/fountain-from-pdf";
export { fountainToDoc } from "./lib/fountain-to-doc";
export { docToFountain } from "./lib/doc-to-fountain";
export { splitInlineCues } from "./lib/split-inline-cues";
export { normaliseScreenplayFountain } from "./lib/normalise-screenplay-fountain";
export { schema as screenplaySchema } from "./lib/schema";
