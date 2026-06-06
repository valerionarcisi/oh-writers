export { NarrativeEditor } from "./components/NarrativeEditor";
export { DraftBanner } from "./components/DraftBanner";
export { CesareUpdatedBanner } from "./components/CesareUpdatedBanner";
export {
  useDocumentDrafts,
  usePromoteDocumentDraft,
  useDiscardDocumentDraft,
  documentDraftsQueryOptions,
  getDocumentDrafts,
} from "./hooks/useDocumentDrafts";
export {
  promoteDocumentDraft,
  discardDocumentDraft,
} from "./server/drafts.server";
export { switchToVersion } from "./server/versions.server";
export { DocumentRoutePage } from "./components/DocumentRoutePage";
export { emptyNarrativeDocument } from "./lib/empty-narrative-document";
export { canonicalNarrativeHtml } from "./lib/narrative-html";
export {
  setHighlight,
  clearHighlight,
  getHighlightFragments,
  subscribeHighlight,
} from "./lib/cesare-highlight-store";
export { FreeNarrativeEditor } from "./components/FreeNarrativeEditor";
export type { FreeNarrativeEditorProps } from "./components/FreeNarrativeEditor";
export { TextEditor } from "./components/TextEditor";
export { OutlineEditor } from "./components/OutlineEditor";
export { AIAssistantPanel } from "./components/AIAssistantPanel";
export { NarrativeDocsShell } from "./components/NarrativeDocsShell";
export type { NarrativeDocsShellProps } from "./components/NarrativeDocsShell";
export { NarrativeCesarePanel } from "./components/NarrativeCesarePanel";
export { MarginNotesColumn } from "./components/MarginNotesColumn";
export type { MarginNotesColumnProps } from "./components/MarginNotesColumn";
export { LoglinePill } from "./components/LoglinePill";
export type { LoglinePillProps } from "./components/LoglinePill";
export { TreatmentToc } from "./components/TreatmentToc";
export { SaveStatus } from "./components/SaveStatus";
export * from "./hooks/useDocument";
export * from "./hooks/useExportSubjectDocx";
export { ExportPdfModal } from "./components/ExportPdfModal";
export { ExportSiaeModal } from "./components/ExportSiaeModal";
export type {
  ExportSiaeModalProps,
  ExportSiaeModalLabels,
} from "./components/ExportSiaeModal";
export * from "./hooks/useExportSubjectSiae";
export * from "./documents.errors";
export * from "./documents.schema";
export type {
  DocumentView,
  DocumentViewWithPermission,
} from "./server/documents.server";
export {
  getNarrativeProgress,
  narrativeProgressQueryKey,
  narrativeProgressQueryOptions,
  NarrativePresenceSchema,
} from "./server/narrative-progress.server";
export type { NarrativePresenceShape } from "./server/narrative-progress.server";
export { VersionCompareModal } from "./components/VersionCompareModal";
export type { VersionCompareItem } from "./components/VersionCompareModal";
export {
  versionsQueryOptions as documentVersionsQueryOptions,
  useVersions as useDocumentVersions,
  useCreateVersionFromScratch as useCreateDocumentVersionFromScratch,
  useDuplicateVersion as useDuplicateDocumentVersion,
  useRenameVersion as useRenameDocumentVersion,
  useSwitchToVersion,
  useDeleteDocumentVersion,
  useSaveVersionContent,
} from "./hooks/useVersions";
export { base64ToBlob, downloadBlob, downloadTextFile } from "./lib/download";
export { openPdfPreview } from "./lib/pdf-preview";
export { DOCUMENT_LABELS } from "./lib/document-display";
export {
  siaeMetadataQueryOptions,
  useSiaeMetadata,
  useSaveSiaeMetadata,
} from "./hooks/useSiaeMetadata";
