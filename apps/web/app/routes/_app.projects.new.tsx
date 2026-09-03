import type { ComponentProps } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { titleHead } from "~/lib/document-title";
import { ProjectForm, useCreateProject } from "~/features/projects";
import styles from "./_app.projects.new.module.css";

// `?teamId=` arrives from a team's "New project" button (TeamDashboardPage) —
// see issue #140. Optional so the plain personal-project flow (no query
// param) is unaffected.
const searchSchema = z.object({
  teamId: z.string().uuid().optional(),
});

export const Route = createFileRoute("/_app/projects/new")({
  head: () => titleHead("Nuovo progetto"),
  validateSearch: searchSchema,
  component: NewProjectPage,
});

function NewProjectPage() {
  const navigate = useNavigate();
  const createProject = useCreateProject();
  const { teamId } = Route.useSearch();

  const handleSubmit: ComponentProps<typeof ProjectForm>["onSubmit"] = (
    values,
  ) => {
    createProject.mutate(
      {
        title: values.title,
        format: values.format,
        genre: values.genre,
        teamId,
      },
      {
        onSuccess: (project) => {
          navigate({ to: "/projects/$id", params: { id: project.id } });
        },
      },
    );
  };

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Nuovo progetto</h1>
      <div className={styles.formWrapper}>
        <ProjectForm
          onSubmit={handleSubmit}
          onCancel={() => navigate({ to: "/dashboard" })}
          isSubmitting={createProject.isPending}
          submitLabel="Crea progetto"
        />
        {createProject.error && (
          <p className={styles.error}>{createProject.error.message}</p>
        )}
      </div>
    </div>
  );
}
