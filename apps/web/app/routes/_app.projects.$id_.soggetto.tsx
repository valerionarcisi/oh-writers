// IT is the default runtime language (Spec 04f). Hook up the shared i18n
// layer later to surface English copy for non-IT users.
import { useEffect, useState } from "react";
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
} from "~/features/documents";
import { useProject } from "~/features/projects";
import { useVersionsDrawer } from "~/features/versions";
import { useCesareOpen, useSetActiveDocument } from "~/features/app-shell";
import { useSession } from "~/lib/auth-client";
import type { DocumentViewWithPermission } from "~/features/documents";
import styles from "./_app.projects.$id_.soggetto.module.css";

export const Route = createFileRoute("/_app/projects/$id_/soggetto")({
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

  const soggettoView = match(soggetto.data)
    .with({ isOk: true }, ({ value }) => ({ ok: true as const, value }))
    .with({ isOk: false }, ({ error }) =>
      match(error)
        .with({ _tag: "DocumentNotFoundError" }, () => ({
          ok: false as const,
          message: "Documento soggetto non trovato.",
        }))
        .with({ _tag: "DbError" }, () => ({
          ok: false as const,
          message: "Impossibile caricare il soggetto. Riprova.",
        }))
        .exhaustive(),
    )
    .exhaustive();

  const loglineView = match(logline.data)
    .with({ isOk: true }, ({ value }) => ({ ok: true as const, value }))
    .with({ isOk: false }, ({ error }) =>
      match(error)
        .with({ _tag: "DocumentNotFoundError" }, () => ({
          ok: false as const,
          message: "Documento logline non trovato.",
        }))
        .with({ _tag: "DbError" }, () => ({
          ok: false as const,
          message: "Impossibile caricare la logline. Riprova.",
        }))
        .exhaustive(),
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
  const {
    state: drawerState,
    open: openDrawer,
    close: closeDrawer,
  } = useVersionsDrawer();
  const isVersionsOpen =
    drawerState.isOpen &&
    drawerState.scope?.kind === "document" &&
    drawerState.scope.documentId === soggettoDoc.id;
  const toggleVersions = () => {
    if (isVersionsOpen) closeDrawer();
    else
      openDrawer({
        kind: "document",
        documentId: soggettoDoc.id,
        docType: DocumentTypes.SOGGETTO,
        canEdit: soggettoDoc.canEdit,
        currentVersionId: soggettoDoc.currentVersionId ?? null,
      });
  };

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
        topBarActions={
          <ActionsMenu
            data-testid="soggetto-actions-menu"
            items={[
              {
                label: exportDocx.isPending ? "Esportazione…" : "Esporta DOCX",
                onClick: () => {
                  if (isVersionsOpen) closeDrawer();
                  setIsExportOpen(true);
                },
                disabled: exportDocx.isPending,
              },
              {
                label: "Esporta SIAE",
                onClick: () => {
                  if (isVersionsOpen) closeDrawer();
                  setIsSiaeOpen(true);
                },
              },
              { label: "Versioni", onClick: toggleVersions },
            ]}
          />
        }
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
          />
        </div>
      </NarrativeDocsShell>
    </div>
  );
}
