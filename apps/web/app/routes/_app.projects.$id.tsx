import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { match } from "ts-pattern";
import { Badge, Button, useConfirmDialog } from "@oh-writers/ui";
import {
  DOCUMENT_PIPELINE,
  DocumentTypes,
  type DocumentType,
} from "@oh-writers/domain";
import {
  useProject,
  useArchiveProject,
  useRestoreProject,
  useDeleteProject,
  DocumentCard,
  ProductionCard,
  ProgressBar,
} from "~/features/projects";
import { ResultErrorView } from "~/components/ResultErrorView";
import styles from "./_app.projects.$id.module.css";

const pipelineIndex = (type: string): number => {
  const idx = DOCUMENT_PIPELINE.indexOf(
    type as (typeof DOCUMENT_PIPELINE)[number],
  );
  return idx === -1 ? DOCUMENT_PIPELINE.length : idx;
};

const FORMAT_LABELS: Record<string, string> = {
  feature: "lungometraggio",
  short: "cortometraggio",
  series_episode: "episodio serie",
  pilot: "pilota",
};

const GENRE_LABELS: Record<string, string> = {
  drama: "dramma",
  comedy: "commedia",
  thriller: "thriller",
  horror: "horror",
  action: "azione",
  "sci-fi": "sci-fi",
  documentary: "documentario",
  other: "altro",
};

export const Route = createFileRoute("/_app/projects/$id")({
  component: ProjectPage,
});

function ProjectPage() {
  const { id } = Route.useParams();
  const { data: result, isLoading } = useProject(id);

  if (isLoading) return <div className={styles.status}>Caricamento…</div>;
  if (!result) return null;

  return match(result)
    .with({ isOk: true }, ({ value }) => (
      <ProjectPageContent id={id} project={value} />
    ))
    .with({ isOk: false }, ({ error }) => <ResultErrorView error={error} />)
    .exhaustive();
}

type ProjectQueryData = NonNullable<ReturnType<typeof useProject>["data"]>;
type ProjectValue = Extract<ProjectQueryData, { isOk: true }>["value"];

interface ProjectPageContentProps {
  id: string;
  project: ProjectValue;
}

function ProjectPageContent({
  id,
  project: projectData,
}: ProjectPageContentProps) {
  const navigate = useNavigate();
  const archiveProject = useArchiveProject();
  const restoreProject = useRestoreProject();
  const deleteProject = useDeleteProject();
  const { confirm } = useConfirmDialog();

  const { documents: rawDocuments, screenplay, ...project } = projectData;
  const documents = [...rawDocuments]
    .filter((d) => d.type !== DocumentTypes.LOGLINE)
    .sort((a, b) => pipelineIndex(a.type) - pipelineIndex(b.type));
  const completedDocs = documents.filter(
    (d: { content: string }) => d.content.length > 0,
  ).length;

  const handleArchive = () => {
    archiveProject.mutate({ projectId: id });
  };

  const handleRestore = () => {
    restoreProject.mutate({ projectId: id });
  };

  const handleDelete = () => {
    void confirm({
      title: "Eliminare il progetto?",
      message: "Eliminare questo progetto? L'operazione non può essere annullata.",
      confirmLabel: "Elimina",
      destructive: true,
    }).then((ok) => {
      if (!ok) return;
      deleteProject.mutate(
        { projectId: id },
        { onSuccess: () => navigate({ to: "/dashboard" }) },
      );
    });
  };

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h1 className={styles.title}>{project.title}</h1>
          <div className={styles.meta}>
            <Badge variant="default">
              {FORMAT_LABELS[project.format] ?? project.format.replace("_", " ")}
            </Badge>
            {project.genre && (
              <Badge variant="default">
                {GENRE_LABELS[project.genre] ?? project.genre}
              </Badge>
            )}
            {project.teamId ? (
              <Badge variant="accent">Team</Badge>
            ) : (
              <Badge variant="outline">Personale</Badge>
            )}
            {project.isArchived && <Badge variant="outline">Archiviato</Badge>}
          </div>
        </div>
        <div className={styles.headerActions}>
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              navigate({ to: "/projects/$id/title-page", params: { id } })
            }
            data-testid="nav-title-page"
          >
            Frontespizio
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              navigate({ to: "/projects/$id/settings", params: { id } })
            }
          >
            Impostazioni
          </Button>
          {project.isArchived ? (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleRestore}
                disabled={restoreProject.isPending}
              >
                Ripristina
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={handleDelete}
                disabled={deleteProject.isPending}
              >
                Elimina
              </Button>
            </>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleArchive}
              disabled={archiveProject.isPending}
            >
              Archivia
            </Button>
          )}
        </div>
      </div>

      {/* Progress */}
      <div className={styles.section}>
        <ProgressBar
          value={completedDocs}
          max={DOCUMENT_PIPELINE.length}
          label="Sviluppo narrativo"
        />
      </div>

      {/* Narrative Development */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Sviluppo narrativo</h2>
        <div className={styles.documentGrid}>
          {documents.map((doc) => (
            <DocumentCard
              key={doc.id}
              document={doc}
              onClick={() => {
                void navigate({ to: `/projects/${id}/${doc.type}` as never });
              }}
            />
          ))}
        </div>
      </div>

      {/* Screenplay */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Sceneggiatura</h2>
        <div className={styles.screenplayCard}>
          <div className={styles.screenplayMeta}>
            {screenplay ? (
              <>
                <span className={styles.pageCount}>
                  {screenplay.pageCount} pagine
                </span>
                <span className={styles.screenplayDate}>
                  Aggiornata{" "}
                  {new Intl.DateTimeFormat("it-IT", {
                    month: "short",
                    day: "numeric",
                  }).format(new Date(screenplay.updatedAt))}
                </span>
              </>
            ) : (
              <span className={styles.pageCount}>Nessuna sceneggiatura</span>
            )}
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              void navigate({ to: "/projects/$id/screenplay", params: { id } })
            }
          >
            Apri Editor
          </Button>
        </div>
      </div>

      {/* Production */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Produzione</h2>
        <div className={styles.productionGrid}>
          <ProductionCard
            eyebrow="Breakdown"
            title="Spoglio scene"
            subtitle="9 scene · 47 elementi"
            onClick={() =>
              void navigate({
                to: "/projects/$id/breakdown",
                params: { id },
              })
            }
          />
          <ProductionCard
            eyebrow="Budget"
            title="Preventivo"
            subtitle="842.180 € · 7 reparti"
            onClick={() =>
              void navigate({
                to: "/projects/$id/budget",
                params: { id },
              })
            }
          />
          <ProductionCard
            eyebrow="Piano di ripresa"
            title="Schedule"
            subtitle="5 giornate · 22 inquadrature"
            onClick={() =>
              void navigate({
                to: "/projects/$id/schedule",
                params: { id },
              })
            }
          />
        </div>
      </div>

      {/* Team — placeholder for Spec 09 presence */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Team</h2>
        <p className={styles.teamPlaceholder}>
          Presenza in tempo reale in arrivo in un prossimo aggiornamento.
        </p>
      </div>
    </div>
  );
}
