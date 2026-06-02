// packages/ui/src/shell/TopBar/ProjectSwitcherPopover.tsx
import { useEffect, useRef, useState } from "react";
import { Icon } from "../../icons/Icon";
import styles from "./TopBar.module.css";

export type ProjectSwitcherItem = {
  id: string;
  title: string;
};

export type ProjectSwitcherPopoverProps = {
  projects: ReadonlyArray<ProjectSwitcherItem>;
  currentProjectId?: string;
  onSelect: (id: string) => void;
  onAllProjects: () => void;
  onClose: () => void;
  /** Aria-label for the listbox (defaults to IT "Cambia progetto"). */
  switchLabel?: string;
  /** Empty-state copy (defaults to IT "Nessun progetto"). */
  emptyLabel?: string;
  /** Aria-label for the current-project dot (defaults to IT "Progetto corrente"). */
  currentLabel?: string;
};

export function ProjectSwitcherPopover({
  projects,
  currentProjectId,
  onSelect,
  onAllProjects,
  onClose,
  switchLabel = "Cambia progetto",
  emptyLabel = "Nessun progetto",
  currentLabel = "Progetto corrente",
}: ProjectSwitcherPopoverProps) {
  const initialFocusIndex = (() => {
    if (projects.length === 0) return -1;
    const currentIdx = projects.findIndex((p) => p.id === currentProjectId);
    return currentIdx >= 0 ? currentIdx : 0;
  })();

  const [focusIndex, setFocusIndex] = useState<number>(initialFocusIndex);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (focusIndex < 0) return;
    itemRefs.current[focusIndex]?.focus();
  }, [focusIndex]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (projects.length === 0) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusIndex((i) => (i + 1) % projects.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusIndex((i) => (i - 1 + projects.length) % projects.length);
    } else if (e.key === "Home") {
      e.preventDefault();
      setFocusIndex(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setFocusIndex(projects.length - 1);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div
      role="listbox"
      aria-label={switchLabel}
      className={styles.projectPopover}
      data-testid="topbar-project-popover"
      onKeyDown={handleKeyDown}
    >
      {projects.length === 0 ? (
        <span className={styles.projectEmpty}>{emptyLabel}</span>
      ) : (
        <div className={styles.projectList}>
          {projects.map((p, idx) => {
            const isCurrent = p.id === currentProjectId;
            const cls = [
              styles.projectItem,
              isCurrent ? styles.projectItemActive : "",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <button
                key={p.id}
                type="button"
                role="option"
                aria-selected={isCurrent}
                ref={(el) => {
                  itemRefs.current[idx] = el;
                }}
                tabIndex={idx === focusIndex ? 0 : -1}
                className={cls}
                onClick={() => onSelect(p.id)}
              >
                <span className={styles.projectItemTitle}>{p.title}</span>
                {isCurrent && (
                  <span
                    className={styles.projectItemDot}
                    aria-label={currentLabel}
                  />
                )}
              </button>
            );
          })}
        </div>
      )}
      <span className={styles.projectDivider} aria-hidden="true" />
      <button
        type="button"
        className={styles.projectFooter}
        onClick={onAllProjects}
      >
        <span>Tutti i progetti</span>
        <Icon name="chevron-right" size={12} aria-hidden={true} />
      </button>
    </div>
  );
}
