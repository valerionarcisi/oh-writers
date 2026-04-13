import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { unwrapResult } from "@oh-writers/utils";
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

export const useCreateProject = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateProjectData) =>
      unwrapResult(await createProject({ data: input })),
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
      unwrapResult(await updateProject({ data: input })),
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
      unwrapResult(await archiveProject({ data: { projectId } })),
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
      unwrapResult(await restoreProject({ data: { projectId } })),
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
      unwrapResult(await deleteProject({ data: { projectId } }));
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["projects", "personal"],
      });
    },
  });
};
