// IT is the default runtime language (Spec 04f). Hook up the shared i18n
// layer later to surface English copy for non-IT users.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { assertValidProjectId } from "~/lib/project-route";
import { match } from "ts-pattern";
import { ContextActionIds, DocumentTypes, Features } from "@oh-writers/domain";
import {
  ActionsMenu,
  ConfirmDialog,
  Skeleton,
  computeSaveStatus,
} from "@oh-writers/ui";
import {
  canonicalNarrativeHtml,
  CesareUpdatedBanner,
  ExportPdfModal,
  ExportSiaeModal,
  FreeNarrativeEditor,
  MarginNotesColumn,
  NarrativeDocsShell,
  useAutoSave,
  useDocument,
  useExportSubjectDocx,
  useImportSubject,
  useSaveDocument,
  useSiaeMetadata,
  useVersionResync,
  emptyNarrativeDocument,
} from "~/features/documents";
import { toErrorView } from "~/components/ResultErrorView";
import { useProject } from "~/features/projects";
import {
  useCesareOpen,
  useContextActions,
  useSetActiveDocument,
  useRoutedSurface,
  reportCurrentVersion,
  useSaveStatePublisher,
} from "~/features/app-shell";
import type { ContextActionHandlers } from "~/features/app-shell";
import { useSession } from "~/lib/auth-client";
import { useTranslation } from "~/features/i18n";
import { useFeature } from "~/features/feature-flags";
import { titleHead } from "~/lib/document-title";
import type { DocumentViewWithPermission } from "~/features/documents";
import styles from "./_app.projects.$id_.soggetto.module.css";
import { Route as appRoute } from "./_app";

export const Route = createFileRoute("/_app/projects/$id_/soggetto")({
  beforeLoad: ({ params }) => assertValidProjectId(params),
  head: () => titleHead("Soggetto"),
  component: SoggettoPage,
});

function SoggettoPage() {
  const { id } = Route.useParams();
  const { user } = appRoute.useLoaderData();
  const soggetto = useDocument(id, DocumentTypes.SOGGETTO);
  const logline = useDocument(id, DocumentTypes.LOGLINE);

  if (soggetto.isLoading || logline.isLoading) {
    return (
      <div className={styles.status}>
        <Skeleton
          lines={4}
          widths={["80%", "100%", "100%", "65%"]}
          ariaLabel="Caricamento soggetto"
        />
      </div>
    );
  }
  if (!soggetto.data || !logline.data) return null;

  // A not-yet-written document on a reachable project is an empty editor, not
  // an error — the server find-or-creates the row, so DocumentNotFoundError
  // here is a transient that resolves to an empty doc. Only project-level
  // failures (missing / forbidden project, DB error) surface an error body.
  const soggettoView = match(soggetto.data)
    .with({ isOk: true }, ({ value }) => ({ ok: true as const, value }))
    .with({ isOk: false }, ({ error }) =>
      match(error)
        .with({ _tag: "DocumentNotFoundError" }, () => ({
          ok: true as const,
          value: emptyNarrativeDocument(id, DocumentTypes.SOGGETTO),
        }))
        .otherwise((e) => ({
          ok: false as const,
          message: toErrorView(e).message,
        })),
    )
    .exhaustive();

  const loglineView = match(logline.data)
    .with({ isOk: true }, ({ value }) => ({ ok: true as const, value }))
    .with({ isOk: false }, ({ error }) =>
      match(error)
        .with({ _tag: "DocumentNotFoundError" }, () => ({
          ok: true as const,
          value: emptyNarrativeDocument(id, DocumentTypes.LOGLINE),
        }))
        .otherwise((e) => ({
          ok: false as const,
          message: toErrorView(e).message,
        })),
    )
    .exhaustive();

  if (!soggettoView.ok) {
    return <div className={styles.statusError}>{soggettoView.message}</div>;
  }
  if (!loglineView.ok) {
    return <div className={styles.statusError}>{loglineView.message}</div>;
  }

  return (
    <SoggettoPageReady
      projectId={id}
      soggettoDoc={soggettoView.value}
      loglineDoc={loglineView.value}
      currentUser={user}
    />
  );
}

