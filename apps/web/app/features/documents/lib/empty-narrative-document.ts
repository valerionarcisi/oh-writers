import type { DocumentType } from "@oh-writers/domain";
import type { DocumentViewWithPermission } from "../server/documents.server";

// A never-persisted, empty narrative document. Lets the editor render its
// placeholder ("Inizia a scrivere…") when a document hasn't been written yet
// for an otherwise-reachable project. The server find-or-creates the real row,
// so this stand-in is a defensive fallback for the rare transient where the
// row hasn't resolved — its empty `id` is only ever read, never written. The
// first edit goes through `saveDocument`, which creates the real row keyed by
// (projectId, type).
export const emptyNarrativeDocument = (
  projectId: string,
  type: DocumentType,
): DocumentViewWithPermission => ({
  id: "",
  projectId,
  type,
  title: type.charAt(0).toUpperCase() + type.slice(1),
  content: "",
  currentVersionId: null,
  canEdit: true,
  createdBy: "",
  createdAt: new Date(0),
  updatedAt: new Date(0),
});
