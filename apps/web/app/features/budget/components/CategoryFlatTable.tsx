import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { unwrapResult } from "@oh-writers/utils";
import type { Budget } from "@oh-writers/domain";
import type { BudgetCast, BudgetCrew } from "@oh-writers/db/schema";
import {
  updateBudgetLine,
  updateBudgetCastRow,
  updateBudgetCrewRow,
  addBudgetCrewRow,
  removeBudgetCrewRow,
} from "../server/budget.server";
import {
  buildFlatSections,
  grandTotalOf,
  SectionIds,
  type FlatRow,
  type FlatSection,
  type SectionId,
} from "./flat-sections";
import styles from "./CategoryFlatTable.module.css";

const eur = new Intl.NumberFormat("it-IT", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});
const eurAmount = (n: number) => eur.format(Math.round(n));
const fmtQty = (n: number) =>
  n.toLocaleString("it-IT", { maximumFractionDigits: 2 });

type ColumnKey = "quantity" | "rate";

interface InlineCellProps {
  value: number;
  format: (v: number) => string;
  onCommit: (v: number) => void;
  disabled?: boolean;
  testId?: string;
  rowKey: string;
  colKey: ColumnKey;
  registerInput: (
    rowKey: string,
    colKey: ColumnKey,
    el: HTMLInputElement | null,
  ) => void;
  onNavigate: (
    rowKey: string,
    colKey: ColumnKey,
    dir: "next" | "prev" | "up" | "down" | "enter",
  ) => void;
}

function InlineCell({
  value,
  format,
  onCommit,
  disabled,
  testId,
  rowKey,
  colKey,
  registerInput,
  onNavigate,
}: InlineCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));

  const commit = useCallback(() => {
    setEditing(false);
    const n = parseFloat(draft.replace(",", "."));
    if (!Number.isNaN(n) && n >= 0 && n !== value) onCommit(n);
  }, [draft, value, onCommit]);

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setEditing(false);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
      onNavigate(rowKey, colKey, "enter");
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      commit();
      onNavigate(rowKey, colKey, e.shiftKey ? "prev" : "next");
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      commit();
      onNavigate(rowKey, colKey, "down");
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      commit();
      onNavigate(rowKey, colKey, "up");
    }
  };

  if (editing) {
    return (
      <input
        ref={(el) => registerInput(rowKey, colKey, el)}
        className={styles.cellInput}
        type="number"
        min="0"
        step="any"
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKey}
        data-testid={testId ? `${testId}-input` : undefined}
      />
    );
  }

  return (
    <button
      type="button"
      className={styles.cellBtn}
      disabled={disabled}
      onClick={() => {
        setDraft(String(value));
        setEditing(true);
      }}
      data-testid={testId}
    >
      {format(value)}
    </button>
  );
}

interface CategoryFlatTableProps {
  projectId: string;
  budget: Budget;
  cast: BudgetCast[];
  crew: BudgetCrew[];
  onOpenDetail?: (sectionId: SectionId) => void;
  initialFocusSection?: SectionId | null;
}

