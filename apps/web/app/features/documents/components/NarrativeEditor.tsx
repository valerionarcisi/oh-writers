import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { DocumentTypes } from "@oh-writers/domain";
import type { DocumentType } from "@oh-writers/domain";
import type { DocumentViewWithPermission } from "../server/documents.server";
import {
  useAutoSave,
  useDocument,
  useSaveDocument,
  useExportNarrativePdf,
} from "../hooks/useDocument";
import {
  parseOutline,
  serializeOutline,
  LOGLINE_MAX,
} from "../documents.schema";

const WORDS_PER_PAGE = 250;

const countWords = (text: string): number => {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;
  return trimmed.split(/\s+/).length;
};

const estimatePages = (text: string): number =>
  Math.max(1, Math.ceil(countWords(text) / WORDS_PER_PAGE));
import { TextEditor } from "./TextEditor";
import { OutlineEditor } from "./OutlineEditor";
import { AIAssistantPanel } from "./AIAssistantPanel";
import { SaveStatus } from "./SaveStatus";
import { VersionsMenu } from "./VersionsMenu";
import { VersionCompareModal } from "./VersionCompareModal";
import {
  useVersions,
  useCreateVersionFromScratch,
  useDuplicateVersion,
  useRenameVersion,
  useSwitchToVersion,
  useDeleteDocumentVersion,
} from "../hooks/useVersions";
import styles from "./NarrativeEditor.module.css";

interface NarrativeEditorProps {
  document: DocumentViewWithPermission;
  type: DocumentType;
}

const DOCUMENT_LABELS: Record<DocumentType, string> = {
  [DocumentTypes.LOGLINE]: "Logline",
  [DocumentTypes.SYNOPSIS]: "Synopsis",
  [DocumentTypes.OUTLINE]: "Outline",
  [DocumentTypes.TREATMENT]: "Treatment",
};

const DOCUMENT_PLACEHOLDERS: Record<DocumentType, string> = {
  [DocumentTypes.LOGLINE]: "A [protagonist] must [goal] before [stakes]…",
  [DocumentTypes.SYNOPSIS]: "Begin your synopsis here…",
  [DocumentTypes.OUTLINE]: "",
  [DocumentTypes.TREATMENT]: "Begin your treatment here…",
};

type EditorMode = "free" | "assisted";

