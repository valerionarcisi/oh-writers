import { useEffect, useMemo, useRef, useState } from "react";
import type { EditorView } from "prosemirror-view";
import { ContextActionIds, DocumentTypes } from "@oh-writers/domain";
import type { DocumentType, TranslationKey } from "@oh-writers/domain";
import { ActionsMenu, FloatingDock } from "@oh-writers/ui";
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
import { DraftBanner } from "./DraftBanner";
import { TextEditor } from "./TextEditor";
import { NarrativeProseMirrorView } from "./NarrativeProseMirrorView";
import { NarrativeFormatToolbar } from "./NarrativeFormatToolbar";
import { useYjsRoom, PresenceIndicator } from "~/features/realtime";
import { useSession } from "~/lib/auth-client";
import { OutlineEditor } from "./OutlineEditor";
import { NarrativeDocsShell } from "./NarrativeDocsShell";
import { MarginNotesColumn } from "./MarginNotesColumn";
import { TreatmentToc } from "./TreatmentToc";
import { getNarrativeSchema } from "../lib/narrative-schema";
import {
  isBulletListActive,
  isHeadingActive,
  toggleBulletList,
  toggleHeading,
} from "../lib/narrative-plugins";
import { useDocumentVersions } from "~/features/versions";
import {
  useSaveStatePublisher,
  useCesareOpen,
  useContextActions,
  useSetActiveDocument,
  useRoutedSurface,
} from "~/features/app-shell";
import type { ContextActionHandlers } from "~/features/app-shell";
import { createVersionFromScratch } from "../server/versions.server";
import { useTranslation } from "~/features/i18n";
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

