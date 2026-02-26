import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createProject,
  updateProject,
  archiveProject,
  restoreProject,
  deleteProject,
  personalProjectsQueryOptions,
  teamProjectsQueryOptions,
  projectQueryOptions,
} from "../server/projects.server";
import type { CreateProjectData, UpdateProjectData } from "../projects.schema";

export {
  personalProjectsQueryOptions,
  teamProjectsQueryOptions,
  projectQueryOptions,
};

// ─── Queries ──────────────────────────────────────────────────────────────────

export const usePersonalProjects = () =>
  useQuery(personalProjectsQueryOptions());

export const useTeamProjects = (teamId: string) =>
  useQuery(teamProjectsQueryOptions(teamId));

export const useProject = (projectId: string) =>
  useQuery(projectQueryOptions(projectId));

// ─── Mutations ────────────────────────────────────────────────────────────────
// Each mutation unwraps the server ResultShape: isOk → return value, else → throw.
// The thrown object is a plain domain-error DTO (has message + _tag + domain fields).
// TanStack Query's mutation.error then holds it; components access .message normally.

const throwOnErr = <T>(result: {
  isOk: boolean;
  value?: T;
  error?: { message: string };
}): T => {
  if (!result.isOk) {
    const domainError = result.error!;
    // Wrap as a proper Error so TanStack Query (and React ErrorBoundary) handle it correctly
    throw Object.assign(new Error(domainError.message), domainError);
  }
  return result.value as T;
};

export const useCreateProject = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateProjectData) =>
      throwOnErr(await createProject({ data: input })),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["projects", "personal"],
      });
    },
  });
};

export const useUpdateProject = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateProjectData) =>
      throwOnErr(await updateProject({ data: input })),
    onSuccess: (_, { projectId }) => {
      void queryClient.invalidateQueries({ queryKey: ["projects", projectId] });
      void queryClient.invalidateQueries({
        queryKey: ["projects", "personal"],
      });
    },
  });
};

export const useArchiveProject = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId }: { projectId: string }) =>
      throwOnErr(await archiveProject({ data: { projectId } })),
    onSuccess: (_, { projectId }) => {
      void queryClient.invalidateQueries({ queryKey: ["projects", projectId] });
      void queryClient.invalidateQueries({
        queryKey: ["projects", "personal"],
      });
    },
  });
};

export const useRestoreProject = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId }: { projectId: string }) =>
      throwOnErr(await restoreProject({ data: { projectId } })),
    onSuccess: (_, { projectId }) => {
      void queryClient.invalidateQueries({ queryKey: ["projects", projectId] });
      void queryClient.invalidateQueries({
        queryKey: ["projects", "personal"],
      });
    },
  });
};

export const useDeleteProject = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId }: { projectId: string }) => {
      throwOnErr(await deleteProject({ data: { projectId } }));
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["projects", "personal"],
      });
    },
  });
};