export function NarrativeEditor({ document, type }: NarrativeEditorProps) {
  const [content, setContent] = useState(document.content);
  const [mode, setMode] = useState<EditorMode>("free");
  const [compareOpen, setCompareOpen] = useState(false);
  const save = useSaveDocument();
  const { isDirty, isSaving, isError } = useAutoSave(
    save,
    document.id,
    content,
    document.content,
  );

  const isOutline = type === DocumentTypes.OUTLINE;
  const isLogline = type === DocumentTypes.LOGLINE;
  const isSynopsis = type === DocumentTypes.SYNOPSIS;
  const isTreatment = type === DocumentTypes.TREATMENT;
  const isReadOnly = !document.canEdit;

  const charCount = content.length;
  const loglineOverCap = isLogline && charCount >= LOGLINE_MAX;
  const pageEstimate = isTreatment ? estimatePages(content) : 0;

  // Cmd/Ctrl+S — force save, bypassing autosave debounce.
  useEffect(() => {
    if (isReadOnly) return;
    const onKey = (e: KeyboardEvent) => {
      const isSaveCombo =
        (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s";
      if (!isSaveCombo) return;
      e.preventDefault();
      if (!isSaving) save.mutate({ documentId: document.id, content });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isReadOnly, isSaving, save, document.id, content]);

  // E2E test hook: trigger a save with raw content bypassing the textarea
  // (textarea has HTML maxLength enforcement — tests use this to verify
  // server-side validation on bypassed input).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const w = window as unknown as Record<string, unknown>;
    w["__ohWritersSaveDocumentRaw"] = (raw: string) =>
      save.mutate({ documentId: document.id, content: raw });
    return () => {
      delete w["__ohWritersSaveDocumentRaw"];
    };
  }, [document.id, save]);

  // Narrative export — only shown on the three narrative pages, not outline.
  const isNarrative =
    type === DocumentTypes.LOGLINE ||
    type === DocumentTypes.SYNOPSIS ||
    type === DocumentTypes.TREATMENT;
  const logline = useDocument(document.projectId, DocumentTypes.LOGLINE);
  const synopsis = useDocument(document.projectId, DocumentTypes.SYNOPSIS);
  const treatment = useDocument(document.projectId, DocumentTypes.TREATMENT);
  const extractContent = (q: typeof logline): string => {
    if (!q.data || !q.data.isOk) return "";
    return q.data.value.content;
  };
  // Prefer the live (dirty) content for the current doc so the button state
  // reflects what the user is about to export, not the last saved version.
  const contentFor = (t: DocumentType, q: typeof logline): string =>
    t === type ? content : extractContent(q);
  const allEmpty =
    isNarrative &&
    contentFor(DocumentTypes.LOGLINE, logline).trim().length === 0 &&
    contentFor(DocumentTypes.SYNOPSIS, synopsis).trim().length === 0 &&
    contentFor(DocumentTypes.TREATMENT, treatment).trim().length === 0;
  const exportPdf = useExportNarrativePdf();
  const handleExport = () => exportPdf.mutate(document.projectId);

  // Versions menu wiring
  const versionsQuery = useVersions(document.id);
  const createVersion = useCreateVersionFromScratch(document.id);
  const duplicateVersion = useDuplicateVersion(document.id);
  const renameVersion = useRenameVersion(document.id);
  const switchVersion = useSwitchToVersion(document.id);
  const deleteDocVersion = useDeleteDocumentVersion(document.id);
  const versions =
    versionsQuery.data && versionsQuery.data.isOk
      ? versionsQuery.data.value
      : [];
  const currentVersionId = document.currentVersionId ?? null;
  const isVersionBusy =
    createVersion.isPending ||
    duplicateVersion.isPending ||
    renameVersion.isPending ||
    switchVersion.isPending ||
    deleteDocVersion.isPending;

  return (
    <div className={styles.page}>
      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <Link
            to="/projects/$id"
            params={{ id: document.projectId }}
            className={styles.backLink}
          >
            ← Back
          </Link>
          <h1 className={styles.docTitle}>{DOCUMENT_LABELS[type]}</h1>
          {isReadOnly && (
            <span
              className={styles.readOnlyBadge}
              data-testid="narrative-readonly-badge"
            >
              Read only
            </span>
          )}
        </div>
        <div className={styles.toolbarRight}>
          {isNarrative && (
            <button
              type="button"
              className={styles.saveBtn}
              onClick={handleExport}
              disabled={allEmpty || exportPdf.isPending}
              data-testid="narrative-export-pdf"
            >
              {exportPdf.isPending ? "Exporting…" : "Export PDF"}
            </button>
          )}
          {!isReadOnly && (
            <SaveStatus
              isDirty={isDirty}
              isSaving={isSaving}
              isError={isError}
            />
          )}
          <VersionsMenu
            versions={versions}
            currentVersionId={currentVersionId}
            canEdit={document.canEdit}
            isBusy={isVersionBusy}
            onSwitch={(id) => switchVersion.mutate(id)}
            onRename={(id, label) =>
              renameVersion.mutate({ versionId: id, label })
            }
            onDelete={(id) => deleteDocVersion.mutate(id)}
            onCreateFromScratch={() => createVersion.mutate()}
            onDuplicateCurrent={() => {
              if (currentVersionId) duplicateVersion.mutate(currentVersionId);
            }}
            onCompare={
              versions.length >= 2 ? () => setCompareOpen(true) : undefined
            }
          />
          <div
            className={styles.modeToggle}
            role="group"
            aria-label="Editor mode"
          >
            <button
              className={`${styles.modeBtn} ${mode === "free" ? styles.modeBtnActive : ""}`}
              onClick={() => setMode("free")}
              type="button"
            >
              Free
            </button>
            <button
              className={`${styles.modeBtn} ${mode === "assisted" ? styles.modeBtnActive : ""}`}
              onClick={() => setMode("assisted")}
              type="button"
              aria-label="Assisted mode"
            >
              Assisted
            </button>
          </div>
        </div>
      </div>

      {/* Editor area */}
      <div
        className={`${styles.editorArea} ${mode === "assisted" ? styles.assisted : ""}`}
      >
        <div className={styles.editorMain}>
          {isOutline ? (
            <OutlineEditor
              value={parseOutline(content)}
              onChange={(outline) => setContent(serializeOutline(outline))}
              readOnly={isReadOnly}
            />
          ) : (
            <>
              <TextEditor
                value={content}
                onChange={setContent}
                placeholder={DOCUMENT_PLACEHOLDERS[type]}
                maxLength={isLogline ? LOGLINE_MAX : undefined}
                singleLine={false}
                readOnly={isReadOnly}
              />
              {isLogline && loglineOverCap && (
                <div
                  className={styles.errorMessage}
                  role="alert"
                  data-testid="logline-error"
                >
                  Logline is limited to {LOGLINE_MAX} characters.
                </div>
              )}
              <div className={styles.editorFooter}>
                {isLogline && (
                  <span data-testid="char-counter" className={styles.counter}>
                    {charCount}/{LOGLINE_MAX}
                  </span>
                )}
                {isSynopsis && (
                  <span data-testid="char-counter" className={styles.counter}>
                    {charCount} characters
                  </span>
                )}
                {isTreatment && (
                  <>
                    <span data-testid="char-counter" className={styles.counter}>
                      {charCount} characters
                    </span>
                    <span data-testid="page-counter" className={styles.counter}>
                      ~{pageEstimate} {pageEstimate === 1 ? "page" : "pages"}
                    </span>
                  </>
                )}
              </div>
            </>
          )}
        </div>
        {mode === "assisted" && <AIAssistantPanel type={type} />}
      </div>
      {compareOpen && (
        <VersionCompareModal
          versions={versions.map((v) => ({
            id: v.id,
            number: v.number,
            label: v.label,
            content: v.content,
          }))}
          initialRightId={currentVersionId}
          onClose={() => setCompareOpen(false)}
        />
      )}
    </div>
  );
}
