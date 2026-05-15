import { Viewbar, ViewbarSep } from "@oh-writers/ui";
import {
  DashboardFilterTabs,
  type DashboardFilterTab,
} from "../../dashboard.schema";
import styles from "./DashboardViewbar.module.css";

export interface TabCounts {
  readonly all: number;
  readonly personal: number;
  readonly shared: number;
  readonly archived: number;
}

interface Props {
  readonly activeTab: DashboardFilterTab;
  readonly counts: TabCounts;
  readonly onTabChange: (tab: DashboardFilterTab) => void;
  readonly rightSlot: React.ReactNode;
}

const TABS: ReadonlyArray<{ id: DashboardFilterTab; label: string }> = [
  { id: DashboardFilterTabs.ALL, label: "Tutti" },
  { id: DashboardFilterTabs.PERSONAL, label: "Personali" },
  { id: DashboardFilterTabs.SHARED, label: "Condivisi" },
  { id: DashboardFilterTabs.ARCHIVED, label: "Archiviati" },
];

const countFor = (tab: DashboardFilterTab, counts: TabCounts): number => {
  if (tab === DashboardFilterTabs.ALL) return counts.all;
  if (tab === DashboardFilterTabs.PERSONAL) return counts.personal;
  if (tab === DashboardFilterTabs.SHARED) return counts.shared;
  return counts.archived;
};

export function DashboardViewbar({
  activeTab,
  counts,
  onTabChange,
  rightSlot,
}: Props) {
  return (
    <Viewbar className={styles.bar}>
      <div className={styles.tabs} role="tablist" aria-label="Filtri progetti">
        {TABS.map((t) => {
          const isActive = t.id === activeTab;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`${styles.tab} ${isActive ? styles.tabActive : ""}`}
              onClick={() => onTabChange(t.id)}
            >
              {t.label}
              <span className={styles.count} data-num>
                {countFor(t.id, counts)}
              </span>
            </button>
          );
        })}
      </div>
      <ViewbarSep />
      <div className={styles.right}>{rightSlot}</div>
    </Viewbar>
  );
}
