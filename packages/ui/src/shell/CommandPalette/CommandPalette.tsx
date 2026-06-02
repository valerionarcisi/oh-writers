// packages/ui/src/shell/CommandPalette/CommandPalette.tsx
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { Icon } from "../../icons/Icon";
import type { IconName } from "../../icons/icon-names";
import styles from "./CommandPalette.module.css";

export type CommandPaletteItem = {
  id: string;
  label: string;
  group: string;
  icon?: IconName;
  keywords?: ReadonlyArray<string>;
  onSelect: () => void;
};

export type CommandPaletteProps = {
  isOpen: boolean;
  onClose: () => void;
  items: ReadonlyArray<CommandPaletteItem>;
  placeholder?: string;
  emptyLabel?: string;
  /** Aria-label for the results listbox (defaults to IT "Risultati"). */
  resultsLabel?: string;
};

type FlatEntry =
  | { kind: "header"; group: string; key: string }
  | { kind: "item"; item: CommandPaletteItem; selectableIndex: number };

const matchesQuery = (item: CommandPaletteItem, query: string): boolean => {
  if (query.length === 0) return true;
  const haystack = [item.label, item.group, ...(item.keywords ?? [])]
    .join(" ")
    .toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => haystack.includes(token));
};

const buildFlatList = (
  items: ReadonlyArray<CommandPaletteItem>,
): { entries: FlatEntry[]; selectable: CommandPaletteItem[] } => {
  const byGroup = new Map<string, CommandPaletteItem[]>();
  for (const it of items) {
    const list = byGroup.get(it.group) ?? [];
    list.push(it);
    byGroup.set(it.group, list);
  }
  const entries: FlatEntry[] = [];
  const selectable: CommandPaletteItem[] = [];
  for (const [group, groupItems] of byGroup.entries()) {
    entries.push({ kind: "header", group, key: `h:${group}` });
    for (const it of groupItems) {
      entries.push({
        kind: "item",
        item: it,
        selectableIndex: selectable.length,
      });
      selectable.push(it);
    }
  }
  return { entries, selectable };
};

export function CommandPalette({
  isOpen,
  onClose,
  items,
  placeholder = "Cerca comandi, scene, persone…",
  emptyLabel = "Nessun risultato",
  resultsLabel = "Risultati",
}: CommandPaletteProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const listboxId = useId();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const filtered = useMemo(
    () => items.filter((it) => matchesQuery(it, query)),
    [items, query],
  );

  const { entries, selectable } = useMemo(
    () => buildFlatList(filtered),
    [filtered],
  );

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (isOpen && !el.open) {
      el.showModal();
      setQuery("");
      setActiveIndex(0);
      queueMicrotask(() => inputRef.current?.focus());
    } else if (!isOpen && el.open) {
      el.close();
    }
  }, [isOpen]);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    const handleCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    el.addEventListener("cancel", handleCancel);
    return () => el.removeEventListener("cancel", handleCancel);
  }, [onClose]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (!isOpen) return;
    const node = listRef.current?.querySelector<HTMLElement>(
      `[data-idx="${activeIndex}"]`,
    );
    node?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, isOpen]);

  const selectAt = useCallback(
    (idx: number) => {
      const it = selectable[idx];
      if (!it) return;
      it.onSelect();
      onClose();
    },
    [selectable, onClose],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) =>
        selectable.length === 0 ? 0 : (i + 1) % selectable.length,
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) =>
        selectable.length === 0
          ? 0
          : (i - 1 + selectable.length) % selectable.length,
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      selectAt(activeIndex);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === dialogRef.current) onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby={titleId}
      onClick={handleBackdropClick}
    >
      <div className={styles.panel} onKeyDown={handleKeyDown}>
        <h2 id={titleId} className={styles.srOnly}>
          Tavolozza comandi
        </h2>
        <div className={styles.searchRow}>
          <Icon
            name="search"
            size={16}
            aria-hidden={true}
            className={styles.searchIcon}
          />
          <input
            ref={inputRef}
            type="text"
            className={styles.input}
            placeholder={placeholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-controls={listboxId}
            aria-activedescendant={
              selectable[activeIndex]
                ? `${listboxId}-${selectable[activeIndex].id}`
                : undefined
            }
            aria-autocomplete="list"
          />
          <kbd className={styles.escHint} aria-hidden="true">
            Esc
          </kbd>
        </div>

        <div
          ref={listRef}
          id={listboxId}
          role="listbox"
          className={styles.list}
          aria-label={resultsLabel}
        >
          {entries.length === 0 ? (
            <div className={styles.empty}>{emptyLabel}</div>
          ) : (
            entries.map((entry) =>
              entry.kind === "header" ? (
                <div key={entry.key} className={styles.groupHeader}>
                  {entry.group}
                </div>
              ) : (
                <button
                  key={entry.item.id}
                  type="button"
                  role="option"
                  id={`${listboxId}-${entry.item.id}`}
                  data-idx={entry.selectableIndex}
                  aria-selected={entry.selectableIndex === activeIndex}
                  className={[
                    styles.item,
                    entry.selectableIndex === activeIndex ? styles.itemActive : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onMouseEnter={() => setActiveIndex(entry.selectableIndex)}
                  onClick={() => selectAt(entry.selectableIndex)}
                >
                  {entry.item.icon !== undefined && (
                    <Icon
                      name={entry.item.icon}
                      size={14}
                      aria-hidden={true}
                      className={styles.itemIcon}
                    />
                  )}
                  <span className={styles.itemLabel}>{entry.item.label}</span>
                </button>
              ),
            )
          )}
        </div>

        <div className={styles.footer}>
          <span className={styles.footerHint}>
            <kbd className={styles.kbd}>↑</kbd>
            <kbd className={styles.kbd}>↓</kbd>
            naviga
          </span>
          <span className={styles.footerHint}>
            <kbd className={styles.kbd}>Enter</kbd>
            seleziona
          </span>
          <span className={styles.footerHint}>
            <kbd className={styles.kbd}>Esc</kbd>
            chiudi
          </span>
        </div>
      </div>
    </dialog>
  );
}