const DOCUMENT_PLACEHOLDER_KEYS: Record<DocumentType, TranslationKey | null> = {
  [DocumentTypes.LOGLINE]: "documents.editor.placeholder.logline",
  [DocumentTypes.SOGGETTO]: "documents.editor.placeholder.soggetto",
  [DocumentTypes.SYNOPSIS]: "documents.editor.placeholder.synopsis",
  [DocumentTypes.OUTLINE]: null,
  [DocumentTypes.TREATMENT]: "documents.editor.placeholder.treatment",
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
  const { t } = useTranslation();
  const placeholderKey = DOCUMENT_PLACEHOLDER_KEYS[type];
  const documentPlaceholder = placeholderKey ? t(placeholderKey) : "";
  const [content, setContent] = useState(document.content);
  const editorViewRef = useRef<EditorView | null>(null);
  // Spec 44 TKT-LEAD-01: Cesare opens via shell BottomDock.
  const _openCesare = useCesareOpen();
  void _openCesare;
  const setActiveDocument = useSetActiveDocument();

  // Publish the active document so Cesare's tool router knows which doc to
  // operate on when the user is on a document page.
  useEffect(() => {
    setActiveDocument({ id: document.id, type });
    return () => setActiveDocument(null);
  }, [document.id, type, setActiveDocument]);

  const [, forceToolbarUpdate] = useState(0);
  const save = useSaveDocument();
  const { isDirty, flush } = useAutoSave(
    save,
    document.id,
    content,
    document.content,
  );
  // Spec 49 W4: Versions open via the ROUTER (`?versions=<docId>`), not the
  // legacy context drawer — same routed SplitDrawer as soggetto. The host page
  // compresses beside the lane; `vcur` carries the current-version baseline so
  // the "vs current" diff stays deep-linkable. `vstate`/`vcur`/`compare` are
  // companions cleared on close.
  const versionsSurface = useRoutedSurface({
    param: "versions",
    companions: ["vstate", "vcur", "compare"],
  });
  const isVersionsOpen = versionsSurface.value === document.id;
  // Flush a pending autosave before opening Versions so the listed/diffed
  // content reflects the latest edit, not a stale debounce window.
  const isDirtyRef = useRef(isDirty);
  const flushRef = useRef(flush);
  isDirtyRef.current = isDirty;
  flushRef.current = flush;

  const isOutline = type === DocumentTypes.OUTLINE;
  const isLogline = type === DocumentTypes.LOGLINE;
  const isSynopsis = type === DocumentTypes.SYNOPSIS;
  const isTreatment = type === DocumentTypes.TREATMENT;
  // Pages that promote the logline to the TopBar center and host the unified
  // "…" actions menu in the TopBar right slot (Soggetto parity for Scaletta).
  const hasTopBarDocActions = isSynopsis || isTreatment || isOutline;
  const isReadOnly = !document.canEdit;

  // ─── Realtime collaboration ────────────────────────────────────────────
  const { data: sessionData } = useSession();
  const realtimeUser = sessionData?.user
    ? { id: sessionData.user.id, name: sessionData.user.name }
    : null;
  const {
    ydoc: realtimeDoc,
    provider: realtimeProvider,
    status: realtimeStatus,
    peers: realtimePeers,
  } = useYjsRoom(`document:${document.id}`, realtimeUser, !isReadOnly);
  const narrativeRealtime =
    realtimeStatus === "connected" && realtimeDoc && realtimeProvider
      ? { ydoc: realtimeDoc, provider: realtimeProvider }
      : null;

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
  const { data: docVersionsResult } = useDocumentVersions(document.id);
  const loglineQuery = useDocument(document.projectId, DocumentTypes.LOGLINE);
  const loglineDoc =
    loglineQuery.data && loglineQuery.data.isOk
      ? loglineQuery.data.value
      : null;
  const persistedLogline = loglineDoc?.content ?? "";
  // The logline is the shared PROJECT logline (a sibling document), surfaced in
  // the TopBar pill on every narrative page. Edits made from here apply LIVE to
  // that logline document and autosave, so the pill stays editable+persistent on
  // synopsis/outline/treatment (not just soggetto). canEdit mirrors the page's
  // edit permission.
  const canEditLogline = document.canEdit && !isReadOnly && loglineDoc !== null;
  const [loglineDraft, setLoglineDraft] = useState(persistedLogline);
  useEffect(() => {
    setLoglineDraft(persistedLogline);
  }, [persistedLogline]);
  const saveLogline = useSaveDocument();
  useAutoSave(
    saveLogline,
    loglineDoc?.id ?? "",
    loglineDraft,
    persistedLogline,
  );
  const handleLoglineChange = canEditLogline
    ? (next: string) => setLoglineDraft(next)
    : undefined;
  const exportPdf = useExportNarrativePdf();
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const handleExport = () => {
    if (isVersionsOpen) versionsSurface.close();
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

  const openVersionsDrawer = () => {
    if (isVersionsOpen) {
      versionsSurface.close();
      return;
    }
    // Flush any pending autosave so the drawer lists the latest content.
    if (isDirtyRef.current) flushRef.current();
    versionsSurface.open(
      document.id,
      document.currentVersionId
        ? { vcur: document.currentVersionId }
        : undefined,
    );
  };

  const docVersions = docVersionsResult?.isOk ? docVersionsResult.value : [];
  const currentDocVersion = docVersions.find(
    (v) => v.id === document.currentVersionId,
  );
  const currentVersionLabel = currentDocVersion?.label ?? null;

  const versionFallback = (idx: number) =>
    t("documents.editor.versionFallback").replace("{number}", String(idx + 1));
  const versionMenuItems = [
    ...docVersions.map((v, idx) => ({
      id: `version-${v.id}`,
      label:
        v.id === document.currentVersionId
          ? `● ${v.label ?? versionFallback(idx)}`
          : (v.label ?? versionFallback(idx)),
      onSelect: openVersionsDrawer,
      tone:
        v.id === document.currentVersionId
          ? ("default" as const)
          : ("muted" as const),
    })),
    {
      id: "open-drawer",
      label: t("documents.editor.openVersions"),
      onSelect: openVersionsDrawer,
    },
  ];

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
        placeholder={documentPlaceholder}
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
          {t("documents.editor.loglineError").replace(
            "{max}",
            String(LOGLINE_MAX),
          )}
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
      {realtimeStatus !== "disabled" && (
        <div className={styles.presenceRow}>
          <PresenceIndicator status={realtimeStatus} peers={realtimePeers} />
        </div>
      )}
      {!isReadOnly && (
        <div className={styles.editorToolbar}>
          <NarrativeFormatToolbar
            view={editorViewRef.current}
            enableHeadings={isTreatment}
          />
          {isTreatment && (
            <>
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
                aria-label={t("documents.editor.bulletListAria")}
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
            </>
          )}
        </div>
      )}
      <NarrativeProseMirrorView
        value={content}
        onChange={setContent}
        placeholder={documentPlaceholder}
        readOnly={isReadOnly}
        enableHeadings={isTreatment}
        realtime={narrativeRealtime}
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
      {t("documents.editor.readOnly")}
    </div>
  ) : null;

  const draftBanner = (
    <DraftBanner
      documentId={document.id}
      projectId={document.projectId}
      docType={type}
      currentContent={content}
      canEdit={document.canEdit}
    />
  );

  // The Logline route (if ever wired directly) doesn't get the narrative
  // shell — the logline lives in the viewbar pill on the other 4 routes.
  if (isLogline) {
    return (
      <div className={styles.page}>
        {readOnlyBadge}
        <div className={styles.editorArea}>
          <div className={styles.editorMain}>
            {draftBanner}
            {editorBody}
          </div>
        </div>
        {isExportModalOpen && (
          <ExportPdfModal
            canIncludeTitlePage={true}
            isPending={exportPdf.isPending}
            onClose={() => setIsExportModalOpen(false)}
            onGenerate={handleGenerate}
          />
        )}
        {/* Spec 44 TKT-LEAD-01: page CTAs bottom-left; Cesare → BottomDock. */}
        <FloatingDock
          primaryAction={{
            label:
              isNarrative && exportPdf.isPending
                ? t("documents.editor.exporting")
                : t("documents.editor.exportPdf"),
            hotkey: "⌘E",
            onClick: handleExport,
          }}
          secondaryActions={[]}
        />
      </div>
    );
  }

  const layout = layoutForType(type);
  const rightAside = (
    <MarginNotesColumn
      projectId={document.projectId}
      docType={type}
      content={plainContent}
    />
  );
  const leftAside = isTreatment ? (
    <TreatmentToc content={content} />
  ) : undefined;

  // Unified "…" actions menu for narrative doc pages (Soggetto-style), now built
  // from the shared context-action registry (Spec 55) so every narrative page
  // surfaces its actions through one pattern. The page wires handlers per
  // `ContextActionId`; the registry owns order + gating. PDF export stays
  // disabled when the route has no narrative export (Scaletta).
  const contextActionHandlers = useMemo<ContextActionHandlers>(
    () => ({
      [ContextActionIds.EXPORT_PDF]: {
        onSelect: handleExport,
        disabled: !isNarrative || exportPdf.isPending,
        labelOverride: exportPdf.isPending
          ? t("documents.editor.exportingMenu")
          : undefined,
      },
      [ContextActionIds.VERSIONS]: { onSelect: openVersionsDrawer },
    }),
    // handleExport / openVersionsDrawer are recreated each render and close over
    // `isVersionsOpen` (the open/close toggle reads it). Key the memo on
    // `isVersionsOpen` so it recaptures the current closures whenever that flips
    // — otherwise the Versioni toggle and the "close versions before export"
    // step would act on a stale value. The closures themselves are intentionally
    // omitted from deps (they'd defeat the memo by changing every render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isNarrative, exportPdf.isPending, isVersionsOpen, t],
  );
  const contextActionItems = useContextActions(type, contextActionHandlers);
  const docActionsMenu = hasTopBarDocActions ? (
    <ActionsMenu
      data-testid="narrative-actions-menu"
      items={contextActionItems}
    />
  ) : undefined;

  return (
    <div className={styles.page}>
      {readOnlyBadge}
      <NarrativeDocsShell
        projectId={document.projectId}
        docType={type}
        layout={layout}
        logline={loglineDraft}
        canEditLogline={canEditLogline}
        onLoglineChange={handleLoglineChange}
        versionLabel={currentVersionLabel ?? undefined}
        versionMenuItems={versionMenuItems}
        onOpenVersions={openVersionsDrawer}
        leftAside={leftAside}
        rightAside={rightAside}
        topBarActions={docActionsMenu}
      >
        {draftBanner}
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
    </div>
  );
}
