import { queryOptions } from "@tanstack/react-query";
import {
  listOpportunitiesForProject,
  getOpportunity,
} from "./server/fundraising.server";

export type OpportunitiesFilters = {
  kind?: Array<
    | "bando_pubblico"
    | "call_festival"
    | "residenza"
    | "grant_privato"
    | "workshop"
    | "pitch_forum"
    | "other"
  >;
  status?: "active" | "expired" | "unknown";
  deadlineWithin?: "30d" | "90d" | "any";
};

export const opportunitiesQueryOptions = (
  projectId: string,
  filters?: OpportunitiesFilters,
) =>
  queryOptions({
    queryKey: ["fundraising", projectId, filters],
    queryFn: () =>
      listOpportunitiesForProject({ data: { projectId, filters } }),
  });

export const opportunityQueryOptions = (id: string) =>
  queryOptions({
    queryKey: ["fundraising", "detail", id],
    queryFn: () => getOpportunity({ data: { id } }),
  });
