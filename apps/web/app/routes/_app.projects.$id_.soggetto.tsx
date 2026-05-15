// IT is the default runtime language (Spec 04f). Hook up the shared i18n
// layer later to surface English copy for non-IT users.
import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { match } from "ts-pattern";
import { DocumentTypes } from "@oh-writers/domain";
import { DocStats, FloatingDock } from "@oh-writers/ui";
import { toCartelle } from "~/features/documents/lib/cartelle-counter";
import {
  ExportPdfModal,
  ExportSiaeModal,
  FreeNarrativeEditor,
  LoglineBlock,
  useAutoSave,
  useDocument,
  useExportSubjectDocx,
  useSaveDocument,
  useSiaeMetadata,
} from "~/features/documents";
import { useProject } from "~/features/projects";
import { useVersionsDrawer } from "~/features/versions";
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
    return <div className={styles.status}>Caricamento…</div>;
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
  const [loglineContent, setLoglineContent] = useState(loglineDoc.content);
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

  const soggettoStats = useMemo(() => {
    const plain = soggettoContent.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();
    const chars = plain.length;
    return [
      { kind: "cartelle" as const, value: toCartelle(chars) },
      { kind: "chars" as const, value: chars },
    ];
  }, [soggettoContent]);

  const handleExport = (opts: { format: "pdf" | "docx" }) => {
    if (opts.format !== "docx") return;
    exportDocx.mutate(
      { projectId },
      { onSuccess: () => setIsExportOpen(false) },
    );
  };

  return (
    <main className={styles.page} data-testid="soggetto-page">
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

      <div className={styles.editorMain}>
        <div className={styles.pageShell}>
          <LoglineBlock
            projectId={projectId}
            logline={loglineContent === "" ? null : loglineContent}
            canEdit={canEdit}
            onChange={setLoglineContent}
            testId="logline-block"
          />
          <hr className={styles.divider} />
          <p className={styles.sectionLabel}>Soggetto</p>
          <FreeNarrativeEditor
            content={soggettoContent}
            onChange={setSoggettoContent}
            canEdit={canEdit}
            embedded
            hideCounter
            testId="subject-editor"
          />
        </div>
        <div className={styles.statsBar}>
          <DocStats stats={soggettoStats} />
        </div>
      </div>

      <FloatingDock
        primaryAction={{
          label: exportDocx.isPending ? "Esportazione…" : "Esporta DOCX",
          hotkey: "⌘E",
          onClick: () => {
            if (isVersionsOpen) closeDrawer();
            setIsExportOpen(true);
          },
        }}
        secondaryActions={[
          { label: "Versioni", onClick: toggleVersions },
          {
            label: "Esporta SIAE",
            onClick: () => {
              if (isVersionsOpen) closeDrawer();
              setIsSiaeOpen(true);
            },
          },
        ]}
      />
    </main>
  );
}
