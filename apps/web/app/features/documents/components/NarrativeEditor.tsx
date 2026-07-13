import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EditorView } from "prosemirror-view";
import { ContextActionIds, DocumentTypes, Features } from "@oh-writers/domain";
import type { DocumentType, TranslationKey } from "@oh-writers/domain";
import { useFeature } from "~/features/feature-flags";
import {
  ActionsMenu,
  CopyButton,
  FloatingDock,
  Skeleton,
  computeSaveStatus,
} from "@oh-writers/ui";
import type { DocumentViewWithPermission } from "../server/documents.server";
import {
  useAutoSave,
  useDocument,
  useSaveDocument,
  useVersionResync,
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
import {
  useYjsRoom,
  useRealtimeEditorGate,
  PresenceIndicator,
} from "~/features/realtime";
import { useSession } from "~/lib/auth-client";
import { OutlineEditor } from "./OutlineEditor";
import { NarrativeDocsShell } from "./NarrativeDocsShell";
import { MarginNotesColumn } from "./MarginNotesColumn";
import { AiOffBanner } from "./AiOffBanner";
import { TreatmentToc } from "./TreatmentToc";
import { getNarrativeSchema } from "../lib/narrative-schema";
import { canonicalNarrativeHtml } from "../lib/narrative-html";
import {
  isBulletListActive,
  isHeadingActive,
  toggleBulletList,
  toggleHeading,
} from "../lib/narrative-plugins";
import { useDocumentVersions } from "~/features/documents";
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

// Exported so pages that host a narrative doc outside this component (e.g.
// the Soggetto route's copy-to-clipboard button) can produce the same plain
// text without a fifth ad-hoc stripHtml variant.
export const stripHtml = (html: string): string =>
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
  currentUser?: { readonly id: string; readonly name: string } | null;
}

const DOCUMENT_PLACEHOLDER_KEYS: Record<DocumentType, TranslationKey | null> = {
  [DocumentTypes.LOGLINE]: "documents.editor.placeholder.logline",
  [DocumentTypes.SOGGETTO]: "documents.editor.placeholder.soggetto",
  [DocumentTypes.SYNOPSIS]: "documents.editor.placeholder.synopsis",
  [DocumentTypes.OUTLINE]: null,
  [DocumentTypes.TREATMENT]: "documents.editor.placeholder.treatment",
};

// Maps each narrative document type to the visual layout of the shell.
// Narrative advice is available on every prose surface, so synopsis keeps the
// same editor + editorial aside pattern as the other narrative documents.
// Treatment still stacks TOC + advice in the same right lane.
export const layoutForType = (
  type: DocumentType,
): "single" | "two" | "three" => {
  // Treatment keeps a single right aside (TOC + margin notes stacked) so the
  // document column gets the full remaining width — the TOC moved out of the
  // left column per UX review.
  void type;
  return "two";
};

