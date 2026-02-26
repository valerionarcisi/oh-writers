import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@oh-writers/ui";
import { ProjectCard, ProjectFilters } from "~/features/projects";
import { usePersonalProjects } from "~/features/projects";
import type { FilterTab, SortKey } from "~/features/projects";
import styles from "./_app.dashboard.module.css";

export const Route = createFileRoute("/_app/dashboard")({
  component: DashboardPage,
});

// createServerFn serializes Date → string; accept both for robust sorting
type SortableProject = {
  title: string;
  teamId: string | null;
  isArchived: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
};

// Pure filter + sort function — no side effects
const filterAndSort = <T extends SortableProject>(
  projects: T[],
  tab: FilterTab,
  search: string,
  sort: SortKey,
): T[] => {
  let result = [...projects];

  if (tab === "personal")
    result = result.filter((p) => !p.isArchived && p.teamId === null);
  else if (tab === "archived") result = result.filter((p) => p.isArchived);
  else result = result.filter((p) => !p.isArchived);

  if (search.trim()) {
    const q = search.trim().toLowerCase();
    result = result.filter((p) => p.title.toLowerCase().includes(q));
  }

  // ISO date strings compare correctly with localeCompare
  result.sort((a, b) => {
    if (sort === "title") return a.title.localeCompare(b.title);
    const da = sort === "createdAt" ? String(a.createdAt) : String(a.updatedAt);
    const db = sort === "createdAt" ? String(b.createdAt) : String(b.updatedAt);
    return db.localeCompare(da);
  });

  return result;
};

function DashboardPage() {
  const navigate = useNavigate();
  const { data: projects = [], isLoading, error } = usePersonalProjects();
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("updatedAt");

  const filtered = filterAndSort(projects, activeTab, search, sort);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Projects</h1>
        <Button
          variant="primary"
          onClick={() => navigate({ to: "/projects/new" })}
        >
          New Project
        </Button>
      </div>

      <ProjectFilters
        activeTab={activeTab}
        search={search}
        sort={sort}
        onTabChange={setActiveTab}
        onSearchChange={setSearch}
        onSortChange={setSort}
      />

      {isLoading ? (
        <p className={styles.status}>Loading…</p>
      ) : error ? (
        <p className={styles.statusError}>Failed to load projects.</p>
      ) : filtered.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyText}>
            {search ? "No projects match your search." : "No projects yet."}
          </p>
          {!search && (
            <Button
              variant="primary"
              onClick={() => navigate({ to: "/projects/new" })}
            >
              Create your first project
            </Button>
          )}
        </div>
      ) : (
        <div className={styles.grid}>
          {filtered.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
  );
}
