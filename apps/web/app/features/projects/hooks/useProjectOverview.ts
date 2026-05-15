import { useQuery } from "@tanstack/react-query";
import { projectOverviewQueryOptions } from "../server/project-overview.server";

export { projectOverviewQueryOptions };

export const useProjectOverview = (projectId: string) =>
  useQuery(projectOverviewQueryOptions(projectId));
