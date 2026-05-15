import { DocumentTypes, type DocumentType } from "@oh-writers/domain";

export const DOCUMENT_LABELS: Record<DocumentType, string> = {
  [DocumentTypes.LOGLINE]: "Logline",
  [DocumentTypes.SOGGETTO]: "Soggetto",
  [DocumentTypes.SYNOPSIS]: "Sinossi",
  [DocumentTypes.OUTLINE]: "Scaletta",
  [DocumentTypes.TREATMENT]: "Trattamento",
};
