import {
  buildEditorialAdviceDecisionKey,
  editorialAdviceDecisionMemoryKey,
  type DecidedEditorialAdviceStatus,
  type EditorialAdvice,
  type EditorialAdviceStatus,
} from "@oh-writers/domain";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import {
  listEditorialAdviceDecisions,
  recordEditorialAdviceDecision,
} from "./editorial-advice-decisions.server";

type ListDecisionsResult = Awaited<
  ReturnType<typeof listEditorialAdviceDecisions>
>;

export const EDITORIAL_ADVICE_REFRESH_DEBOUNCE_MS = 1000;

// Retained only for existing content-based query keys elsewhere; decision
// persistence itself no longer depends on this fingerprint (Spec 82).
export const buildAdviceContentFingerprint = (content: string): string =>
  `${content.length}:${content.slice(0, 120)}:${content.slice(-80)}`;

export function useDebouncedValue<T>(
  value: T,
  delayMs = EDITORIAL_ADVICE_REFRESH_DEBOUNCE_MS,
) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeoutId = window.setTimeout(
      () => setDebouncedValue(value),
      delayMs,
    );
    return () => window.clearTimeout(timeoutId);
  }, [delayMs, value]);

  return debouncedValue;
}

const decisionsQueryKey = (
  projectId: string,
  docType: string,
  sceneId?: string,
) => ["editorial-advice-decisions", projectId, docType, sceneId ?? null];

/**
 * DB-backed replacement for the original localStorage memory (Spec 82).
 * Decisions are keyed to project+doc+scene+area+text-anchor, not to a
 * whole-document content fingerprint, so they survive unrelated edits and
 * double as Cesare's anti-repetition context server-side.
 */
export const useEditorialAdviceMemory = (
  projectId: string,
  docType: string,
  sceneId?: string,
) => {
  const queryClient = useQueryClient();
  const queryKey = decisionsQueryKey(projectId, docType, sceneId);

  const query = useQuery({
    queryKey,
    queryFn: () =>
      listEditorialAdviceDecisions({ data: { projectId, docType, sceneId } }),
    enabled: projectId.length > 0 && docType.length > 0,
  });

  const decisions = query.data && query.data.isOk ? query.data.value : [];

  const statuses: Record<string, EditorialAdviceStatus> = {};
  for (const decision of decisions) {
    statuses[editorialAdviceDecisionMemoryKey(decision)] = decision.status;
  }

  const mutation = useMutation({
    mutationFn: (input: {
      advice: EditorialAdvice;
      status: DecidedEditorialAdviceStatus;
    }) => {
      const key = buildEditorialAdviceDecisionKey(input.advice, {
        docType,
        sceneId,
      });
      return recordEditorialAdviceDecision({
        data: { projectId, key, status: input.status },
      });
    },
    // Optimistic update: hide the note instantly instead of waiting the full
    // round-trip, and roll back to the previous list if the write fails so a
    // failed mutation never leaves the UI silently out of sync.
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<ListDecisionsResult>(queryKey);
      const key = buildEditorialAdviceDecisionKey(input.advice, {
        docType,
        sceneId,
      });
      queryClient.setQueryData<ListDecisionsResult>(queryKey, (current) => {
        if (!current || !current.isOk) return current;
        const withoutExisting = current.value.filter(
          (decision) =>
            editorialAdviceDecisionMemoryKey(decision) !==
            editorialAdviceDecisionMemoryKey(key),
        );
        return {
          ...current,
          value: [...withoutExisting, { ...key, status: input.status }],
        };
      });
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const setAdviceStatus = useCallback(
    (advice: EditorialAdvice, status: DecidedEditorialAdviceStatus) => {
      mutation.mutate({ advice, status });
    },
    [mutation],
  );

  return { statuses, setAdviceStatus, isError: mutation.isError };
};
