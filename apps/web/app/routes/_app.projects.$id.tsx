import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Badge, Button } from "@oh-writers/ui";
import {
  useProject,
  useArchiveProject,
  useRestoreProject,
  useDeleteProject,
  DocumentCard,
  ProgressBar,
} from "~/features/projects";
import styles from "./_app.projects.$id.module.css";

export const Route = createFileRoute("/_app/projects/$id")({
  component: ProjectPage,
});

function ProjectPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { data: result, isLoading } = useProject(id);
  const archiveProject = useArchiveProject();
  const restoreProject = useRestoreProject();
  const deleteProject = useDeleteProject();

  if (isLoading) return <div className={styles.status}>Loading…</div>;
  if (!result) return null;
  if (!result.isOk)
    return <div className={styles.statusError}>Project not found.</div>;

  const { documents, screenplay, ...project } = result.value;
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
    if (!window.confirm("Delete this project? This cannot be undone.")) return;
    deleteProject.mutate(
      { projectId: id },
      { onSuccess: () => navigate({ to: "/dashboard" }) },
    );
  };

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h1 className={styles.title}>{project.title}</h1>
          <div className={styles.meta}>
            <Badge variant="default">{project.format.replace("_", " ")}</Badge>
            {project.genre && <Badge variant="default">{project.genre}</Badge>}
            {project.teamId ? (
              <Badge variant="accent">Team</Badge>
            ) : (
              <Badge variant="outline">Personal</Badge>
            )}
            {project.isArchived && <Badge variant="outline">Archived</Badge>}
          </div>
        </div>
        <div className={styles.headerActions}>
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              navigate({ to: "/projects/$id/settings", params: { id } })
            }
          >
            Settings
          </Button>
          {project.isArchived ? (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleRestore}
                disabled={restoreProject.isPending}
              >
                Restore
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={handleDelete}
                disabled={deleteProject.isPending}
              >
                Delete
              </Button>
            </>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleArchive}
              disabled={archiveProject.isPending}
            >
              Archive
            </Button>
          )}
        </div>
      </div>

      {/* Progress */}
      <div className={styles.section}>
        <ProgressBar
          value={completedDocs}
          max={4}
          label="Narrative development"
        />
      </div>

      {/* Narrative Development */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Narrative Development</h2>
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
        <h2 className={styles.sectionTitle}>Screenplay</h2>
        <div className={styles.screenplayCard}>
          <div className={styles.screenplayMeta}>
            {screenplay ? (
              <>
                <span className={styles.pageCount}>
                  {screenplay.pageCount} pages
                </span>
                <span className={styles.screenplayDate}>
                  Updated{" "}
                  {new Intl.DateTimeFormat("en-US", {
                    month: "short",
                    day: "numeric",
                  }).format(new Date(screenplay.updatedAt))}
                </span>
              </>
            ) : (
              <span className={styles.pageCount}>No screenplay yet</span>
            )}
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              void navigate({ to: "/projects/$id/screenplay", params: { id } })
            }
          >
            Open Editor
          </Button>
        </div>
      </div>

      {/* Team — placeholder for Spec 09 presence */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Team</h2>
        <p className={styles.teamPlaceholder}>
          Real-time presence coming in a future update.
        </p>
      </div>
    </div>
  );
}
