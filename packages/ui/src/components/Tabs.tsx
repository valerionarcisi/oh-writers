import { useRef } from "react";
import { useTabList, useTab } from "react-aria";
import { useTabListState, Item } from "react-stately";
import type { TabListState } from "react-stately";
import styles from "./Tabs.module.css";

interface Tab {
  id: string;
  label: string;
}

interface TabsProps {
  tabs: Tab[];
  activeId: string;
  onSelect: (id: string) => void;
  className?: string;
}

interface TabButtonProps {
  tab: Tab;
  state: TabListState<Tab>;
}

function TabButton({ tab, state }: TabButtonProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const { tabProps, isSelected } = useTab({ key: tab.id }, state, ref);

  return (
    <button
      ref={ref}
      className={[styles.tab, isSelected ? styles.active : ""]
        .filter(Boolean)
        .join(" ")}
      {...tabProps}
    >
      {tab.label}
    </button>
  );
}

export function Tabs({ tabs, activeId, onSelect, className }: TabsProps) {
  const ref = useRef<HTMLDivElement>(null);

  const state = useTabListState<Tab>({
    selectedKey: activeId,
    onSelectionChange: (key) => onSelect(String(key)),
    items: tabs,
    children: (tab) => (
      <Item key={tab.id} textValue={tab.label}>
        {tab.label}
      </Item>
    ),
  });

  const { tabListProps } = useTabList({ "aria-label": "Tabs" }, state, ref);

  return (
    <div
      ref={ref}
      className={[styles.tabs, className ?? ""].filter(Boolean).join(" ")}
      {...tabListProps}
    >
      {tabs.map((tab) => (
        <TabButton key={tab.id} tab={tab} state={state} />
      ))}
    </div>
  );
}