export function CategoryFlatTable({
  projectId,
  budget,
  cast,
  crew,
  onOpenDetail,
  initialFocusSection,
}: CategoryFlatTableProps) {
  const qc = useQueryClient();

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["budget", projectId] });
    qc.invalidateQueries({ queryKey: ["budget-cast-crew", projectId] });
    qc.invalidateQueries({ queryKey: ["budget-day-costs", projectId] });
  }, [qc, projectId]);

  const updateLine = useMutation({
    mutationFn: (vars: {
      lineId: string;
      patch: { rate?: number | null; quantity?: number | null };
    }) => updateBudgetLine({ data: vars }).then(unwrapResult),
    onSuccess: invalidate,
  });

  const updateCast = useMutation({
    mutationFn: (vars: {
      rowId: string;
      patch: { days?: number; dayRate?: number };
    }) => updateBudgetCastRow({ data: vars }).then(unwrapResult),
    onSuccess: invalidate,
  });

  const updateCrew = useMutation({
    mutationFn: (vars: {
      rowId: string;
      patch: { days?: number; dayRate?: number };
    }) => updateBudgetCrewRow({ data: vars }).then(unwrapResult),
    onSuccess: invalidate,
  });

  const addCrew = useMutation({
    mutationFn: (vars: { name: string; department: string }) =>
      addBudgetCrewRow({
        data: {
          budgetId: budget.id,
          name: vars.name,
          department: vars.department,
          days: 1,
          dayRate: 0,
          fiscalRegime: "piva",
        },
      }).then(unwrapResult),
    onSuccess: invalidate,
  });

  const removeCrew = useMutation({
    mutationFn: (rowId: string) =>
      removeBudgetCrewRow({ data: { rowId } }).then(unwrapResult),
    onSuccess: invalidate,
  });

  const sections = useMemo<FlatSection[]>(
    () => buildFlatSections({ lines: budget.lines, cast, crew }),
    [budget.lines, cast, crew],
  );
  const grandTotal = useMemo(() => grandTotalOf(sections), [sections]);

  const [collapsed, setCollapsed] = useState<Set<SectionId>>(new Set());
  const toggle = (id: SectionId) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // ── search / jump (⌘K) ─────────────────────────────────────────────────
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [focusedRowId, setFocusedRowId] = useState<string | null>(null);
  const rowRefs = useRef(new Map<string, HTMLDivElement | null>());
  const sectionRefs = useRef(new Map<SectionId, HTMLElement | null>());

  // Flat list of rows with their section ids — used for keyboard nav.
  const navOrder = useMemo<
    Array<{ rowId: string; sectionId: SectionId; row: FlatRow }>
  >(() => {
    const out: Array<{ rowId: string; sectionId: SectionId; row: FlatRow }> =
      [];
    for (const sec of sections) {
      for (const row of sec.rows) {
        out.push({ rowId: row.id, sectionId: sec.id, row });
      }
    }
    return out;
  }, [sections]);

  const inputRefs = useRef(new Map<string, HTMLInputElement | null>());
  const refKey = (rowId: string, colKey: ColumnKey) => `${rowId}::${colKey}`;
  const registerInput = useCallback(
    (rowId: string, colKey: ColumnKey, el: HTMLInputElement | null) => {
      const key = refKey(rowId, colKey);
      if (el) inputRefs.current.set(key, el);
      else inputRefs.current.delete(key);
    },
    [],
  );

  const focusCell = useCallback((rowId: string, colKey: ColumnKey) => {
    const el = inputRefs.current.get(refKey(rowId, colKey));
    if (el) {
      el.focus();
      el.select();
      return true;
    }
    // Fallback: focus the cell button so user clicks to edit.
    const rowEl = document.querySelector(
      `[data-row-id="${rowId}"] [data-cell-col="${colKey}"]`,
    ) as HTMLButtonElement | null;
    if (rowEl) {
      rowEl.click();
      return true;
    }
    return false;
  }, []);

  const handleNavigate = useCallback(
    (
      rowId: string,
      colKey: ColumnKey,
      dir: "next" | "prev" | "up" | "down" | "enter",
    ) => {
      const idx = navOrder.findIndex((r) => r.rowId === rowId);
      if (idx === -1) return;
      const COLS: ColumnKey[] = ["quantity", "rate"];
      const colIdx = COLS.indexOf(colKey);
      if (dir === "next" || dir === "prev") {
        const step = dir === "next" ? 1 : -1;
        const newColIdx = colIdx + step;
        if (newColIdx >= 0 && newColIdx < COLS.length) {
          setTimeout(() => focusCell(rowId, COLS[newColIdx]!), 0);
          return;
        }
        const nextRowIdx = idx + step;
        const nextRow = navOrder[nextRowIdx];
        if (nextRow) {
          const wrapCol = step > 0 ? COLS[0]! : COLS[COLS.length - 1]!;
          setTimeout(() => focusCell(nextRow.rowId, wrapCol), 0);
        }
        return;
      }
      const rowStep = dir === "down" || dir === "enter" ? 1 : -1;
      const nextRow = navOrder[idx + rowStep];
      if (nextRow) setTimeout(() => focusCell(nextRow.rowId, colKey), 0);
    },
    [navOrder, focusCell],
  );

  // Global keyboard shortcut (⌘K) — open search popover.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (e.key === "Escape" && searchOpen) setSearchOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [searchOpen]);

  // Scroll to initialFocusSection on mount / change.
  useEffect(() => {
    if (!initialFocusSection) return;
    const el = sectionRefs.current.get(initialFocusSection);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [initialFocusSection]);

  const searchMatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [] as Array<{ rowId: string; row: FlatRow; section: FlatSection }>;
    const out: Array<{ rowId: string; row: FlatRow; section: FlatSection }> = [];
    for (const sec of sections) {
      for (const row of sec.rows) {
        if (row.name.toLowerCase().includes(q)) {
          out.push({ rowId: row.id, row, section: sec });
          if (out.length >= 20) return out;
        }
      }
    }
    return out;
  }, [searchQuery, sections]);

  const jumpTo = (rowId: string) => {
    setSearchOpen(false);
    setSearchQuery("");
    setFocusedRowId(rowId);
    setTimeout(() => {
      const el = rowRefs.current.get(rowId);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 0);
    setTimeout(() => setFocusedRowId(null), 2000);
  };

  const commitRowField = (
    row: FlatRow,
    field: ColumnKey,
    value: number,
  ): void => {
    if (row.kind === "cast") {
      const patch = field === "quantity" ? { days: value } : { dayRate: value };
      updateCast.mutate({ rowId: row.id, patch });
      return;
    }
    if (row.kind === "crew") {
      const patch = field === "quantity" ? { days: value } : { dayRate: value };
      updateCrew.mutate({ rowId: row.id, patch });
      return;
    }
    const patch =
      field === "quantity" ? { quantity: value } : { rate: value };
    updateLine.mutate({ lineId: row.id, patch });
  };

  const [adding, setAdding] = useState<SectionId | null>(null);
  const [addDraft, setAddDraft] = useState("");
  const startAdd = (id: SectionId) => {
    if (id !== SectionIds.CREW) return;
    setAdding(id);
    setAddDraft("");
  };
  const confirmAdd = () => {
    const name = addDraft.trim();
    if (!name) {
      setAdding(null);
      return;
    }
    addCrew.mutate({ name, department: "Generale" });
    setAdding(null);
    setAddDraft("");
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.toolbar}>
        <button
          type="button"
          className={styles.search}
          onClick={() => setSearchOpen(true)}
          data-testid="budget-flat-search"
        >
          <span>Cerca voce…</span>
          <span className={styles.searchKey}>⌘K</span>
        </button>
      </div>

      <div className={styles.gridHead} role="row">
        <span>Voce</span>
        <span className={styles.headNum}>Q.tà</span>
        <span className={styles.headNum}>Tariffa</span>
        <span className={styles.headNum}>Totale</span>
        <span className={styles.headNum}>Stato</span>
        <span className={styles.headNum}>Azioni</span>
      </div>

      {sections.map((section) => {
        const isCollapsed = collapsed.has(section.id);
        return (
          <section
            key={section.id}
            ref={(el) => {
              sectionRefs.current.set(section.id, el);
            }}
            className={styles.section}
            data-section-id={section.id}
          >
            <button
              type="button"
              className={styles.sectionHead}
              onClick={() => toggle(section.id)}
              aria-expanded={!isCollapsed}
              style={{
                ["--cat-color" as string]: `var(${section.tokenVar})`,
              }}
            >
              <span
                className={`${styles.chevron} ${!isCollapsed ? styles.chevronOpen : ""}`}
                aria-hidden="true"
              >
                ▸
              </span>
              <span className={styles.sectionName}>
                <span
                  className={styles.sectionDot}
                  aria-hidden="true"
                />
                {section.label}
                <span className={styles.sectionCount}>
                  {section.rows.length}
                </span>
              </span>
              {onOpenDetail ? (
                <span
                  role="link"
                  tabIndex={0}
                  className={styles.sectionLink}
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenDetail(section.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.stopPropagation();
                      onOpenDetail(section.id);
                    }
                  }}
                >
                  Vista dettagliata →
                </span>
              ) : (
                <span />
              )}
              <span className={styles.sectionTotal}>
                {eurAmount(section.total)}
              </span>
            </button>

            {!isCollapsed && (
              <div className={styles.rows}>
                {section.rows.length === 0 && section.id !== SectionIds.CREW && (
                  <div className={styles.row}>
                    <span className={styles.numFaint}>
                      Nessuna voce in {section.label}
                    </span>
                  </div>
                )}
                {section.rows.map((row) => {
                  const isCrewDisabled =
                    row.kind === "crew" && !row.enabled;
                  return (
                    <div
                      key={row.id}
                      ref={(el) => {
                        rowRefs.current.set(row.id, el);
                      }}
                      className={`${styles.row} ${focusedRowId === row.id ? styles.rowFocus : ""}`}
                      data-row-id={row.id}
                    >
                      <span className={styles.rowName}>
                        <span className={styles.rowNameText}>{row.name}</span>
                        {row.kind === "crew" && (
                          <span className={styles.rowMeta}>
                            {row.department}
                          </span>
                        )}
                      </span>
                      <span className={styles.num}>
                        <span data-cell-col="quantity">
                          <InlineCell
                            value={row.quantity}
                            format={fmtQty}
                            onCommit={(v) =>
                              commitRowField(row, "quantity", v)
                            }
                            rowKey={row.id}
                            colKey="quantity"
                            registerInput={registerInput}
                            onNavigate={handleNavigate}
                            disabled={isCrewDisabled}
                            testId={`flat-qty-${row.id}`}
                          />
                        </span>
                      </span>
                      <span className={styles.num}>
                        <span data-cell-col="rate">
                          <InlineCell
                            value={row.rate}
                            format={eurAmount}
                            onCommit={(v) => commitRowField(row, "rate", v)}
                            rowKey={row.id}
                            colKey="rate"
                            registerInput={registerInput}
                            onNavigate={handleNavigate}
                            disabled={isCrewDisabled}
                            testId={`flat-rate-${row.id}`}
                          />
                        </span>
                      </span>
                      <span className={styles.num}>{eurAmount(row.total)}</span>
                      <span className={styles.num}>
                        {row.total > 0 ? (
                          <span className={styles.numFaint}>OK</span>
                        ) : (
                          <span className={styles.numFaint}>—</span>
                        )}
                      </span>
                      <span className={styles.num}>
                        {row.kind === "crew" && (
                          <button
                            type="button"
                            className={styles.removeBtn}
                            aria-label={`Rimuovi ${row.name}`}
                            onClick={() => {
                              if (
                                row.total === 0 ||
                                window.confirm(
                                  `Rimuovere "${row.name}"? Totale: ${eurAmount(row.total)}`,
                                )
                              ) {
                                removeCrew.mutate(row.id);
                              }
                            }}
                          >
                            ×
                          </button>
                        )}
                      </span>
                    </div>
                  );
                })}
                {section.id === SectionIds.CREW &&
                  (adding === section.id ? (
                    <div className={styles.addRow}>
                      <input
                        autoFocus
                        className={styles.addInputName}
                        placeholder="Nuova voce — nome ruolo"
                        value={addDraft}
                        onChange={(e) => setAddDraft(e.target.value)}
                        onBlur={confirmAdd}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") confirmAdd();
                          if (e.key === "Escape") setAdding(null);
                        }}
                      />
                    </div>
                  ) : (
                    <div style={{ padding: "8px 16px" }}>
                      <button
                        type="button"
                        className={styles.addInline}
                        onClick={() => startAdd(section.id)}
                        data-testid={`flat-add-${section.id}`}
                      >
                        + Aggiungi voce
                      </button>
                    </div>
                  ))}
              </div>
            )}
          </section>
        );
      })}

      <div className={styles.gridFoot}>
        <span className={styles.gridFootLabel}>Totale stimato</span>
        <span />
        <span />
        <span>{eurAmount(grandTotal)}</span>
        <span />
        <span />
      </div>

      {searchOpen && (
        <div
          className={styles.searchPopover}
          role="dialog"
          aria-label="Cerca voce budget"
        >
          <input
            autoFocus
            className={styles.searchInput}
            placeholder="Cerca per nome…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && searchMatches[0]) {
                jumpTo(searchMatches[0].rowId);
              }
              if (e.key === "Escape") setSearchOpen(false);
            }}
          />
          <div className={styles.searchResults}>
            {searchMatches.map((m) => (
              <button
                key={m.rowId}
                type="button"
                className={styles.searchResult}
                onClick={() => jumpTo(m.rowId)}
              >
                <span>{m.row.name}</span>
                <span className={styles.searchResultMeta}>
                  {m.section.label} · {eurAmount(m.row.total)}
                </span>
              </button>
            ))}
            {searchQuery && searchMatches.length === 0 && (
              <span className={styles.searchResultMeta}>Nessun risultato</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
