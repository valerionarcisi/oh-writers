// apps/web/app/features/predictions/use-narrative-next-step.ts
//
// Spec 50 (Part 2) — bridges the project's narrative document state (read via
// the documents feature) to the pure `nextNarrativeStep` decision. Returns the
// single suggestion to surface in the Cesare chat, or null when the chain is
// complete / the project is still loading.
//
// This is the ONLY place that joins I/O (the progress query) to the pure
// function; the chip just renders the result and seeds its prompt through the
// existing send path. No generator is called here.

import { useQuery } from "@tanstack/react-query";
import { narrativeProgressQueryOptions } from "~/features/documents";
import {
  nextNarrativeStep,
  type NarrativePresence,
  type NextStepSuggestion,
} from "./narrative-next-step";

export interface UseNarrativeNextStep {
  /** The single next-step suggestion, or null when none applies. */
  readonly suggestion: NextStepSuggestion | null;
  /** True while the progress query is still resolving. */
  readonly isLoading: boolean;
}

export const useNarrativeNextStep = (
  projectId: string,
): UseNarrativeNextStep => {
  const query = useQuery(narrativeProgressQueryOptions(projectId));

  const presence: NarrativePresence | null =
    query.data && query.data.isOk ? query.data.value : null;

  return {
    suggestion: presence ? nextNarrativeStep(presence) : null,
    isLoading: query.isLoading,
  };
};
