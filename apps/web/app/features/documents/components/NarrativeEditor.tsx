import { useEffect, useRef, useState } from "react";
import type { EditorView } from "prosemirror-view";
import { DocumentTypes } from "@oh-writers/domain";
import type { DocumentType } from "@oh-writers/domain";
import { FloatingDock } from "@oh-writers/ui";
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
import { ExportPdfModal } from "./ExportPdfModal";
import { TextEditor } from "./TextEditor";
import { NarrativeProseMirrorView } from "./NarrativeProseMirrorView";
import { OutlineEditor } from "./OutlineEditor";
import { NarrativeDocsShell } from "./NarrativeDocsShell";
import { NarrativeCesarePanel } from "./NarrativeCesarePanel";
import { TreatmentToc } from "./TreatmentToc";
import { getNarrativeSchema } from "../lib/narrative-schema";
import {
  isBulletListActive,
  isHeadingActive,
  toggleBulletList,
  toggleHeading,
} from "../lib/narrative-plugins";
import { useVersionsDrawer } from "~/features/versions";
import { useSaveStatePublisher, useCesareOpen } from "~/features/app-shell";
import { createVersionFromScratch } from "../server/versions.server";
import styles from "./NarrativeEditor.module.css";

const stripHtml = (html: string): string =>
  html
    .replace(/<\/(p|h[1-6]|li|br)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .trim();

interface NarrativeEditorProps {
  document: DocumentViewWithPermission;
  type: DocumentType;
}

const DOCUMENT_PLACEHOLDERS: Record<DocumentType, string> = {
  [DocumentTypes.LOGLINE]: "Un protagonista che vuole un obiettivo, ostacolato da un antagonista.",
  [DocumentTypes.SOGGETTO]: "Inizia il tuo soggetto qui…",
  [DocumentTypes.SYNOPSIS]: "Inizia la tua sinossi qui…",
  [DocumentTypes.OUTLINE]: "",
  [DocumentTypes.TREATMENT]: "Inizia il tuo trattamento qui…",
};

// Maps each narrative document type to the visual layout of the shell.
// SYNOPSIS → focus mode (single column).
// OUTLINE → editor + Cesare panel.
// TREATMENT → TOC + editor + Cesare panel.
const layoutForType = (type: DocumentType): "single" | "two" | "three" => {
  if (type === DocumentTypes.SYNOPSIS) return "single";
  if (type === DocumentTypes.TREATMENT) return "three";
  return "two";
};

export function NarrativeEditor({ document, type }: NarrativeEditorProps) {
  const [content, setContent] = useState(document.content);
  const editorViewRef = useRef<EditorView | null>(null);
  const openCesare = useCesareOpen();
  const [, forceToolbarUpdate] = useState(0);
  const save = useSaveDocument();
  const { isDirty, flush } = useAutoSave(
    save,
    document.id,
    content,
    document.content,
  );
  const {
    state: drawerState,
    open: openDrawer,
    close: closeDrawer,
  } = useVersionsDrawer();
  const isVersionsOpen =
    drawerState.isOpen &&
    drawerState.scope?.kind === "document" &&
    drawerState.scope.documentId === document.id;

  // The drawer captures dirtyHook at open(); refs let the captured callbacks
  // read fresh values on every drawer interaction without re-opening.
  const isDirtyRef = useRef(isDirty);
  const flushRef = useRef(flush);
  isDirtyRef.current = isDirty;
  flushRef.current = flush;

  const isOutline = type === DocumentTypes.OUTLINE;
  const isLogline = type === DocumentTypes.LOGLINE;
  const isSynopsis = type === DocumentTypes.SYNOPSIS;
  const isTreatment = type === DocumentTypes.TREATMENT;
  const isReadOnly = !document.canEdit;

  // Track whether the user has actually edited (vs just loaded an empty doc).
  // We only publish a saveState after the first real edit — otherwise the
  // TopBar pill would show a stale "Salvato" on an empty page (V7 bug).
  const [hasEdited, setHasEdited] = useState(content !== document.content);
  useEffect(() => {
    if (content !== document.content) setHasEdited(true);
  }, [content, document.content]);

  const shouldPublishSave = hasEdited && !isReadOnly;
  const publishedSaveState = shouldPublishSave
    ? save.isPending || isDirty
      ? "saving"
      : "saved"
    : undefined;
  useSaveStatePublisher(publishedSaveState);

  const plainContent = isSynopsis || isTreatment ? stripHtml(content) : content;
  const charCount = plainContent.length;
  const loglineOverCap = isLogline && charCount >= LOGLINE_MAX;

  // When the active version changes (e.g. after switchToVersion), reload content
  // from the freshly-fetched document. We key on currentVersionId rather than
  // content itself to avoid overwriting in-progress edits.
  useEffect(() => {
    setContent(document.content);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [document.currentVersionId]);

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

  // E2E test hook: call createVersionFromScratch directly to test server-side
  // permission enforcement (e.g. verify ForbiddenError for viewer role).
  // Gated to non-prod so this isn't exposed on window.* in the deployed app.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (import.meta.env.PROD) return;
    const w = window as unknown as Record<string, unknown>;
    w["__ohWritersCreateVersionFromScratch"] = () =>
      createVersionFromScratch({ data: { documentId: document.id } });
    return () => {
      delete w["__ohWritersCreateVersionFromScratch"];
    };
  }, [document.id]);

  // Narrative export — available on synopsis/treatment/outline. Outline isn't
  // exported via the narrative PDF route today but we still expose the dock
  // affordance so the page chrome stays consistent.
  const isNarrative =
    type === DocumentTypes.LOGLINE ||
    type === DocumentTypes.SYNOPSIS ||
    type === DocumentTypes.TREATMENT;
  const loglineQuery = useDocument(document.projectId, DocumentTypes.LOGLINE);
  const loglineContent =
    loglineQuery.data && loglineQuery.data.isOk
      ? loglineQuery.data.value.content
      : "";
  const exportPdf = useExportNarrativePdf();
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const handleExport = () => {
    if (isVersionsOpen) closeDrawer();
    setIsExportModalOpen(true);
  };
  const handleGenerate = ({
    includeTitlePage,
  }: {
    includeTitlePage: boolean;
  }) => {
    exportPdf.mutate(
      { projectId: document.projectId, includeTitlePage },
      { onSuccess: () => setIsExportModalOpen(false) },
    );
  };

  const toggleVersionsDrawer = () => {
    if (isVersionsOpen) {
      closeDrawer();
    } else {
      openDrawer(
        {
          kind: "document",
          documentId: document.id,
          docType: type,
          canEdit: document.canEdit,
          currentVersionId: document.currentVersionId ?? null,
        },
        {
          dirtyHook: {
            isDirty: () => isDirtyRef.current,
            flush: () => flushRef.current(),
          },
        },
      );
    }
  };

  // ── Editor body — reused inside the shell ──────────────────────────────────
  const editorBody = isOutline ? (
    <OutlineEditor
      value={parseOutline(content)}
      onChange={(outline) => setContent(serializeOutline(outline))}
      readOnly={isReadOnly}
    />
  ) : isLogline ? (
    <div className={styles.pageShell}>
      <TextEditor
        value={content}
        onChange={setContent}
        placeholder={DOCUMENT_PLACEHOLDERS[type]}
        maxLength={LOGLINE_MAX}
        singleLine={false}
        readOnly={isReadOnly}
      />
      {loglineOverCap && (
        <div
          className={styles.errorMessage}
          role="alert"
          data-testid="logline-error"
        >
          Logline is limited to {LOGLINE_MAX} characters.
        </div>
      )}
      <div className={`${styles.editorFooter} ${styles.charCount}`}>
        <span
          data-testid="char-counter"
          className={`${styles.counter} ${charCount > LOGLINE_MAX * 0.9 ? styles.charCountWarn : ""}`}
        >
          {charCount}/{LOGLINE_MAX}
        </span>
      </div>
    </div>
  ) : (
    <div className={styles.pageShell}>
      {isTreatment && !isReadOnly && (
        <div className={styles.editorToolbar}>
          <button
            type="button"
            className={`${styles.editorToolbarBtn} ${
              editorViewRef.current &&
              isHeadingActive(editorViewRef.current.state, 2)
                ? styles.editorToolbarBtnActive
                : ""
            }`}
            aria-pressed={
              editorViewRef.current
                ? isHeadingActive(editorViewRef.current.state, 2)
                : false
            }
            onMouseDown={(e) => {
              e.preventDefault();
              const view = editorViewRef.current;
              if (!view) return;
              toggleHeading(
                getNarrativeSchema(true),
                2,
                view.state,
                view.dispatch,
              );
              view.focus();
            }}
          >
            H2
          </button>
          <button
            type="button"
            className={`${styles.editorToolbarBtn} ${
              editorViewRef.current &&
              isHeadingActive(editorViewRef.current.state, 3)
                ? styles.editorToolbarBtnActive
                : ""
            }`}
            aria-pressed={
              editorViewRef.current
                ? isHeadingActive(editorViewRef.current.state, 3)
                : false
            }
            onMouseDown={(e) => {
              e.preventDefault();
              const view = editorViewRef.current;
              if (!view) return;
              toggleHeading(
                getNarrativeSchema(true),
                3,
                view.state,
                view.dispatch,
              );
              view.focus();
            }}
          >
            H3
          </button>
          <button
            type="button"
            className={`${styles.editorToolbarBtn} ${
              editorViewRef.current &&
              isBulletListActive(editorViewRef.current.state)
                ? styles.editorToolbarBtnActive
                : ""
            }`}
            aria-pressed={
              editorViewRef.current
                ? isBulletListActive(editorViewRef.current.state)
                : false
            }
            aria-label="Elenco puntato"
            onMouseDown={(e) => {
              e.preventDefault();
              const view = editorViewRef.current;
              if (!view) return;
              toggleBulletList(
                getNarrativeSchema(true),
                view.state,
                view.dispatch,
              );
              view.focus();
            }}
          >
            • List
          </button>
        </div>
      )}
      <NarrativeProseMirrorView
        value={content}
        onChange={setContent}
        placeholder={DOCUMENT_PLACEHOLDERS[type]}
        readOnly={isReadOnly}
        enableHeadings={isTreatment}
        onReady={(view) => {
          editorViewRef.current = view;
          // Re-render the toolbar on every transaction so the active
          // pill state reflects the current selection.
          const original = view.props.dispatchTransaction;
          view.setProps({
            dispatchTransaction: (tr) => {
              original?.call(view, tr);
              forceToolbarUpdate((n) => (n + 1) % 1_000_000);
            },
          });
        }}
      />
    </div>
  );

  const readOnlyBadge = isReadOnly ? (
    <div
      className={styles.readOnlyBadge}
      data-testid="narrative-readonly-badge"
      role="status"
    >
      Read only
    </div>
  ) : null;

  // The Logline route (if ever wired directly) doesn't get the narrative
  // shell — the logline lives in the viewbar pill on the other 4 routes.
  if (isLogline) {
    return (
      <div className={styles.page}>
        {readOnlyBadge}
        <div className={styles.editorArea}>
          <div className={styles.editorMain}>{editorBody}</div>
        </div>
        {isExportModalOpen && (
          <ExportPdfModal
            canIncludeTitlePage={true}
            isPending={exportPdf.isPending}
            onClose={() => setIsExportModalOpen(false)}
            onGenerate={handleGenerate}
          />
        )}
        <FloatingDock
          primaryAction={{
            label:
              isNarrative && exportPdf.isPending
                ? "Esportando…"
                : "Esporta PDF",
            hotkey: "⌘E",
            onClick: handleExport,
          }}
          secondaryActions={[]}
          onCesareClick={openCesare}
        />
      </div>
    );
  }

  const layout = layoutForType(type);
  const rightAside = <NarrativeCesarePanel docType={type} />;
  const leftAside = isTreatment ? <TreatmentToc content={content} /> : undefined;

  return (
    <div className={styles.page}>
      {readOnlyBadge}
      <NarrativeDocsShell
        projectId={document.projectId}
        docType={type}
        layout={layout}
        logline={loglineContent}
        canEditLogline={false}
        versionLabel={undefined}
        onOpenVersions={toggleVersionsDrawer}
        leftAside={leftAside}
        rightAside={rightAside}
      >
        {editorBody}
      </NarrativeDocsShell>
      {isExportModalOpen && (
        <ExportPdfModal
          canIncludeTitlePage={true}
          isPending={exportPdf.isPending}
          onClose={() => setIsExportModalOpen(false)}
          onGenerate={handleGenerate}
        />
      )}
      <FloatingDock
        primaryAction={{
          label:
            isNarrative && exportPdf.isPending ? "Esportando…" : "Esporta PDF",
          hotkey: "⌘E",
          onClick: handleExport,
        }}
        secondaryActions={[]}
      />
    </div>
  );
}
