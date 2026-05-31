// apps/web/app/features/predictions/messages/useMessages.ts
// Spec 51 (step 1) — TanStack Query bindings for persisted Cesare messages.
//
// Returns the plain wire shape (per the branded-type pitfall: re-brand in the
// caller if needed). The chat store consumes `messagesQueryOptions` to hydrate a
// session's thread when it is first opened, so the conversation survives reload.
import { queryOptions } from "@tanstack/react-query";
import { unwrapResult } from "@oh-writers/utils";
import { listMessages } from "./messages.server";
import type { CesareMessage } from "./messages.schema";

export const messagesQueryKey = (projectId: string, sessionId: string) =>
  ["cesare-messages", projectId, sessionId] as const;

export const messagesQueryOptions = (projectId: string, sessionId: string) =>
  queryOptions({
    queryKey: messagesQueryKey(projectId, sessionId),
    queryFn: async (): Promise<CesareMessage[]> =>
      unwrapResult(await listMessages({ data: { projectId, sessionId } })),
    staleTime: 30_000,
    retry: false,
  });
