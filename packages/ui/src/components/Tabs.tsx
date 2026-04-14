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

export function Tabs({ tabs, activeId, onSelect, className }: TabsProps) {
  return (
    <div
      className={[styles.tabs, className ?? ""].filter(Boolean).join(" ")}
      role="tablist"
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={tab.id === activeId}
          className={[styles.tab, tab.id === activeId ? styles.active : ""]
            .filter(Boolean)
            .join(" ")}
          onClick={() => onSelect(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
