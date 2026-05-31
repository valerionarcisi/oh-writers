// apps/web/app/features/predictions/sessions/useSessions.ts
// Spec 44 WP-B — TanStack Query bindings for the Cesare sessions server fns.
//
// Returns a plain-shape array (per `project_tanstack_branded_types`); callers
// re-brand fields if needed. Mutations invalidate the list query so the rail
// re-renders with the freshest order.
import {
  useMutation,
  useQuery,
  useQueryClient,
  queryOptions,
} from "@tanstack/react-query";
import { unwrapResult } from "@oh-writers/utils";
import {
  listSessions,
  getSession,
  createSession,
  renameSession,
  deleteSession,
} from "./sessions.server";
import type { CesareSession } from "./sessions.schema";

export const sessionsQueryKey = (projectId: string) =>
  ["cesare-sessions", projectId] as const;

export const sessionQueryKey = (projectId: string, sessionId: string) =>
  ["cesare-session", projectId, sessionId] as const;

export const sessionsQueryOptions = (projectId: string) =>
  queryOptions({
    queryKey: sessionsQueryKey(projectId),
    queryFn: async (): Promise<CesareSession[]> =>
      unwrapResult(await listSessions({ data: { projectId } })),
    staleTime: 30_000,
  });

// Single-session fetch for the central `/sessions/:sessionId` route. The server
// fn fails closed on a foreign / unknown id, so `unwrapResult` throws a
// not-found error here — the route renders its not-found body in that case.
export const sessionQueryOptions = (projectId: string, sessionId: string) =>
  queryOptions({
    queryKey: sessionQueryKey(projectId, sessionId),
    queryFn: async (): Promise<CesareSession> =>
      unwrapResult(await getSession({ data: { projectId, id: sessionId } })),
    staleTime: 30_000,
    retry: false,
  });

// ─── Queries ────────────────────────────────────────────────────────────────

export const useSessions = (projectId: string | null | undefined) =>
  useQuery({
    ...sessionsQueryOptions(projectId ?? ""),
    enabled: Boolean(projectId),
  });

export const useSession = (
  projectId: string | null | undefined,
  sessionId: string | null | undefined,
) =>
  useQuery({
    ...sessionQueryOptions(projectId ?? "", sessionId ?? ""),
    enabled: Boolean(projectId) && Boolean(sessionId),
  });

// ─── Mutations ──────────────────────────────────────────────────────────────

const invalidateSessions = (
  qc: ReturnType<typeof useQueryClient>,
  projectId: string,
) => {
  void qc.invalidateQueries({ queryKey: sessionsQueryKey(projectId) });
};

export const useCreateSession = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (title?: string): Promise<CesareSession> =>
      unwrapResult(
        await createSession({
          data: title ? { projectId, title } : { projectId },
        }),
      ),
    onSuccess: () => invalidateSessions(qc, projectId),
  });
};

export const useRenameSession = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      title: string;
    }): Promise<CesareSession> =>
      unwrapResult(await renameSession({ data: input })),
    onSuccess: () => invalidateSessions(qc, projectId),
  });
};

export const useDeleteSession = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<{ id: string }> =>
      unwrapResult(await deleteSession({ data: { id } })),
    onSuccess: () => invalidateSessions(qc, projectId),
  });
};
