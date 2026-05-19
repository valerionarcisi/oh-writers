import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Skeleton, useConfirmDialog } from "@oh-writers/ui";
import {
  BREAKDOWN_CATEGORIES,
  CATEGORY_META,
  CAST_TIER_META,
  findDuplicateElements,
  groupByCategory,
  summarizeProjectBreakdown,
  toBreakdownCsv,
  type BreakdownCategory,
  type CastTier,
  type DuplicateCandidate,
  type ProjectBreakdownInputRow,
} from "@oh-writers/domain";
import {
  projectBreakdownOptions,
  useBulkRenameBreakdownElements,
  useBulkSetOccurrenceStatusForElements,
  useBulkUpdateBreakdownElements,
  useMergeBreakdownElements,
} from "../hooks/useBreakdown";
import type { ProjectBreakdownRow } from "../server/breakdown.server";
import styles from "./ProjectBreakdownView.module.css";

interface Props {
  projectId: string;
  versionId: string;
  canEdit: boolean;
}

type StatusFilter = "all" | "accepted" | "pending" | "stale";
type SourceFilter = "all" | "regex" | "cesare" | "manual";

const SEARCH_INPUT_ID = "project-breakdown-search";

const toInputRow = (r: ProjectBreakdownRow): ProjectBreakdownInputRow => ({
  elementId: r.element.id,
  name: r.element.name,
  category: r.element.category,
  description: r.element.description ?? null,
  castTier: r.element.castTier ?? null,
  totalQuantity: r.totalQuantity,
  sceneNumbers: r.scenesPresent.map((s) => s.sceneNumber).sort((a, b) => a - b),
  status: r.hasStale ? "stale" : r.hasPending ? "pending" : "accepted",
  source: r.latestSource ?? null,
});

const formatRange = (nums: readonly number[]): string => {
  if (nums.length === 0) return "—";
  if (nums.length === 1) return `SC.${nums[0]}`;
  if (nums.length <= 3) return nums.map((n) => `SC.${n}`).join(", ");
  return `SC.${nums[0]} → SC.${nums[nums.length - 1]}`;
};

const STATUS_LABEL: Record<ProjectBreakdownInputRow["status"], string> = {
  accepted: "accepted",
  pending: "pending",
  stale: "obsoleto",
};

const SOURCE_LABEL: Record<
  NonNullable<ProjectBreakdownInputRow["source"]>,
  string
> = {
  cesare: "Cesare",
  regex: "Regex",
  manual: "Manuale",
};

