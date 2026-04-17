import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  TitlePageForm,
  useTitlePage,
  useUpdateTitlePage,
} from "~/features/projects";
import type { TitlePage } from "~/features/projects";
import styles from "./_app.projects.$id_.title-page.module.css";

export const Route = createFileRoute("/_app/projects/$id_/title-page")({
  component: TitlePageRoute,
});

function TitlePageRoute() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { data: result, isLoading } = useTitlePage(id);
  const update = useUpdateTitlePage();

  if (isLoading) return <div className={styles.status}>Loading…</div>;
  if (!result) return null;
  if (!result.isOk) {
    const message =
      result.error._tag === "ProjectNotFoundError"
        ? "Project not found."
        : "Could not load the title page. Please retry.";
    return <div className={styles.statusError}>{message}</div>;
  }

  const { projectTitle, titlePage, canEdit } = result.value;

  const handleSubmit = (values: TitlePage) => {
    update.mutate({ projectId: id, titlePage: values });
  };

  return (
    <div className={styles.page}>
      <div className={styles.breadcrumb}>
        <Link to="/projects/$id" params={{ id }} className={styles.back}>
          ← {projectTitle}
        </Link>
        <button
          type="button"
          className={styles.back}
          onClick={() => navigate({ to: "/projects/$id", params: { id } })}
        >
          Close
        </button>
      </div>
      <h1 className={styles.title}>Title Page</h1>
      <p className={styles.subtitle}>
        The frontespizio shown as page one in every PDF export.
      </p>

      <TitlePageForm
        projectTitle={projectTitle}
        initialValues={titlePage}
        canEdit={canEdit}
        isSubmitting={update.isPending}
        onSubmit={handleSubmit}
      />

      {update.error && (
        <p className={styles.formError}>{update.error.message}</p>
      )}
    </div>
  );
}
