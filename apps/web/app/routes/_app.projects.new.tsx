import type { ComponentProps } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ProjectForm, useCreateProject } from "~/features/projects";
import styles from "./_app.projects.new.module.css";

export const Route = createFileRoute("/_app/projects/new")({
  component: NewProjectPage,
});

function NewProjectPage() {
  const navigate = useNavigate();
  const createProject = useCreateProject();

  const handleSubmit: ComponentProps<typeof ProjectForm>["onSubmit"] = (
    values,
  ) => {
    createProject.mutate(
      { title: values.title, format: values.format, genre: values.genre },
      {
        onSuccess: (project) => {
          navigate({ to: "/projects/$id", params: { id: project.id } });
        },
      },
    );
  };

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>New Project</h1>
      <div className={styles.formWrapper}>
        <ProjectForm
          onSubmit={handleSubmit}
          onCancel={() => navigate({ to: "/dashboard" })}
          isSubmitting={createProject.isPending}
          submitLabel="Create project"
        />
        {createProject.error && (
          <p className={styles.error}>{createProject.error.message}</p>
        )}
      </div>
    </div>
  );
}
