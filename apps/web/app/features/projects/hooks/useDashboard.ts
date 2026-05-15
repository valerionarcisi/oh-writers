import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { unwrapResult } from "@oh-writers/utils";
import {
  getDashboardProjects,
  dashboardProjectsQueryOptions,
} from "../server/dashboard.server";
import {
  DashboardViewModes,
  type DashboardViewMode,
} from "../dashboard.schema";

const STORAGE_KEY = "oh-writers:dashboard-view";

const readPersistedView = (): DashboardViewMode => {
  if (typeof window === "undefined") return DashboardViewModes.GRID;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return raw === DashboardViewModes.LIST
    ? DashboardViewModes.LIST
    : DashboardViewModes.GRID;
};

export const useDashboardView = () => {
  const [view, setView] = useState<DashboardViewMode>(DashboardViewModes.GRID);

  // Read from localStorage after mount to keep SSR output stable.
  useEffect(() => {
    setView(readPersistedView());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, view);
  }, [view]);

  return [view, setView] as const;
};

export const useDashboardProjects = () => {
  const query = useQuery(dashboardProjectsQueryOptions());
  return {
    ...query,
    data: query.data ? unwrapResult(query.data) : undefined,
  };
};

// Re-export for prefetch in route loaders.
export { getDashboardProjects, dashboardProjectsQueryOptions };
