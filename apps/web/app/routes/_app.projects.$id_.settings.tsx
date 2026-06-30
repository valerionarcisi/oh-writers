import type { ComponentProps } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { assertValidProjectId } from "~/lib/project-route";
import { titleHead } from "~/lib/document-title";
import { match } from "ts-pattern";
import { Button, useConfirmDialog, Skeleton } from "@oh-writers/ui";
import { Locales, type Locale } from "@oh-writers/domain";
import {
  useProject,
  useUpdateProject,
  useSetProjectLocale,
  useArchiveProject,
  useRestoreProject,
  useDeleteProject,
  ProjectForm,
} from "~/features/projects";
import { ResultErrorView } from "~/components/ResultErrorView";
import styles from "./_app.projects.$id_.settings.module.css";

export const Route = createFileRoute("/_app/projects/$id_/settings")({
  beforeLoad: ({ params }) => assertValidProjectId(params),
  head: () => titleHead("Impostazioni progetto"),
  component: ProjectSettingsPage,
});

type ProjectQueryData = NonNullable<ReturnType<typeof useProject>["data"]>;
type ProjectValue = Extract<ProjectQueryData, { isOk: true }>["value"];

function ProjectSettingsPage() {
  const { id } = Route.useParams();
  const { data: result, isLoading } = useProject(id);

  if (isLoading)
    return (
      <div className={styles.status}>
        <Skeleton
          lines={5}
          widths={["50%", "100%", "100%", "70%", "30%"]}
          ariaLabel="Caricamento impostazioni progetto"
        />
      </div>
    );
  if (!result) return null;

  return match(result)
    .with({ isOk: true }, ({ value }) => (
      <ProjectSettingsContent id={id} project={value} />
    ))
    .with({ isOk: false }, ({ error }) => <ResultErrorView error={error} />)
    .exhaustive();
}

function ProjectSettingsContent({
  id,
  project: projectData,
}: {
  id: string;
  project: ProjectValue;
}) {
  const navigate = useNavigate();
  const updateProject = useUpdateProject();
  const setLocale = useSetProjectLocale(id);
  const archiveProject = useArchiveProject();
  const restoreProject = useRestoreProject();
  const deleteProject = useDeleteProject();
  const { confirm } = useConfirmDialog();

  const { documents: _docs, screenplay: _sp, ...project } = projectData;

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
    void confirm({
      title: "Eliminare il progetto?",
      message:
        "Eliminare definitivamente questo progetto? L'operazione non può essere annullata.",
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
      <div className={styles.breadcrumb}>
        <Link to="/projects/$id" params={{ id }} className={styles.back}>
          ← {project.title}
        </Link>
      </div>
      <h1 className={styles.title}>Impostazioni</h1>

      {canEdit ? (
        <>
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Dettagli progetto</h2>
            <ProjectForm
              initialValues={{
                title: project.title,
                format: project.format,
                genre: project.genre ?? undefined,
              }}
              onSubmit={handleUpdate}
              onCancel={() => navigate({ to: "/projects/$id", params: { id } })}
              isSubmitting={updateProject.isPending}
              submitLabel="Salva modifiche"
            />
            {updateProject.error && (
              <p className={styles.formError}>{updateProject.error.message}</p>
            )}
          </section>
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Lingua sceneggiatura</h2>
            <select
              className={styles.localeSelect}
              value={project.locale ?? Locales.IT}
              disabled={setLocale.isPending}
              onChange={(e) =>
                setLocale.mutate({ locale: e.target.value as Locale })
              }
              data-testid="locale-select"
            >
              <option value={Locales.IT}>Italiano</option>
              <option value={Locales.EN}>English</option>
            </select>
            {setLocale.error && (
              <p className={styles.formError}>{setLocale.error.message}</p>
            )}
          </section>
        </>
      ) : (
        <p className={styles.readOnly}>
          Non hai accesso in modifica a questo progetto.
        </p>
      )}

      <section className={styles.dangerZone}>
        <h2 className={styles.dangerTitle}>Zona pericolosa</h2>
        <div className={styles.dangerActions}>
          {project.isArchived ? (
            <>
              <div className={styles.dangerRow}>
                <div>
                  <strong>Ripristina progetto</strong>
                  <p className={styles.dangerDesc}>
                    Rendi questo progetto di nuovo attivo.
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleRestore}
                  disabled={restoreProject.isPending}
                >
                  Ripristina
                </Button>
              </div>
              <div className={styles.dangerRow}>
                <div>
                  <strong>Elimina progetto</strong>
                  <p className={styles.dangerDesc}>
                    Elimina definitivamente questo progetto e tutto il suo
                    contenuto.
                  </p>
                </div>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={handleDelete}
                  disabled={deleteProject.isPending}
                >
                  Elimina
                </Button>
              </div>
            </>
          ) : (
            <div className={styles.dangerRow}>
              <div>
                <strong>Archivia progetto</strong>
                <p className={styles.dangerDesc}>
                  Rendi questo progetto in sola lettura. Potrai ripristinarlo o
                  eliminarlo in seguito.
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleArchive}
                disabled={archiveProject.isPending}
              >
                Archivia
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
