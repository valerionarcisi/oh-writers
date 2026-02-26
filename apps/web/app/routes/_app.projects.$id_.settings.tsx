import type { ComponentProps } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@oh-writers/ui";
import {
  useProject,
  useUpdateProject,
  useArchiveProject,
  useRestoreProject,
  useDeleteProject,
  ProjectForm,
} from "~/features/projects";
import styles from "./_app.projects.$id_.settings.module.css";

export const Route = createFileRoute("/_app/projects/$id_/settings")({
  component: ProjectSettingsPage,
});

function ProjectSettingsPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { data: result, isLoading } = useProject(id);
  const updateProject = useUpdateProject();
  const archiveProject = useArchiveProject();
  const restoreProject = useRestoreProject();
  const deleteProject = useDeleteProject();

  if (isLoading) return <div className={styles.status}>Loading…</div>;
  if (!result) return null;
  if (!result.isOk)
    return <div className={styles.statusError}>Project not found.</div>;

  const { documents: _docs, screenplay: _sp, ...project } = result.value;

  const canEdit = !project.isArchived;

  const handleUpdate: ComponentProps<typeof ProjectForm>["onSubmit"] = (
    values,
  ) => {
    updateProject.mutate(
      {
        projectId: id,
        data: {
          title: values.title,
          format: values.format,
          genre: values.genre ?? null,
        },
      },
      { onSuccess: () => navigate({ to: "/projects/$id", params: { id } }) },
    );
  };

  const handleArchive = () => {
    archiveProject.mutate({ projectId: id });
  };

  const handleRestore = () => {
    restoreProject.mutate({ projectId: id });
  };

  const handleDelete = () => {
    if (
      !window.confirm("Delete this project permanently? This cannot be undone.")
    )
      return;
    deleteProject.mutate(
      { projectId: id },
      { onSuccess: () => navigate({ to: "/dashboard" }) },
    );
  };

  return (
    <div className={styles.page}>
      <div className={styles.breadcrumb}>
        <Link to="/projects/$id" params={{ id }} className={styles.back}>
          ← {project.title}
        </Link>
      </div>
      <h1 className={styles.title}>Settings</h1>

      {canEdit ? (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Project details</h2>
          <ProjectForm
            initialValues={{
              title: project.title,
              format: project.format,
              genre: project.genre ?? undefined,
            }}
            onSubmit={handleUpdate}
            onCancel={() => navigate({ to: "/projects/$id", params: { id } })}
            isSubmitting={updateProject.isPending}
            submitLabel="Save changes"
          />
          {updateProject.error && (
            <p className={styles.formError}>{updateProject.error.message}</p>
          )}
        </section>
      ) : (
        <p className={styles.readOnly}>
          You don't have edit access to this project.
        </p>
      )}

      <section className={styles.dangerZone}>
        <h2 className={styles.dangerTitle}>Danger zone</h2>
        <div className={styles.dangerActions}>
          {project.isArchived ? (
            <>
              <div className={styles.dangerRow}>
                <div>
                  <strong>Restore project</strong>
                  <p className={styles.dangerDesc}>
                    Make this project active again.
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleRestore}
                  disabled={restoreProject.isPending}
                >
                  Restore
                </Button>
              </div>
              <div className={styles.dangerRow}>
                <div>
                  <strong>Delete project</strong>
                  <p className={styles.dangerDesc}>
                    Permanently delete this project and all its content.
                  </p>
                </div>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={handleDelete}
                  disabled={deleteProject.isPending}
                >
                  Delete
                </Button>
              </div>
            </>
          ) : (
            <div className={styles.dangerRow}>
              <div>
                <strong>Archive project</strong>
                <p className={styles.dangerDesc}>
                  Make this project read-only. You can restore or delete it
                  later.
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleArchive}
                disabled={archiveProject.isPending}
              >
                Archive
              </Button>
            </div>
          )}
        </div>
        {(archiveProject.error || deleteProject.error) && (
          <p className={styles.formError}>
            {archiveProject.error?.message ?? deleteProject.error?.message}
          </p>
        )}
      </section>
    </div>
  );
}
