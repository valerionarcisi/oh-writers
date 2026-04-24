// TODO: i18n — user-facing copy is English until the shared i18n layer lands.
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { match } from "ts-pattern";
import { DocumentTypes } from "@oh-writers/domain";
import {
  ExportPdfModal,
  ExportSiaeModal,
  LoglineBlock,
  SubjectEditor,
  useAutoSave,
  useDocument,
  useExportSubjectDocx,
  useSaveDocument,
} from "~/features/documents";
import { useProject } from "~/features/projects";
import type { DocumentViewWithPermission } from "~/features/documents/server/documents.server";
import styles from "./_app.projects.$id_.editor.module.css";

export const Route = createFileRoute("/_app/projects/$id_/soggetto")({
  component: SoggettoPage,
});

function SoggettoPage() {
  const { id } = Route.useParams();
  const soggetto = useDocument(id, DocumentTypes.SOGGETTO);
  const logline = useDocument(id, DocumentTypes.LOGLINE);

  if (soggetto.isLoading || logline.isLoading) {
    return <div className={styles.status}>Loading…</div>;
  }
  if (!soggetto.data || !logline.data) return null;

  const soggettoView = match(soggetto.data)
    .with({ isOk: true }, ({ value }) => ({ ok: true as const, value }))
    .with({ isOk: false }, ({ error }) =>
      match(error)
        .with({ _tag: "DocumentNotFoundError" }, () => ({
          ok: false as const,
          message: "Soggetto document not found.",
        }))
        .with({ _tag: "DbError" }, () => ({
          ok: false as const,
          message: "Could not load soggetto. Please retry.",
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
          message: "Logline document not found.",
        }))
        .with({ _tag: "DbError" }, () => ({
          ok: false as const,
          message: "Could not load logline. Please retry.",
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
  const siaeDefaults = {
    title: projectOk?.title ?? "",
    declaredGenre: projectOk?.genre ?? "",
    ownerFullName: null as string | null,
  };

  const saveSoggetto = useSaveDocument();
  const saveLogline = useSaveDocument();
  const exportDocx = useExportSubjectDocx();

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
    <main data-testid="soggetto-page">
      <div className={styles.toolbar} data-testid="soggetto-toolbar">
        <button
          type="button"
          className={styles.saveBtn}
          onClick={() => setIsExportOpen(true)}
          disabled={exportDocx.isPending}
          data-testid="soggetto-export"
        >
          {exportDocx.isPending ? "Exporting…" : "Export"}
        </button>
        <button
          type="button"
          className={styles.saveBtn}
          onClick={() => setIsSiaeOpen(true)}
          data-testid="soggetto-export-siae"
        >
          Export SIAE
        </button>
      </div>
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
      <LoglineBlock
        projectId={projectId}
        logline={loglineContent === "" ? null : loglineContent}
        canEdit={canEdit}
        onChange={setLoglineContent}
        testId="logline-block"
      />
      <SubjectEditor
        projectId={projectId}
        content={soggettoContent}
        onChange={setSoggettoContent}
        canEdit={canEdit}
        testId="subject-editor"
      />
    </main>
  );
}