export function ProjectBreakdownView({ projectId, versionId, canEdit }: Props) {
  const { data: rawRows = [], isLoading } = useQuery(
    projectBreakdownOptions(projectId, versionId),
  );
  const bulkUpdate = useBulkUpdateBreakdownElements();
  const bulkRename = useBulkRenameBreakdownElements();
  const bulkSetStatus = useBulkSetOccurrenceStatusForElements();
  const mergeElements = useMergeBreakdownElements();
  const { confirm } = useConfirmDialog();

  const urlSearch = useSearch({ from: "/_app/projects/$id_/breakdown" });
  const navigate = useNavigate();

  // ─── filters ──────────────────────────────────────────────────────────────

  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);

  const [catFilter, setCatFilter] = useState<Set<BreakdownCategory>>(() => {
    if (!urlSearch.cat) return new Set();
    return new Set(
      urlSearch.cat
        .split(",")
        .filter((c): c is BreakdownCategory =>
          (BREAKDOWN_CATEGORIES as readonly string[]).includes(c),
        ),
    );
  });

  const [statusFilter, setStatusFilter] = useState<StatusFilter>(() => {
    const s = urlSearch.status;
    if (s === "ok") return "accepted";
    if (s === "pending" || s === "stale") return s;
    return "all";
  });
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [hideIgnoredDuplicates, setHideIgnoredDuplicates] = useState(false);

  const [expanded, setExpanded] = useState<Set<BreakdownCategory>>(new Set());

  // ─── selection ────────────────────────────────────────────────────────────

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);

  // ─── derived data ────────────────────────────────────────────────────────

  const allRows = useMemo(() => rawRows.map(toInputRow), [rawRows]);

  const filtered = useMemo<ProjectBreakdownInputRow[]>(() => {
    const q = deferredSearch.trim().toLowerCase();
    return allRows.filter((r) => {
      if (catFilter.size > 0 && !catFilter.has(r.category)) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (sourceFilter !== "all" && r.source !== sourceFilter) return false;
      if (q.length > 0) {
        const haystack = `${r.name} ${r.description ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [allRows, catFilter, statusFilter, sourceFilter, deferredSearch]);

  const summary = useMemo(
    () => summarizeProjectBreakdown(filtered),
    [filtered],
  );

  const duplicates = useMemo(
    () => (hideIgnoredDuplicates ? [] : findDuplicateElements(allRows)),
    [allRows, hideIgnoredDuplicates],
  );

  const groups = useMemo(() => groupByCategory(filtered), [filtered]);

  // Default-expand groups that have issues so the user lands on them.
  useEffect(() => {
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const g of groups) {
        if (g.hasIssues) next.add(g.category);
      }
      return next;
    });
  }, [groups]);

  const flatVisibleRows = useMemo(() => {
    const out: {
      row: ProjectBreakdownInputRow;
      category: BreakdownCategory;
    }[] = [];
    for (const g of groups) {
      if (!expanded.has(g.category)) continue;
      for (const r of g.rows) out.push({ row: r, category: g.category });
    }
    return out;
  }, [groups, expanded]);

  // ─── chip counters (use unfiltered status, only respect search/cat off) ──

  const countsByCategory = useMemo(() => {
    const out = new Map<BreakdownCategory, number>();
    for (const r of allRows)
      out.set(r.category, (out.get(r.category) ?? 0) + 1);
    return out;
  }, [allRows]);

  // ─── handlers ────────────────────────────────────────────────────────────

  const toggleRow = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelected(new Set()), []);

  const toggleGroup = (cat: BreakdownCategory) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });

  const toggleCatFilter = (cat: BreakdownCategory) => {
    setSelected(new Set());
    setCatFilter((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      const catParam = next.size > 0 ? [...next].join(",") : undefined;
      void navigate({ to: ".", search: (s) => ({ ...s, cat: catParam }) });
      return next;
    });
  };

  const updateStatusFilter = (next: StatusFilter) => {
    setStatusFilter(next);
    setSelected(new Set());
    void navigate({
      to: ".",
      search: (s) => ({
        ...s,
        status: next === "all" ? undefined : next === "accepted" ? "ok" : next,
      }),
    });
  };

  const exportCsv = () => {
    const csv = toBreakdownCsv(filtered);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `breakdown-${projectId}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // ─── bulk actions ────────────────────────────────────────────────────────

  const bulkConfirm = () => {
    bulkSetStatus.mutate({
      projectId,
      screenplayVersionId: versionId,
      elementIds: [...selected],
      status: "accepted",
    });
    clearSelection();
  };

  const bulkArchive = () => {
    const ids = [...selected];
    void confirm({
      title: `Archiviare ${ids.length} element${ids.length === 1 ? "o" : "i"}?`,
      message: "Gli elementi archiviati non appaiono più nello spoglio.",
      confirmLabel: "Archivia",
      destructive: true,
    }).then((ok) => {
      if (!ok) return;
      bulkUpdate.mutate({
        projectId,
        elementIds: ids,
        patch: { archivedAt: "now" },
      });
      clearSelection();
    });
  };

  const bulkRecategorize = (category: BreakdownCategory) => {
    bulkUpdate.mutate({
      projectId,
      elementIds: [...selected],
      patch: { category },
    });
    clearSelection();
  };

  const bulkRenameAction = () => {
    const ids = [...selected];
    const proposed = window.prompt("Nuovo nome per gli elementi selezionati");
    if (proposed === null) return;
    const trimmed = proposed.trim();
    if (trimmed.length === 0) return;
    bulkRename.mutate({ projectId, elementIds: ids, name: trimmed });
    clearSelection();
  };

  const applyMerge = (dup: DuplicateCandidate) => {
    if (dup.elementIds.length < 2) return;
    // Keep the first id by alphabetical, merge the rest into it.
    const sortedByName = [...dup.elementIds].sort();
    const [keepId, ...mergeIds] = sortedByName;
    if (!keepId || mergeIds.length === 0) return;
    void confirm({
      title: `Unificare ${dup.elementIds.length} varianti?`,
      message: `"${dup.names.join('", "')}" verranno consolidate in un unico elemento.`,
      confirmLabel: "Unifica",
      destructive: false,
    }).then((ok) => {
      if (!ok) return;
      mergeElements.mutate({ projectId, keepId, mergeIds });
    });
  };

  // ─── keyboard navigation ─────────────────────────────────────────────────

  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!canEdit) return;
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inField =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      if (inField) return;
      if (e.key === "j") {
        e.preventDefault();
        setFocusedIndex((i) => Math.min(flatVisibleRows.length - 1, i + 1));
      } else if (e.key === "k") {
        e.preventDefault();
        setFocusedIndex((i) => Math.max(0, i - 1));
      } else if (e.key === " ") {
        if (focusedIndex >= 0 && flatVisibleRows[focusedIndex]) {
          e.preventDefault();
          toggleRow(flatVisibleRows[focusedIndex].row.elementId);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [canEdit, flatVisibleRows, focusedIndex, toggleRow]);

  if (isLoading)
    return (
      <div className={styles.root}>
        <Skeleton
          lines={3}
          widths={["60%", "100%", "40%"]}
          ariaLabel="Caricamento spoglio"
        />
      </div>
    );

  const formattedSceneRange = summary.sceneRange
    ? `SC.${summary.sceneRange.first} → SC.${summary.sceneRange.last}`
    : "—";

  return (
    <div
      className={styles.root}
      data-testid="project-breakdown-table"
      data-view="per-project"
    >
      {/* ─── KPI strip ─────────────────────────────────────────────────── */}
      <section className={styles.kpis} aria-label="Riepilogo spoglio">
        <div className={styles.kpi}>
          <span className={styles.kpiLabel}>Elementi totali</span>
          <span className={styles.kpiValue}>{summary.totalElements}</span>
          <span className={styles.kpiSub}>{formattedSceneRange}</span>
        </div>
        <div className={styles.kpi}>
          <span className={styles.kpiLabel}>Confermati</span>
          <span
            className={[styles.kpiValue, styles.kpiOk].join(" ")}
            data-testid="kpi-accepted"
          >
            {summary.acceptedCount}
          </span>
          <span className={styles.kpiSub}>
            {summary.totalElements > 0
              ? `${Math.round((summary.acceptedCount / summary.totalElements) * 100)}%`
              : "—"}
          </span>
        </div>
        <div className={styles.kpi}>
          <span className={styles.kpiLabel}>In sospeso</span>
          <span
            className={[styles.kpiValue, styles.kpiWarn].join(" ")}
            data-testid="kpi-pending"
          >
            {summary.pendingCount}
          </span>
          <span className={styles.kpiSub}>da confermare</span>
        </div>
        <div className={styles.kpi}>
          <span className={styles.kpiLabel}>Obsoleti</span>
          <span
            className={[styles.kpiValue, styles.kpiDanger].join(" ")}
            data-testid="kpi-stale"
          >
            {summary.staleCount}
          </span>
          <span className={styles.kpiSub}>scene cambiate</span>
        </div>
        <div className={styles.kpi}>
          <span className={styles.kpiLabel}>Costo stimato</span>
          <span className={styles.kpiValue}>—</span>
          <span className={styles.kpiSub}>tariffa non collegata</span>
        </div>
      </section>

      {/* ─── Duplicates card ───────────────────────────────────────────── */}
      {duplicates.length > 0 && (
        <section
          className={styles.dupCard}
          role="status"
          data-testid="breakdown-duplicates-card"
        >
          <div className={styles.dupIcon} aria-hidden>
            !
          </div>
          <div className={styles.dupBody}>
            <h4 className={styles.dupTitle}>
              {duplicates.length} possibil
              {duplicates.length === 1
                ? "e duplicato rilevato"
                : "i duplicati rilevati"}
            </h4>
            <p className={styles.dupList}>
              {duplicates
                .slice(0, 3)
                .map((d) => d.names.map((n) => `"${n}"`).join(" / "))
                .join(" · ")}
              {duplicates.length > 3 && ` · +${duplicates.length - 3}`}
            </p>
          </div>
          <div className={styles.dupActions}>
            <button
              type="button"
              className={styles.bulkBtn}
              onClick={() => setHideIgnoredDuplicates(true)}
            >
              Ignora
            </button>
            {canEdit && duplicates[0] && (
              <button
                type="button"
                className={styles.bulkBtn}
                onClick={() => applyMerge(duplicates[0]!)}
                data-testid="breakdown-merge-first-duplicate"
              >
                Rivedi e unifica
              </button>
            )}
          </div>
        </section>
      )}

      {/* ─── Toolbar ───────────────────────────────────────────────────── */}
      <section className={styles.toolbar}>
        <input
          id={SEARCH_INPUT_ID}
          ref={searchInputRef}
          className={styles.search}
          type="search"
          placeholder="Cerca elemento, descrizione… (⌘K)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          data-testid="breakdown-view-search"
        />
        <div
          className={styles.chips}
          role="group"
          aria-label="Filtri categoria"
        >
          {BREAKDOWN_CATEGORIES.map((cat) => {
            const meta = CATEGORY_META[cat];
            const isOn = catFilter.has(cat);
            const count = countsByCategory.get(cat) ?? 0;
            if (count === 0 && !isOn) return null;
            return (
              <button
                key={cat}
                type="button"
                className={[styles.chip, isOn ? styles.chipActive : ""]
                  .filter(Boolean)
                  .join(" ")}
                style={{ ["--cat-color" as string]: `var(${meta.colorToken})` }}
                onClick={() => toggleCatFilter(cat)}
                data-testid={`cat-chip-${cat}`}
                aria-pressed={isOn}
              >
                <span className={styles.chipDot} aria-hidden />
                {meta.labelIt}
                <span className={styles.chipCount}>{count}</span>
              </button>
            );
          })}
        </div>
        <div className={styles.pickers}>
          <label className={styles.picker}>
            Stato:
            <select
              value={statusFilter}
              onChange={(e) =>
                updateStatusFilter(e.target.value as StatusFilter)
              }
              data-testid="breakdown-status-filter"
              aria-label="Filtra per stato"
            >
              <option value="all">tutti</option>
              <option value="accepted">confermati</option>
              <option value="pending">in sospeso</option>
              <option value="stale">obsoleti</option>
            </select>
          </label>
          <label className={styles.picker}>
            Origine:
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value as SourceFilter)}
              data-testid="breakdown-source-filter"
              aria-label="Filtra per origine"
            >
              <option value="all">tutte</option>
              <option value="cesare">Cesare</option>
              <option value="regex">Regex</option>
              <option value="manual">Manuale</option>
            </select>
          </label>
          <button
            type="button"
            className={styles.picker}
            onClick={exportCsv}
            data-testid="breakdown-export-csv"
          >
            ↓ Esporta CSV
          </button>
        </div>
      </section>

      {/* ─── Bulk bar ──────────────────────────────────────────────────── */}
      {selected.size > 0 && canEdit && (
        <section className={styles.bulkBar} data-testid="bulk-action-bar">
          <span className={styles.bulkCount}>
            {selected.size} selezionat{selected.size === 1 ? "o" : "i"}
          </span>
          <button
            type="button"
            className={styles.bulkBtn}
            onClick={bulkConfirm}
            data-testid="bulk-confirm-btn"
          >
            Conferma
          </button>
          <RecategorizeMenu onPick={bulkRecategorize} />
          <button
            type="button"
            className={styles.bulkBtn}
            onClick={bulkRenameAction}
            data-testid="bulk-rename-btn"
          >
            Rinomina…
          </button>
          <button
            type="button"
            className={styles.bulkBtn}
            onClick={exportCsv}
            data-testid="bulk-export-btn"
          >
            Esporta CSV
          </button>
          <div className={styles.bulkSpacer} />
          <button
            type="button"
            className={[styles.bulkBtn, styles.bulkBtnDanger].join(" ")}
            onClick={bulkArchive}
            data-testid="bulk-archive-btn"
          >
            Archivia
          </button>
          <button
            type="button"
            className={styles.bulkBtn}
            onClick={clearSelection}
          >
            Annulla
          </button>
        </section>
      )}

      {/* ─── Groups ────────────────────────────────────────────────────── */}
      {groups.length === 0 && (
        <div className={styles.emptyState}>Nessun elemento trovato.</div>
      )}
      {groups.map((g) => {
        const meta = CATEGORY_META[g.category];
        const isOpen = expanded.has(g.category);
        return (
          <section
            key={g.category}
            className={styles.group}
            style={{ ["--cat-color" as string]: `var(${meta.colorToken})` }}
            data-testid={`breakdown-group-${g.category}`}
          >
            <button
              type="button"
              className={styles.groupHead}
              onClick={() => toggleGroup(g.category)}
              aria-expanded={isOpen}
              aria-controls={`group-body-${g.category}`}
            >
              <span className={styles.groupDot} aria-hidden />
              <span className={styles.groupName}>{meta.labelIt}</span>
              <span className={styles.groupCount}>
                {g.rows.length} elementi
              </span>
              {g.pendingCount > 0 && (
                <span className={styles.groupBadge}>
                  {g.pendingCount} pending
                </span>
              )}
              {g.staleCount > 0 && (
                <span
                  className={[styles.groupBadge, styles.groupBadgeDanger].join(
                    " ",
                  )}
                >
                  {g.staleCount} obsoleti
                </span>
              )}
              <span className={styles.groupSpacer} />
              <span
                className={[styles.chev, isOpen ? styles.chevOpen : ""]
                  .filter(Boolean)
                  .join(" ")}
                aria-hidden
              >
                ▾
              </span>
            </button>
            {isOpen && (
              <div id={`group-body-${g.category}`} className={styles.tableWrap}>
                <CategoryTable
                  group={g}
                  canEdit={canEdit}
                  selected={selected}
                  onToggle={toggleRow}
                  focusedIndex={focusedIndex}
                  flatVisibleRows={flatVisibleRows}
                />
              </div>
            )}
          </section>
        );
      })}

      <div className={styles.footnote}>
        {summary.totalElements} elementi · {summary.categoriesUsed} categorie ·
        J/K naviga · spazio seleziona · ⌘K cerca
      </div>
    </div>
  );
}

// ─── Recategorize submenu (lightweight, native <select>) ─────────────────────

function RecategorizeMenu({
  onPick,
}: {
  onPick: (cat: BreakdownCategory) => void;
}) {
  return (
    <label
      className={styles.bulkBtn}
      style={{ paddingInline: "var(--ds-space-2)" }}
    >
      Ricategorizza:
      <select
        defaultValue=""
        onChange={(e) => {
          const v = e.target.value;
          if (v.length > 0) onPick(v as BreakdownCategory);
          e.currentTarget.value = "";
        }}
        data-testid="bulk-recategorize-select"
        aria-label="Ricategorizza in"
      >
        <option value="" disabled>
          scegli…
        </option>
        {BREAKDOWN_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {CATEGORY_META[c].labelIt}
          </option>
        ))}
      </select>
    </label>
  );
}

