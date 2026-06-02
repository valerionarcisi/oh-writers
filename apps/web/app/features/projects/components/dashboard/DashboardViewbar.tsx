import { Viewbar, ViewbarSep } from "@oh-writers/ui";
import type { TranslationKey } from "@oh-writers/domain";
import {
  DashboardFilterTabs,
  type DashboardFilterTab,
} from "../../dashboard.schema";
import { useTranslation } from "~/features/i18n";
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

const TABS: ReadonlyArray<{ id: DashboardFilterTab; labelKey: TranslationKey }> =
  [
    { id: DashboardFilterTabs.ALL, labelKey: "dashboard.viewbar.tabAll" },
    {
      id: DashboardFilterTabs.PERSONAL,
      labelKey: "dashboard.viewbar.tabPersonal",
    },
    { id: DashboardFilterTabs.SHARED, labelKey: "dashboard.viewbar.tabShared" },
    {
      id: DashboardFilterTabs.ARCHIVED,
      labelKey: "dashboard.viewbar.tabArchived",
    },
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
  const { t } = useTranslation();
  return (
    <Viewbar className={styles.bar}>
      <div
        className={styles.tabs}
        role="tablist"
        aria-label={t("dashboard.viewbar.label")}
      >
        {TABS.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`${styles.tab} ${isActive ? styles.tabActive : ""}`}
              onClick={() => onTabChange(tab.id)}
            >
              {t(tab.labelKey)}
              <span className={styles.count} data-num>
                {countFor(tab.id, counts)}
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
