import { useMemo, useState } from "react";
import { match } from "ts-pattern";
import {
  useDashboardProjects,
  useDashboardView,
} from "../../hooks/useDashboard";
import {
  DashboardFilterTabs,
  DashboardSortKeys,
  DashboardViewModes,
  type DashboardFilterTab,
  type DashboardProject,
  type DashboardSortKey,
} from "../../dashboard.schema";
import { DashboardHero } from "./DashboardHero";
import { DashboardViewbar } from "./DashboardViewbar";
import type { TabCounts } from "./DashboardViewbar";
import {
  DashboardFilters,
  type FormatFilter,
  type GenreFilter,
  type RoleFilter,
} from "./DashboardFilters";
import { ProjectCardGrid } from "./ProjectCardGrid";
import { ProjectCardCompact } from "./ProjectCardCompact";
import { DashboardEmptyState } from "./DashboardEmptyState";
import styles from "./DashboardPage.module.css";

const matchesTab = (
  project: DashboardProject,
  tab: DashboardFilterTab,
): boolean =>
  match(tab)
    .with(DashboardFilterTabs.ALL, () => !project.isArchived)
    .with(
      DashboardFilterTabs.PERSONAL,
      () => !project.isArchived && project.isPersonal,
    )
    .with(
      DashboardFilterTabs.SHARED,
      () => !project.isArchived && project.isShared,
    )
    .with(DashboardFilterTabs.ARCHIVED, () => project.isArchived)
    .exhaustive();

const computeCounts = (
  projects: ReadonlyArray<DashboardProject>,
): TabCounts => ({
  all: projects.filter((p) => !p.isArchived).length,
  personal: projects.filter((p) => !p.isArchived && p.isPersonal).length,
  shared: projects.filter((p) => !p.isArchived && p.isShared).length,
  archived: projects.filter((p) => p.isArchived).length,
});

const applyFilters = (
  projects: ReadonlyArray<DashboardProject>,
  tab: DashboardFilterTab,
  search: string,
  format: FormatFilter,
  genre: GenreFilter,
  role: RoleFilter,
  sort: DashboardSortKey,
): ReadonlyArray<DashboardProject> => {
  const q = search.trim().toLowerCase();
  const filtered = projects.filter((p) => {
    if (!matchesTab(p, tab)) return false;
    if (q && !p.title.toLowerCase().includes(q)) return false;
    if (format !== "all" && p.format !== format) return false;
    if (genre !== "all" && p.genre !== genre) return false;
    if (role !== "all" && p.role !== role) return false;
    return true;
  });

  const sorted = [...filtered];
  sorted.sort((a, b) =>
    match(sort)
      .with(DashboardSortKeys.TITLE, () => a.title.localeCompare(b.title))
      .with(
        DashboardSortKeys.SCENES,
        () => b.stats.sceneCount - a.stats.sceneCount,
      )
      .with(DashboardSortKeys.UPDATED, () =>
        b.updatedAtIso.localeCompare(a.updatedAtIso),
      )
      .exhaustive(),
  );
  return sorted;
};

const computeHeroStats = (projects: ReadonlyArray<DashboardProject>) => {
  const active = projects.filter((p) => !p.isArchived);
  const totalScenes = active.reduce((sum, p) => sum + p.stats.sceneCount, 0);
  const totalDays = active.reduce((sum, p) => sum + p.stats.scheduledDays, 0);
  const lastEdit = active.reduce<DashboardProject | null>((latest, p) => {
    if (!latest) return p;
    return p.updatedAtIso > latest.updatedAtIso ? p : latest;
  }, null);
  return {
    activeCount: active.length,
    totalScenes,
    totalDays,
    lastEditLabel: lastEdit
      ? new Intl.DateTimeFormat("it-IT", {
          day: "numeric",
          month: "short",
        }).format(new Date(lastEdit.updatedAtIso))
      : "—",
  };
};

export function DashboardPage() {
  const { data, isLoading, error } = useDashboardProjects();
  const [view, setView] = useDashboardView();
  const [activeTab, setActiveTab] = useState<DashboardFilterTab>(
    DashboardFilterTabs.ALL,
  );
  const [search, setSearch] = useState("");
  const [format, setFormat] = useState<FormatFilter>("all");
  const [genre, setGenre] = useState<GenreFilter>("all");
  const [role, setRole] = useState<RoleFilter>("all");
  const [sort, setSort] = useState<DashboardSortKey>(DashboardSortKeys.UPDATED);

  const projects = data ?? [];
  const counts = useMemo(() => computeCounts(projects), [projects]);
  const filtered = useMemo(
    () => applyFilters(projects, activeTab, search, format, genre, role, sort),
    [projects, activeTab, search, format, genre, role, sort],
  );
  const heroStats = useMemo(() => computeHeroStats(projects), [projects]);

  if (isLoading) {
    return (
      <div className={styles.page}>
        <p className={styles.status}>Caricamento…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.page}>
        <p className={styles.statusError}>
          Impossibile caricare i progetti. Riprova tra qualche istante.
        </p>
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className={styles.page}>
        <DashboardHero stats={heroStats} />
        <DashboardEmptyState />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <DashboardHero stats={heroStats} />

      <DashboardViewbar
        activeTab={activeTab}
        counts={counts}
        onTabChange={setActiveTab}
        rightSlot={
          <DashboardFilters
            search={search}
            onSearchChange={setSearch}
            format={format}
            onFormatChange={setFormat}
            genre={genre}
            onGenreChange={setGenre}
            role={role}
            onRoleChange={setRole}
            sort={sort}
            onSortChange={setSort}
            view={view}
            onViewChange={setView}
          />
        }
      />

      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>
          {activeTab === DashboardFilterTabs.ARCHIVED
            ? "Archiviati"
            : "Tutti i progetti"}
        </h2>
        <span className={styles.sectionCount} data-num>
          {filtered.length} risultati
        </span>
      </div>

      {filtered.length === 0 ? (
        <p className={styles.empty}>
          Nessun progetto corrisponde ai filtri attuali.
        </p>
      ) : view === DashboardViewModes.GRID ? (
        <div className={styles.grid}>
          {filtered.map((p) => (
            <ProjectCardGrid key={p.id} project={p} />
          ))}
        </div>
      ) : (
        <div className={styles.list} role="list">
          {filtered.map((p) => (
            <ProjectCardCompact key={p.id} project={p} />
          ))}
        </div>
      )}
    </div>
  );
}

// Re-export to help tree-shake if not used.
export const __test__ = {
  applyFilters,
  computeCounts,
  computeHeroStats,
  matchesTab,
};

