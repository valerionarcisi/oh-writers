import { Tabs } from "@oh-writers/ui";
import type { TranslationKey } from "@oh-writers/domain";
import { useTranslation } from "~/features/i18n";
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

const TABS: { key: FilterTab; labelKey: TranslationKey }[] = [
  { key: "all", labelKey: "dashboard.filters.tabAll" },
  { key: "personal", labelKey: "dashboard.filters.tabPersonal" },
  { key: "archived", labelKey: "dashboard.filters.tabArchived" },
];

const SORT_OPTIONS: { key: SortKey; labelKey: TranslationKey }[] = [
  { key: "updatedAt", labelKey: "dashboard.filters.sortUpdated" },
  { key: "createdAt", labelKey: "dashboard.filters.sortCreated" },
  { key: "title", labelKey: "dashboard.filters.sortTitle" },
];

export function ProjectFilters({
  activeTab,
  search,
  sort,
  onTabChange,
  onSearchChange,
  onSortChange,
}: ProjectFiltersProps) {
  const { t } = useTranslation();
  return (
    <div className={styles.bar}>
      <Tabs
        tabs={TABS.map((tab) => ({ id: tab.key, label: t(tab.labelKey) }))}
        activeId={activeTab}
        onSelect={(id) => onTabChange(id as FilterTab)}
      />

      <div className={styles.search}>
        <input
          type="search"
          className={styles.searchInput}
          placeholder={t("dashboard.filters.searchPlaceholder")}
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
            {t(opt.labelKey)}
          </option>
        ))}
      </select>
    </div>
  );
}