// ─── Category-specific table ────────────────────────────────────────────────

function CategoryTable({
  group,
  canEdit,
  selected,
  onToggle,
  focusedIndex,
  flatVisibleRows,
}: {
  group: {
    category: BreakdownCategory;
    rows: readonly ProjectBreakdownInputRow[];
  };
  canEdit: boolean;
  selected: Set<string>;
  onToggle: (id: string) => void;
  focusedIndex: number;
  flatVisibleRows: { row: ProjectBreakdownInputRow }[];
}) {
  const isCast = group.category === "cast";
  const isLocations = group.category === "locations";
  const secondaryHeader = isCast
    ? "Tier"
    : isLocations
      ? "Tipo"
      : "Descrizione";
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          {canEdit && <th className={styles.th} aria-label="Selezione" />}
          <th className={styles.th}>Nome</th>
          <th className={styles.th}>{secondaryHeader}</th>
          <th className={[styles.th, styles.thNum].join(" ")}>Scene</th>
          <th className={styles.th}>Range</th>
          <th className={styles.th}>Origine</th>
          <th className={styles.th}>Stato</th>
          <th className={[styles.th, styles.thNum].join(" ")}>Costo stim.</th>
        </tr>
      </thead>
      <tbody>
        {group.rows.map((r) => {
          const flatIdx = flatVisibleRows.findIndex(
            (f) => f.row.elementId === r.elementId,
          );
          const isFocused = flatIdx === focusedIndex;
          const isSelected = selected.has(r.elementId);
          return (
            <tr
              key={r.elementId}
              className={[
                styles.tr,
                isSelected ? styles.trSelected : "",
                isFocused ? styles.trFocused : "",
              ]
                .filter(Boolean)
                .join(" ")}
              data-row-id={r.elementId}
            >
              {canEdit && (
                <td className={styles.checkCell}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggle(r.elementId)}
                    aria-label={`Seleziona ${r.name}`}
                  />
                </td>
              )}
              <td className={styles.td}>
                <div className={styles.nameCell}>
                  {r.name}
                  {r.description && <small>{r.description}</small>}
                </div>
              </td>
              <td className={styles.td}>
                {isCast ? (
                  r.castTier ? (
                    <span className={styles.tier}>
                      {CAST_TIER_META[r.castTier as CastTier]?.labelIt ?? "—"}
                    </span>
                  ) : (
                    <span className={styles.metaCell}>—</span>
                  )
                ) : isLocations ? (
                  <span className={styles.metaCell}>
                    {r.description ?? "—"}
                  </span>
                ) : (
                  <span className={styles.metaCell}>
                    {r.description ?? "—"}
                  </span>
                )}
              </td>
              <td className={[styles.td, styles.tdNum].join(" ")}>
                {r.totalQuantity}
              </td>
              <td className={styles.td}>
                <span className={styles.range}>
                  {formatRange(r.sceneNumbers)}
                </span>
              </td>
              <td className={styles.td}>
                {r.source ? (
                  <span
                    className={[
                      styles.source,
                      r.source === "cesare"
                        ? styles.sourceCesare
                        : r.source === "manual"
                          ? styles.sourceManual
                          : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {SOURCE_LABEL[r.source]}
                  </span>
                ) : (
                  <span className={styles.metaCell}>—</span>
                )}
              </td>
              <td className={styles.td}>
                <span
                  className={[
                    styles.status,
                    r.status === "accepted"
                      ? styles.statusOk
                      : r.status === "pending"
                        ? styles.statusPending
                        : styles.statusStale,
                  ].join(" ")}
                >
                  <span className={styles.statusDot} aria-hidden />
                  {STATUS_LABEL[r.status]}
                </span>
              </td>
              <td className={styles.cost}>
                <small>—</small>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
