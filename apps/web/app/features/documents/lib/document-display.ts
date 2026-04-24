import { DocumentTypes, type DocumentType } from "@oh-writers/domain";

export const DOCUMENT_LABELS: Record<DocumentType, string> = {
  [DocumentTypes.LOGLINE]: "Logline",
  [DocumentTypes.SOGGETTO]: "Soggetto",
  [DocumentTypes.SYNOPSIS]: "Synopsis",
  [DocumentTypes.OUTLINE]: "Outline",
  [DocumentTypes.TREATMENT]: "Treatment",
};
