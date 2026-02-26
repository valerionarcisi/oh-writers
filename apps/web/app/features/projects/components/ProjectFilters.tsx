import styles from "./ProjectFilters.module.css";

export type FilterTab = "all" | "personal" | "archived";
export type SortKey = "updatedAt" | "createdAt" | "title";

interface ProjectFiltersProps {
  activeTab: FilterTab;
  search: string;
  sort: SortKey;
  onTabChange: (tab: FilterTab) => void;
  onSearchChange: (query: string) => void;
  onSortChange: (sort: SortKey) => void;
}

const TABS: { key: FilterTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "personal", label: "Personal" },
  { key: "archived", label: "Archived" },
];

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "updatedAt", label: "Last modified" },
  { key: "createdAt", label: "Date created" },
  { key: "title", label: "Title" },
];

export function ProjectFilters({
  activeTab,
  search,
  sort,
  onTabChange,
  onSearchChange,
  onSortChange,
}: ProjectFiltersProps) {
  return (
    <div className={styles.bar}>
      <div className={styles.tabs}>
        {TABS.map((tab) => (
          <button
            key={tab.key}
            className={`${styles.tab} ${activeTab === tab.key ? styles.active : ""}`}
            onClick={() => onTabChange(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className={styles.search}>
        <input
          type="search"
          className={styles.searchInput}
          placeholder="Search projects…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>

      <select
        className={styles.sort}
        value={sort}
        onChange={(e) => onSortChange(e.target.value as SortKey)}
      >
        {SORT_OPTIONS.map((opt) => (
          <option key={opt.key} value={opt.key}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
