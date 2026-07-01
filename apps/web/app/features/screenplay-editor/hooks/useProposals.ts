import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { unwrapResult } from "@oh-writers/utils";
import {
  getScreenplayProposals,
  removeScreenplayProposalFn,
  clearScreenplayEditProposalsFn,
  promoteDraftToActive,
  discardDraftVersion,
  type ProposalsView,
} from "~/features/predictions/cesare-proposals.server";

export const screenplayProposalsQueryOptions = (screenplayId: string) =>
  queryOptions({
    queryKey: ["screenplay-proposals", screenplayId] as const,
    queryFn: async (): Promise<ProposalsView> =>
      unwrapResult(await getScreenplayProposals({ data: { screenplayId } })),
    // Re-fetch on Cesare turn — invalidated explicitly by the chat hook.
    staleTime: 0,
  });

export const useScreenplayProposals = (screenplayId: string) =>
  useQuery({
    ...screenplayProposalsQueryOptions(screenplayId),
    enabled: screenplayId.length > 0,
  });

// Clear stale inline edit proposals once per page load, then refetch so the
// editor starts clean (#85). Draft-revision banners are left intact server-side.
export const useClearEditProposalsOnMount = (screenplayId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      unwrapResult(
        await clearScreenplayEditProposalsFn({ data: { screenplayId } }),
      ),
    onSettled: () =>
      void qc.invalidateQueries({
        queryKey: ["screenplay-proposals", screenplayId],
      }),
  });
};

export const useRemoveScreenplayProposal = (screenplayId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (proposalId: string) =>
      unwrapResult(
        await removeScreenplayProposalFn({
          data: { screenplayId, proposalId },
        }),
      ),
    onSettled: () =>
      void qc.invalidateQueries({
        queryKey: ["screenplay-proposals", screenplayId],
      }),
  });
};

export const usePromoteDraftToActive = (screenplayId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (versionId: string) =>
      unwrapResult(await promoteDraftToActive({ data: { versionId } })),
    onSettled: () => {
      void qc.invalidateQueries({
        queryKey: ["screenplay-proposals", screenplayId],
      });
      void qc.invalidateQueries({ queryKey: ["versions", screenplayId] });
      // The mounted editor content query is keyed ["screenplays", projectId]
      // (plural). The old ["screenplay"] key matched nothing, so promote never
      // refetched the editor — it looked like a no-op. Invalidate the family +
      // the live current-version pointer so both the editor and the badge update.
      void qc.invalidateQueries({ queryKey: ["screenplays"] });
      void qc.invalidateQueries({
        queryKey: ["screenplay-current-version", screenplayId],
      });
    },
  });
};

export const useDiscardDraftVersion = (screenplayId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (versionId: string) =>
      unwrapResult(await discardDraftVersion({ data: { versionId } })),
    onSettled: () => {
      void qc.invalidateQueries({
        queryKey: ["screenplay-proposals", screenplayId],
      });
      void qc.invalidateQueries({ queryKey: ["versions", screenplayId] });
    },
  });
};
