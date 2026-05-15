import { Tabs } from "@oh-writers/ui";
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
  { key: "all", label: "Tutti" },
  { key: "personal", label: "Personali" },
  { key: "archived", label: "Archiviati" },
];

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "updatedAt", label: "Ultima modifica" },
  { key: "createdAt", label: "Data creazione" },
  { key: "title", label: "Titolo" },
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
      <Tabs
        tabs={TABS.map((t) => ({ id: t.key, label: t.label }))}
        activeId={activeTab}
        onSelect={(id) => onTabChange(id as FilterTab)}
      />

      <div className={styles.search}>
        <input
          type="search"
          className={styles.searchInput}
          placeholder="Cerca progetti…"
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
