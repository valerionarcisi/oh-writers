export { NarrativeEditor } from "./components/NarrativeEditor";
export { DocumentRoutePage } from "./components/DocumentRoutePage";
export { FreeNarrativeEditor } from "./components/FreeNarrativeEditor";
export type { FreeNarrativeEditorProps } from "./components/FreeNarrativeEditor";
export { TextEditor } from "./components/TextEditor";
export { LoglineBlock } from "./components/LoglineBlock";
export type {
  LoglineBlockProps,
  LoglineBlockLabels,
} from "./components/LoglineBlock";
export { OutlineEditor } from "./components/OutlineEditor";
export { AIAssistantPanel } from "./components/AIAssistantPanel";
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
export * from "./hooks/useExtractLoglineFromSubject";
export * from "./documents.errors";
export * from "./documents.schema";
export type {
  DocumentView,
  DocumentViewWithPermission,
} from "./server/documents.server";
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
export { base64ToBlob, downloadBlob } from "./lib/download";
export { openPdfPreview } from "./lib/pdf-preview";
export { DOCUMENT_LABELS } from "./lib/document-display";
export {
  siaeMetadataQueryOptions,
  useSiaeMetadata,
  useSaveSiaeMetadata,
} from "./hooks/useSiaeMetadata";