export function NarrativeEditor({
  document,
  type,
  currentUser = null,
}: NarrativeEditorProps) {
  const { t } = useTranslation();
  const placeholderKey = DOCUMENT_PLACEHOLDER_KEYS[type];
  const documentPlaceholder = placeholderKey ? t(placeholderKey) : "";
  const [content, setContent] = useState(document.content);
  const editorViewRef = useRef<EditorView | null>(null);
  // Spec 44 TKT-LEAD-01: Cesare opens via shell BottomDock.
  const _openCesare = useCesareOpen();
  void _openCesare;
  // Spec 84 §5 — hides the margin-notes column (editorial advice, Cesare
  // entry point) entirely when AI is off.
  const isAiEnabled = useFeature(Features.AI_ENABLED);
  const setActiveDocument = useSetActiveDocument();

  // Publish the active document so Cesare's tool router knows which doc to
  // operate on when the user is on a document page.
  useEffect(() => {
    setActiveDocument({ id: document.id, type });
    return () => setActiveDocument(null);
  }, [document.id, type, setActiveDocument]);

  const [, forceToolbarUpdate] = useState(0);
  const save = useSaveDocument();
  // Spec 63 (extends Spec 61 beyond Soggetto) — compare dirtiness on the
  // CANONICAL serialisation, not the raw string. The rich narrative editor
  // emits HTML; a Cesare apply stores plain text. Without canonical comparison
  // the round-trip looks "dirty" forever and the autosave clobbers the applied
  // draft back (the flash-then-revert / "document deleted" bug) on Sinossi /
  // Trattamento. Scaletta (Outline) serialises an outline string — canonicalise
  // via parse→reserialise so a stable no-op re-serialisation is not dirty.
  const normalizeContent = useCallback(
    (s: string): string => {
      if (type === DocumentTypes.OUTLINE)
        return serializeOutline(parseOutline(s));
      // Treatment uses headings in its schema; the others do not.
      return canonicalNarrativeHtml(s, type === DocumentTypes.TREATMENT);
    },
    [type],
  );
  const { isDirty, isSaving, isError, lastSavedAt, savedContent, flush } =
    useAutoSave(save, document.id, content, document.content, normalizeContent);
  // Spec 49 W4: Versions open via the ROUTER (`?versions=<docId>`), not the
  // legacy context drawer — same routed SplitDrawer as soggetto. The host page
  // compresses beside the lane; `vcur` carries the current-version baseline so
  // the "vs current" diff stays deep-linkable. `vstate`/`vcur`/`compare` are
  // companions cleared on close.
  const versionsSurface = useRoutedSurface({
    param: "versions",
    companions: ["vstate", "vcur", "compare"],
    // Opening Versioni supersedes an open Cesare-peek (the two routed surfaces
    // share the single auxiliary track and must never coexist — Spec 78 A6).
    // Dropping `?peek` here kills the coexistence that seeds the reconciler
    // oscillation (#47).
    conflicts: ["peek"],
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
  const realtimeUser = currentUser
    ? { id: currentUser.id, name: currentUser.name }
    : sessionData?.user
      ? { id: sessionData.user.id, name: sessionData.user.name }
      : null;
  const realtimeRoom = useYjsRoom(
    `document:${document.id}`,
    realtimeUser,
    !isReadOnly,
  );
  const { status: realtimeStatus, peers: realtimePeers } = realtimeRoom;
  // The gate enforces both room-load contracts at once (see
  // useRealtimeEditorGate):
  // - the realtime editor mounts only AFTER the first sync — mounting on bare
  //   `connected` would seed the CRDT while the server state is in flight and
  //   merge the arriving content on top (BUG-N41/BUG-N54 double-seed), and a
  //   throwaway HTTP editor must not mount while the room resolves (its seed +
  //   onChange would autosave and duplicate once realtime arrives) — hence the
  //   first-load skeleton;
  // - once an editor HAS mounted, later status oscillation never swaps it back
  //   to a skeleton or rebuilds it (BUG-N57 remount loop ate keystrokes):
  //   `realtime` stays latched on the synced doc and Yjs buffers any
  //   disconnected stretch.
  const {
    realtime: narrativeRealtime,
    awaitingFirstSync: realtimeAwaitingSync,
  } = useRealtimeEditorGate(realtimeRoom, {
    enabled: !isReadOnly,
    resetKey: document.id,
  });

  // Single publisher for the TopBar pill (Spec 63 P2): derived from the MAIN
  // document's autosave only — never the logline autosave — and computing the
  // full state so `dirty` (porcelain) is distinct from `saving` (in flight) and
  // `error` surfaces a failed save. `flush` lets the pill act as a "save now"
  // button (F3).
  //
  // 2026-07-13 (supersedes the BUG-N55 edit-gate): the pill is ALWAYS visible
  // on an editable document, starting from "Salvato" — the loaded content IS
  // persisted, and a pill that only appears after the first keystroke read as
  // "the save button is missing". Read-only stays hidden (nothing to save).
  const publishedSaveState = !isReadOnly
    ? computeSaveStatus({ isDirty, isSaving, isError, isOffline: false })
    : undefined;
  useSaveStatePublisher(publishedSaveState, undefined, flush);

  const plainContent = isSynopsis || isTreatment ? stripHtml(content) : content;
  const plainSavedContent =
    isSynopsis || isTreatment ? stripHtml(savedContent) : savedContent;
  const charCount = plainContent.length;
  const loglineOverCap = isLogline && charCount >= LOGLINE_MAX;

  // When the active version changes (e.g. after switchToVersion), reload content
  // from the freshly-fetched document — but never on mount or for a version our
  // own save created (BUG-N53/BUG-N56 — see useVersionResync).
  useVersionResync(document.currentVersionId, save, () =>
    setContent(document.content),
  );

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
      {(!isReadOnly || isSynopsis || isTreatment) && (
        <div className={styles.editorToolbar}>
          {!isReadOnly && (
            <NarrativeFormatToolbar
              view={editorViewRef.current}
              enableHeadings={isTreatment}
            />
          )}
          {!isReadOnly && isTreatment && (
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
          {(isSynopsis || isTreatment) && (
            <CopyButton
              getText={() => stripHtml(content)}
              className={styles.copyButton}
              data-testid="narrative-copy"
            />
          )}
        </div>
      )}
      {realtimeAwaitingSync ? (
        <div className={styles.editorLoading} aria-busy="true">
          <Skeleton
            lines={6}
            widths={["70%", "100%", "100%", "90%", "100%", "60%"]}
            ariaLabel="Caricamento documento"
          />
        </div>
      ) : (
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
      )}
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
  // Treatment shows the chapter index (H2/H3 TOC) stacked above the margin notes
  // in the SAME right aside, so the document column isn't squeezed by a separate
  // left column. Spec 84 §5: the margin notes column is a Cesare surface
  // (editorial advice + "Esplora con Cesare" entry point) — hidden entirely
  // when AI is off, not just emptied.
  const rightAside = (
    <>
      {isTreatment && <TreatmentToc content={content} />}
      {isAiEnabled && (
        <MarginNotesColumn
          projectId={document.projectId}
          docType={type}
          content={plainContent}
          savedContent={plainSavedContent}
          isWaitingForSave={isDirty}
        />
      )}
    </>
  );
  const leftAside = undefined;

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
        {!isAiEnabled && realtimeUser && (
          <AiOffBanner userId={realtimeUser.id} />
        )}
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
