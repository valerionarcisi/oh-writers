// IT is the default runtime language (Spec 04f). Hook up the shared i18n
// layer later to surface English copy for non-IT users.
import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { match } from "ts-pattern";
import { DocumentTypes } from "@oh-writers/domain";
import { ActionsMenu, Skeleton } from "@oh-writers/ui";
import {
  DraftBanner,
  ExportPdfModal,
  ExportSiaeModal,
  FreeNarrativeEditor,
  MarginNotesColumn,
  NarrativeDocsShell,
  useAutoSave,
  useDocument,
  useExportSubjectDocx,
  useSaveDocument,
  useSiaeMetadata,
  emptyNarrativeDocument,
} from "~/features/documents";
import { toErrorView } from "~/components/ResultErrorView";
import { useProject } from "~/features/projects";
import {
  useCesareOpen,
  useSetActiveDocument,
  useRoutedSurface,
} from "~/features/app-shell";
import { useSession } from "~/lib/auth-client";
import { titleHead } from "~/lib/document-title";
import type { DocumentViewWithPermission } from "~/features/documents";
import styles from "./_app.projects.$id_.soggetto.module.css";

export const Route = createFileRoute("/_app/projects/$id_/soggetto")({
  head: () => titleHead("Soggetto"),
  component: SoggettoPage,
});

function SoggettoPage() {
  const { id } = Route.useParams();
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
    />
  );
}

interface SoggettoPageReadyProps {
  readonly projectId: string;
  readonly soggettoDoc: DocumentViewWithPermission;
  readonly loglineDoc: DocumentViewWithPermission;
}

function SoggettoPageReady({
  projectId,
  soggettoDoc,
  loglineDoc,
}: SoggettoPageReadyProps) {
  const [soggettoContent, setSoggettoContent] = useState(soggettoDoc.content);
  // Spec 44 TKT-LEAD-01: Cesare opens via shell BottomDock.
  const _openCesare = useCesareOpen();
  void _openCesare;
  const setActiveDocument = useSetActiveDocument();
  const [loglineContent, setLoglineContent] = useState(loglineDoc.content);

  // When the server-side current version changes (e.g. user activates a
  // Cesare draft from the drawer, or promotes a version), the route query
  // refetches and `soggettoDoc.content` is now the new active text — but the
  // local `useState` initial value is frozen at mount. Re-sync the editor
  // state whenever the active version id changes. We don't sync on every
  // content change to avoid stomping over the user's in-flight edits.
  useEffect(() => {
    setSoggettoContent(soggettoDoc.content);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soggettoDoc.currentVersionId]);
  useEffect(() => {
    setLoglineContent(loglineDoc.content);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loglineDoc.currentVersionId]);

  // Publish the soggetto as the active document so Cesare's tool router can
  // operate on its content when this page is open.
  useEffect(() => {
    setActiveDocument({ id: soggettoDoc.id, type: DocumentTypes.SOGGETTO });
    return () => setActiveDocument(null);
  }, [soggettoDoc.id, setActiveDocument]);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isSiaeOpen, setIsSiaeOpen] = useState(false);
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

  const saveSoggetto = useSaveDocument();
  const saveLogline = useSaveDocument();
  const exportDocx = useExportSubjectDocx();
  // Spec 49 W2: Versions open via the ROUTER (`?versions=<docId>`), not the
  // legacy context drawer. The host page compresses beside the routed
  // SplitDrawer. `vcur` carries the current-version baseline for the
  // "vs current" diff so the surface stays deep-linkable.
  const versionsSurface = useRoutedSurface({
    param: "versions",
    companions: ["vstate", "vcur"],
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

  useAutoSave(
    saveSoggetto,
    soggettoDoc.id,
    soggettoContent,
    soggettoDoc.content,
  );
  useAutoSave(saveLogline, loglineDoc.id, loglineContent, loglineDoc.content);

  const canEdit = soggettoDoc.canEdit && loglineDoc.canEdit;

  const handleExport = (opts: { format: "pdf" | "docx" }) => {
    if (opts.format !== "docx") return;
    exportDocx.mutate(
      { projectId },
      { onSuccess: () => setIsExportOpen(false) },
    );
  };

  // Memoise the TopBar actions node: `useTopBarSlotPublisher` re-publishes on
  // every new `value` reference, so an inline node here would loop the slot
  // setState ("Maximum update depth"). All deps are stable (router-surface
  // callbacks are useCallback'd; setters are stable).
  const exportDocxPending = exportDocx.isPending;
  const topBarActions = useMemo(
    () => (
      <ActionsMenu
        data-testid="soggetto-actions-menu"
        items={[
          {
            label: exportDocxPending ? "Esportazione…" : "Esporta DOCX",
            onClick: () => {
              if (isVersionsOpen) versionsClose();
              setIsExportOpen(true);
            },
            disabled: exportDocxPending,
          },
          {
            label: "Esporta SIAE",
            onClick: () => {
              if (isVersionsOpen) versionsClose();
              setIsSiaeOpen(true);
            },
          },
          { label: "Versioni", onClick: toggleVersions },
        ]}
      />
    ),
    [exportDocxPending, isVersionsOpen, versionsClose, toggleVersions],
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

      <NarrativeDocsShell
        projectId={projectId}
        docType={DocumentTypes.SOGGETTO}
        layout="two"
        logline={loglineContent}
        canEditLogline={canEdit}
        onLoglineChange={setLoglineContent}
        onOpenVersions={toggleVersions}
        topBarActions={topBarActions}
        rightAside={
          <MarginNotesColumn
            projectId={projectId}
            docType={DocumentTypes.SOGGETTO}
            content={soggettoContent}
          />
        }
      >
        <div className={styles.pageShell}>
          <DraftBanner
            documentId={soggettoDoc.id}
            projectId={projectId}
            docType={DocumentTypes.SOGGETTO}
            currentContent={soggettoContent}
            canEdit={canEdit}
          />
          <FreeNarrativeEditor
            content={soggettoContent}
            onChange={setSoggettoContent}
            canEdit={canEdit}
            embedded
            testId="subject-editor"
            diffDocumentType={DocumentTypes.SOGGETTO}
          />
        </div>
      </NarrativeDocsShell>
    </div>
  );
}