interface SoggettoPageReadyProps {
  readonly projectId: string;
  readonly soggettoDoc: DocumentViewWithPermission;
  readonly loglineDoc: DocumentViewWithPermission;
  readonly currentUser: { readonly id: string; readonly name: string };
}

function SoggettoPageReady({
  projectId,
  soggettoDoc,
  loglineDoc,
  currentUser,
}: SoggettoPageReadyProps) {
  const [soggettoContent, setSoggettoContent] = useState(soggettoDoc.content);
  // Spec 44 TKT-LEAD-01: Cesare opens via shell BottomDock.
  const _openCesare = useCesareOpen();
  void _openCesare;
  // Spec 84 §5 — hides the margin-notes column and shows the AI-off banner
  // instead when Features.AI_ENABLED is off.
  const isAiEnabled = useFeature(Features.AI_ENABLED);
  const setActiveDocument = useSetActiveDocument();
  const [loglineContent, setLoglineContent] = useState(loglineDoc.content);
  const saveSoggetto = useSaveDocument();
  const saveLogline = useSaveDocument();

  // When the server-side current version changes (e.g. user activates a
  // Cesare draft from the drawer, or promotes a version), the route query
  // refetches and the doc content is the new active text — but the local
  // `useState` initial value is frozen at mount. Re-sync on version change,
  // but never on mount or for a version our own save created
  // (BUG-N53/BUG-N56 — see useVersionResync).
  useVersionResync(soggettoDoc.currentVersionId, saveSoggetto, () =>
    setSoggettoContent(soggettoDoc.content),
  );
  useVersionResync(loglineDoc.currentVersionId, saveLogline, () =>
    setLoglineContent(loglineDoc.content),
  );

  // Publish the soggetto as the active document so Cesare's tool router can
  // operate on its content when this page is open.
  useEffect(() => {
    setActiveDocument({ id: soggettoDoc.id, type: DocumentTypes.SOGGETTO });
    return () => setActiveDocument(null);
  }, [soggettoDoc.id, setActiveDocument]);

  // Spec 63 — report the open editor's current version BEFORE a Cesare turn so
  // the live-edit stack can pair the edit with the pre-turn snapshot (option A),
  // making ↩ Annulla restore the state before the whole turn regardless of any
  // intermediate versions Cesare creates mid-turn.
  useEffect(() => {
    reportCurrentVersion(DocumentTypes.SOGGETTO, soggettoDoc.currentVersionId);
  }, [soggettoDoc.currentVersionId]);
  const { t } = useTranslation();
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isSiaeOpen, setIsSiaeOpen] = useState(false);
  // SIAE is the Italian copyright registry — gating is owned by the context-action
  // registry (Spec 55) via `useContextActions`, which drops the SIAE descriptor on
  // the international market. No inline market/feature check here.
  const projectQuery = useProject(projectId);
  const projectOk =
    projectQuery.data && projectQuery.data.isOk
      ? projectQuery.data.value
      : null;
  const { data: session } = useSession();
  const siaeMetadataQuery = useSiaeMetadata(projectId);
  const savedMetadata =
    siaeMetadataQuery.data !== undefined ? siaeMetadataQuery.data : null;
  const siaeDefaults = {
    title: projectOk?.title ?? "",
    declaredGenre: projectOk?.genre ?? "",
    ownerFullName: session?.user?.name ?? null,
    savedMetadata,
  };

  const exportDocx = useExportSubjectDocx();
  const importSubject = useImportSubject({
    documentId: soggettoDoc.id,
    projectId,
    type: DocumentTypes.SOGGETTO,
    hasExistingContent: soggettoContent.trim().length > 0,
  });
  // Spec 49 W2: Versions open via the ROUTER (`?versions=<docId>`), not the
  // legacy context drawer. The host page compresses beside the routed
  // SplitDrawer. `vcur` carries the current-version baseline for the
  // "vs current" diff so the surface stays deep-linkable.
  const versionsSurface = useRoutedSurface({
    param: "versions",
    companions: ["vstate", "vcur"],
    // Opening Versioni supersedes an open Cesare-peek: the two routed surfaces
    // share the single auxiliary track and must never coexist in the URL
    // (Spec 78 A6). Dropping `?peek` here kills the coexistence that seeds the
    // URL ↔ history reconciler oscillation (#47).
    conflicts: ["peek"],
  });
  const isVersionsOpen = versionsSurface.value === soggettoDoc.id;
  const versionsOpen = versionsSurface.open;
  const versionsClose = versionsSurface.close;
  const toggleVersions = useCallback(() => {
    if (isVersionsOpen) {
      versionsClose();
      return;
    }
    versionsOpen(
      soggettoDoc.id,
      soggettoDoc.currentVersionId
        ? { vcur: soggettoDoc.currentVersionId }
        : undefined,
    );
  }, [
    isVersionsOpen,
    versionsOpen,
    versionsClose,
    soggettoDoc.id,
    soggettoDoc.currentVersionId,
  ]);

  // Spec 61 — compare dirtiness on the CANONICAL serialisation. The free
  // narrative editor (enableHeadings) emits HTML; a Cesare apply stores plain
  // text. Without canonical comparison the round-trip looks "dirty" forever and
  // the autosave clobbers the applied draft back (the flash-then-revert bug).
  const normalizeSoggetto = useCallback(
    (s: string) => canonicalNarrativeHtml(s, true),
    [],
  );
  const soggettoSave = useAutoSave(
    saveSoggetto,
    soggettoDoc.id,
    soggettoContent,
    soggettoDoc.content,
    normalizeSoggetto,
  );
  // Single publisher for the TopBar pill (Spec 63 P2): the soggetto document is
  // the page's primary save state — never the logline autosave.
  // 2026-07-13 (supersedes the BUG-N55 edit-gate): always published on an
  // editable document, starting from "Salvato" — see NarrativeEditor.
  useSaveStatePublisher(
    soggettoDoc.canEdit
      ? computeSaveStatus({
          isDirty: soggettoSave.isDirty,
          isSaving: soggettoSave.isSaving,
          isError: soggettoSave.isError,
          isOffline: false,
        })
      : undefined,
    undefined,
    soggettoSave.flush,
  );
  const loglineSave = useAutoSave(
    saveLogline,
    loglineDoc.id,
    loglineContent,
    loglineDoc.content,
  );

  const canEdit = soggettoDoc.canEdit && loglineDoc.canEdit;

  const handleExport = (opts: { format: "pdf" | "docx" }) => {
    if (opts.format !== "docx") return;
    exportDocx.mutate(
      { projectId },
      { onSuccess: () => setIsExportOpen(false) },
    );
  };

  // The import hook rebuilds its `openPicker` closure every render, which
  // would make `contextActionHandlers` (and the published TopBar node) a new
  // reference each render → the slot publisher re-fires → "Maximum update
  // depth exceeded". Route the picker call through a ref so the handler
  // identity stays stable, mirroring the pattern in ScreenplayEditor.tsx.
  const importPickerRef = useRef(importSubject.openPicker);
  importPickerRef.current = importSubject.openPicker;
  const openImportPicker = useCallback(() => importPickerRef.current(), []);

  // TopBar context actions come from the shared registry (Spec 55). The page
  // wires runtime handlers per `ContextActionId`; the registry owns order +
  // feature gating (SIAE only in the IT market). The DOCX handler carries a
  // transient "Exporting…" label while the mutation runs.
  const exportDocxPending = exportDocx.isPending;
  const contextActionHandlers = useMemo<ContextActionHandlers>(
    () => ({
      [ContextActionIds.EXPORT_DOCX]: {
        onSelect: () => {
          if (isVersionsOpen) versionsClose();
          setIsExportOpen(true);
        },
        disabled: exportDocxPending,
        labelOverride: exportDocxPending
          ? t("documents.editor.exportingDocx")
          : undefined,
      },
      [ContextActionIds.EXPORT_SIAE]: {
        onSelect: () => {
          if (isVersionsOpen) versionsClose();
          setIsSiaeOpen(true);
        },
        testId: "action-export-siae",
      },
      [ContextActionIds.IMPORT_DOCUMENT]: {
        onSelect: openImportPicker,
        disabled: !canEdit,
        testId: "action-import-document",
      },
      [ContextActionIds.VERSIONS]: { onSelect: toggleVersions },
    }),
    [
      exportDocxPending,
      isVersionsOpen,
      versionsClose,
      toggleVersions,
      openImportPicker,
      canEdit,
      t,
    ],
  );
  const contextActionItems = useContextActions(
    "soggetto",
    contextActionHandlers,
  );

  // Memoise the TopBar actions node: `useTopBarSlotPublisher` re-publishes on
  // every new `value` reference, so an inline node here would loop the slot
  // setState ("Maximum update depth"). `contextActionItems` is already memoised.
  const topBarActions = useMemo(
    () => (
      <ActionsMenu
        data-testid="soggetto-actions-menu"
        items={contextActionItems}
      />
    ),
    [contextActionItems],
  );

  return (
    <div className={styles.page} data-testid="soggetto-page">
      <ExportSiaeModal
        isOpen={isSiaeOpen}
        onClose={() => setIsSiaeOpen(false)}
        projectId={projectId}
        defaults={siaeDefaults}
      />
      {isExportOpen && (
        <ExportPdfModal
          canIncludeTitlePage={false}
          isPending={exportDocx.isPending}
          availableFormats={["docx"]}
          onClose={() => setIsExportOpen(false)}
          onGenerate={handleExport}
        />
      )}

      <input
        {...importSubject.fileInputProps}
        className={styles.hiddenInput}
        data-testid="subject-import-input"
      />
      <ConfirmDialog
        isOpen={importSubject.status.type === "confirm"}
        title={t("documents.import.confirmTitle")}
        message={t("documents.import.confirmBody")}
        confirmLabel={t("documents.import.confirmAction")}
        destructive
        onConfirm={importSubject.confirm}
        onCancel={importSubject.cancel}
        testId="subject-import-confirm"
      />
      {importSubject.status.type === "error" && (
        <div
          className={styles.importError}
          role="alert"
          data-testid="subject-import-error"
        >
          {importSubject.status.message}
          <button
            type="button"
            className={styles.importErrorDismiss}
            onClick={importSubject.cancel}
            aria-label={t("documents.import.dismissError")}
          >
            ✕
          </button>
        </div>
      )}

      <NarrativeDocsShell
        projectId={projectId}
        docType={DocumentTypes.SOGGETTO}
        layout="two"
        logline={loglineContent}
        canEditLogline={canEdit}
        onLoglineChange={setLoglineContent}
        onLoglineSave={loglineSave.flush}
        loglineIsDirty={loglineSave.isDirty}
        loglineIsSaving={loglineSave.isSaving}
        onOpenVersions={toggleVersions}
        topBarActions={topBarActions}
        rightAside={
          isAiEnabled ? (
            <MarginNotesColumn
              projectId={projectId}
              docType={DocumentTypes.SOGGETTO}
              content={soggettoContent}
              savedContent={soggettoSave.savedContent}
              isWaitingForSave={soggettoSave.isDirty}
            />
          ) : undefined
        }
      >
        <div className={styles.pageShell}>
          {isAiEnabled && (
            <CesareUpdatedBanner documentType={DocumentTypes.SOGGETTO} />
          )}
          <FreeNarrativeEditor
            content={soggettoContent}
            onChange={setSoggettoContent}
            canEdit={canEdit}
            embedded
            testId="subject-editor"
            documentId={soggettoDoc.id}
            documentType={DocumentTypes.SOGGETTO}
            currentUser={currentUser}
          />
        </div>
      </NarrativeDocsShell>
    </div>
  );
}
