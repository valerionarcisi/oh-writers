import {
  useCallback,
  useDeferredValue,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Tag,
  ContextMenu,
  EditableCell,
  Skeleton,
  useConfirmDialog,
} from "@oh-writers/ui";
import {
  BREAKDOWN_CATEGORIES,
  CATEGORY_META,
  CAST_TIERS,
  CAST_TIER_META,
  type BreakdownCategory,
  type CastTier,
} from "@oh-writers/domain";
import {
  projectBreakdownOptions,
  useArchiveBreakdownElement,
  useUpdateBreakdownElement,
  useBulkUpdateBreakdownElements,
} from "../hooks/useBreakdown";
import type { ProjectBreakdownRow } from "../server/breakdown.server";
import styles from "./ProjectBreakdownTable.module.css";

interface Props {
  projectId: string;
  versionId: string;
  canEdit: boolean;
}

type ElementStatus = "stale" | "pending" | "accepted";

interface TableRow {
  id: string;
  name: string;
  category: BreakdownCategory;
  castTier: string | null;
  totalQuantity: number;
  sceneNumbers: number[];
  status: ElementStatus;
  _raw: ProjectBreakdownRow;
}

type StatusFilter = "all" | "stale" | "pending" | "ok";
type SortKey = keyof Pick<TableRow, "name" | "category" | "totalQuantity">;
type SortDir = "asc" | "desc";

const CATEGORY_OPTIONS = BREAKDOWN_CATEGORIES.map((c) => ({
  value: c,
  label: CATEGORY_META[c].labelIt,
}));

export function ProjectBreakdownTable({
  projectId,
  versionId,
  canEdit,
}: Props) {
  const { data: rows = [], isLoading } = useQuery(
    projectBreakdownOptions(projectId, versionId),
  );
  const update = useUpdateBreakdownElement();
  const archive = useArchiveBreakdownElement();
  const bulkUpdate = useBulkUpdateBreakdownElements();
  const { confirm } = useConfirmDialog();

  // ─── URL-persisted filters ────────────────────────────────────────────────
  const urlSearch = useSearch({
    from: "/_app/projects/$id_/breakdown",
  });
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);

  const [catFilter, setCatFilter] = useState<Set<BreakdownCategory>>(() => {
    if (!urlSearch.cat) return new Set();
    const cats = urlSearch.cat
      .split(",")
      .filter((c): c is BreakdownCategory =>
        (BREAKDOWN_CATEGORIES as readonly string[]).includes(c),
      );
    return new Set(cats);
  });

  const [statusFilter, setStatusFilter] = useState<StatusFilter>(
    urlSearch.status ?? "all",
  );

  // ─── sort ─────────────────────────────────────────────────────────────────
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const onHeaderClick = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  // ─── selection ────────────────────────────────────────────────────────────
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggleRow = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // ─── context menu ─────────────────────────────────────────────────────────
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    row: TableRow;
  } | null>(null);

  // ─── derived data ─────────────────────────────────────────────────────────
  const tableData: TableRow[] = useMemo(
    () =>
      rows.map((r) => ({
        id: r.element.id,
        name: r.element.name,
        category: r.element.category,
        castTier: r.element.castTier ?? null,
        totalQuantity: r.totalQuantity,
        sceneNumbers: r.scenesPresent
          .map((s) => s.sceneNumber)
          .sort((a, b) => a - b),
        status: (r.hasStale
          ? "stale"
          : r.hasPending
            ? "pending"
            : "accepted") as ElementStatus,
        _raw: r,
      })),
    [rows],
  );

  const filtered = useMemo(() => {
    let out = tableData;
    if (catFilter.size > 0) out = out.filter((r) => catFilter.has(r.category));
    if (statusFilter === "stale") out = out.filter((r) => r.status === "stale");
    if (statusFilter === "pending")
      out = out.filter((r) => r.status === "pending");
    if (statusFilter === "ok") out = out.filter((r) => r.status === "accepted");
    if (deferredSearch.length > 0) {
      const q = deferredSearch.toLowerCase();
      out = out.filter((r) => r.name.toLowerCase().includes(q));
    }
    return out;
  }, [tableData, catFilter, statusFilter, deferredSearch]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const cmp =
        (av as number | string) < (bv as number | string)
          ? -1
          : av === bv
            ? 0
            : 1;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const allVisibleIds = useMemo(
    () => new Set(sorted.map((r) => r.id)),
    [sorted],
  );
  const allChecked =
    sorted.length > 0 && sorted.every((r) => selected.has(r.id));
  const someChecked = !allChecked && sorted.some((r) => selected.has(r.id));

  const toggleAll = () =>
    setSelected((prev) => {
      if (allChecked) {
        const next = new Set(prev);
        for (const id of allVisibleIds) next.delete(id);
        return next;
      }
      return new Set([...prev, ...allVisibleIds]);
    });

  // ─── mutations ────────────────────────────────────────────────────────────
  const commitName = useCallback(
    (elementId: string, name: string) => {
      update.mutate({ elementId, patch: { name } });
    },
    [update],
  );

  const commitCategory = useCallback(
    (elementId: string, next: string) => {
      update.mutate({
        elementId,
        patch: { category: next as BreakdownCategory },
      });
    },
    [update],
  );

  const bulkArchive = () => {
    const ids = [...selected];
    void confirm({
      title: `Archiviare ${ids.length} element${ids.length === 1 ? "o" : "i"}?`,
      message: "Gli elementi archiviati non appaiono nella tabella.",
      confirmLabel: "Archivia",
      destructive: true,
    }).then((ok) => {
      if (!ok) return;
      bulkUpdate.mutate({
        projectId,
        elementIds: ids,
        patch: { archivedAt: "now" },
      });
      setSelected(new Set());
    });
  };

  const bulkRecategorize = (category: BreakdownCategory) => {
    const ids = [...selected];
    bulkUpdate.mutate({ projectId, elementIds: ids, patch: { category } });
    setSelected(new Set());
  };

  const commitCastTier = useCallback(
    (elementId: string, tier: string) => {
      update.mutate({
        elementId,
        patch: { castTier: (tier || null) as CastTier | null },
      });
    },
    [update],
  );

  // ─── helpers ──────────────────────────────────────────────────────────────
  // Cast tier column is visible only when the cat filter is set exclusively to "cast".
  const showCastTierCol = catFilter.size === 1 && catFilter.has("cast");

  const castTierOptions = [
    { value: "", label: "—" },
    ...CAST_TIERS.map((t) => ({ value: t, label: CAST_TIER_META[t].labelIt })),
  ];

  const sortIndicator = (key: SortKey) => {
    if (sortKey !== key) return null;
    return sortDir === "asc" ? " ↑" : " ↓";
  };

  const toggleCatFilter = (cat: BreakdownCategory) => {
    setSelected(new Set());
    setCatFilter((prev) => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      const catParam = next.size > 0 ? [...next].join(",") : undefined;
      void navigate({ to: ".", search: (s) => ({ ...s, cat: catParam }) });
      return next;
    });
  };

  const recategorizeMenuRef = useRef<HTMLDivElement>(null);
  const [recatOpen, setRecatOpen] = useState(false);

  if (isLoading)
    return (
      <div className={styles.status}>
        <Skeleton
          lines={8}
          widths={["20%", "80%", "20%", "80%", "20%", "80%", "20%", "80%"]}
          ariaLabel="Caricamento tabella spoglio"
        />
      </div>
    );

  return (
    <div className={styles.root}>
      {/* ─── Toolbar ─────────────────────────────────────────────────────── */}
      <div className={styles.toolbar}>
        <div className={styles.filters}>
          <input
            className={styles.searchInput}
            type="search"
            placeholder="Cerca elemento…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="breakdown-table-search"
          />
          <div className={styles.catChips}>
            {BREAKDOWN_CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                className={[
                  styles.catChip,
                  catFilter.has(cat) ? styles.catChipActive : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => toggleCatFilter(cat)}
                data-testid={`cat-filter-${cat}`}
              >
                {CATEGORY_META[cat].labelIt}
              </button>
            ))}
          </div>
          <select
            className={styles.statusSelect}
            value={statusFilter}
            onChange={(e) => {
              const val = e.target.value as StatusFilter;
              setSelected(new Set());
              setStatusFilter(val);
              void navigate({
                to: ".",
                search: (s) => ({
                  ...s,
                  status: val === "all" ? undefined : val,
                }),
              });
            }}
            data-testid="breakdown-status-filter"
          >
            <option value="all">Tutti gli stati</option>
            <option value="ok">✓ Accepted</option>
            <option value="pending">• Pending</option>
            <option value="stale">⚠ Obsoleti</option>
          </select>
        </div>

        {selected.size > 0 && canEdit && (
          <div className={styles.bulkBar} data-testid="bulk-action-bar">
            <span className={styles.bulkCount}>
              {selected.size} selezionati
            </span>
            <div className={styles.recatWrap} ref={recategorizeMenuRef}>
              <button
                type="button"
                className={styles.bulkBtn}
                onClick={() => setRecatOpen((o) => !o)}
                data-testid="bulk-recategorize-trigger"
              >
                Ricategorizza ▾
              </button>
              {recatOpen && (
                <ContextMenu
                  open
                  anchor={(() => {
                    const el = recategorizeMenuRef.current;
                    const rect = el?.getBoundingClientRect();
                    return rect
                      ? { x: rect.left, y: rect.bottom + 4 }
                      : { x: 0, y: 0 };
                  })()}
                  items={BREAKDOWN_CATEGORIES.map((cat) => ({
                    label: CATEGORY_META[cat].labelIt,
                    onClick: () => {
                      bulkRecategorize(cat);
                      setRecatOpen(false);
                    },
                  }))}
                  onClose={() => setRecatOpen(false)}
                  data-testid="bulk-recategorize-menu"
                />
              )}
            </div>
            <button
              type="button"
              className={[styles.bulkBtn, styles.bulkBtnDestructive].join(" ")}
              onClick={bulkArchive}
              data-testid="bulk-archive-btn"
            >
              Archivia
            </button>
          </div>
        )}
      </div>

      {/* ─── Table ───────────────────────────────────────────────────────── */}
      <div className={styles.tableWrap}>
        <table
          className={styles.table}
          data-testid="project-breakdown-table"
          onContextMenu={(e) => {
            if (!canEdit) return;
            const tr = (e.target as HTMLElement).closest("tr");
            if (!tr) return;
            const id = tr.getAttribute("data-row-id");
            if (!id) return;
            const row = tableData.find((r) => r.id === id);
            if (!row) return;
            e.preventDefault();
            setMenu({ x: e.clientX, y: e.clientY, row });
          }}
        >
          <thead>
            <tr>
              {canEdit && (
                <th className={styles.checkCell}>
                  <input
                    type="checkbox"
                    checked={allChecked}
                    ref={(el) => {
                      if (el) el.indeterminate = someChecked;
                    }}
                    onChange={toggleAll}
                    aria-label="Seleziona tutti"
                    data-testid="select-all-checkbox"
                  />
                </th>
              )}
              <th
                className={[styles.th, styles.sortable].join(" ")}
                onClick={() => onHeaderClick("name")}
              >
                Nome{sortIndicator("name")}
              </th>
              <th
                className={[styles.th, styles.sortable].join(" ")}
                onClick={() => onHeaderClick("category")}
              >
                Categoria{sortIndicator("category")}
              </th>
              <th
                className={[styles.th, styles.sortable].join(" ")}
                onClick={() => onHeaderClick("totalQuantity")}
              >
                Quantità{sortIndicator("totalQuantity")}
              </th>
              <th className={styles.th}>Scene</th>
              {showCastTierCol && <th className={styles.th}>Tier</th>}
              <th className={styles.th}>Origine</th>
              <th className={styles.th}>Stato</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td
                  colSpan={(canEdit ? 1 : 0) + 6 + (showCastTierCol ? 1 : 0)}
                  className={styles.emptyCell}
                >
                  Nessun elemento trovato.
                </td>
              </tr>
            )}
            {sorted.map((row) => (
              <tr
                key={row.id}
                data-row-id={row.id}
                className={[
                  styles.tr,
                  selected.has(row.id) ? styles.trSelected : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {canEdit && (
                  <td className={styles.checkCell}>
                    <input
                      type="checkbox"
                      checked={selected.has(row.id)}
                      onChange={() => toggleRow(row.id)}
                      aria-label={`Seleziona ${row.name}`}
                    />
                  </td>
                )}
                <td className={styles.td}>
                  {canEdit ? (
                    <EditableCell
                      type="text"
                      value={row.name}
                      onCommit={(v) => commitName(row.id, v)}
                      maxLength={200}
                      renderDisplay={(v) => {
                        const meta = CATEGORY_META[row.category];
                        return (
                          <Tag
                            colorToken={meta.colorToken}
                            icon={meta.icon}
                            name={v}
                          />
                        );
                      }}
                      data-testid={`cell-name-${row.id}`}
                    />
                  ) : (
                    <Tag
                      colorToken={CATEGORY_META[row.category].colorToken}
                      icon={CATEGORY_META[row.category].icon}
                      name={row.name}
                    />
                  )}
                </td>
                <td className={styles.td}>
                  {canEdit ? (
                    <EditableCell
                      type="select"
                      value={row.category}
                      options={CATEGORY_OPTIONS}
                      onCommit={(v) => commitCategory(row.id, v)}
                      data-testid={`cell-category-${row.id}`}
                    />
                  ) : (
                    CATEGORY_META[row.category].labelIt
                  )}
                </td>
                <td className={[styles.td, styles.tdNum].join(" ")}>
                  {row.totalQuantity}
                </td>
                <td className={styles.td}>
                  <SceneList numbers={row.sceneNumbers} />
                </td>
                {showCastTierCol && (
                  <td className={styles.td}>
                    {canEdit ? (
                      <EditableCell
                        type="select"
                        value={row.castTier ?? ""}
                        options={castTierOptions}
                        onCommit={(v) => commitCastTier(row.id, v)}
                        data-testid={`cell-cast-tier-${row.id}`}
                      />
                    ) : row.castTier ? (
                      (CAST_TIER_META[row.castTier as CastTier]?.labelIt ?? "—")
                    ) : (
                      "—"
                    )}
                  </td>
                )}
                <td className={[styles.td, styles.mutedText].join(" ")}>
                  <SourceBadge source={row._raw.latestSource} />
                </td>
                <td className={styles.td}>
                  <StatusDot status={row.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ─── Context menu ────────────────────────────────────────────────── */}
      {menu && (
        <ContextMenu
          open
          anchor={{ x: menu.x, y: menu.y }}
          items={[
            {
              label: "Archivia",
              onClick: () => {
                void confirm({
                  title: "Archiviare elemento?",
                  message: "Archiviare questo elemento?",
                  confirmLabel: "Archivia",
                  destructive: true,
                }).then((ok) => {
                  if (ok) archive.mutate({ elementId: menu.row.id });
                });
              },
            },
          ]}
          onClose={() => setMenu(null)}
          data-testid="project-breakdown-row-menu"
        />
      )}
    </div>
  );
}

function StatusDot({ status }: { status: ElementStatus }) {
  if (status === "stale")
    return (
      <span
        className={styles.staleIndicator}
        title="Alcune scene sono cambiate"
      >
        ⚠
      </span>
    );
  if (status === "pending")
    return (
      <span className={styles.pendingIndicator} title="In attesa di conferma">
        •
      </span>
    );
  return (
    <span className={styles.okIndicator} title="Accettato">
      ✓
    </span>
  );
}

const SOURCE_LABEL: Record<string, string> = {
  regex: "Regex",
  cesare: "Cesare",
  manual: "Manuale",
};

function SourceBadge({ source }: { source: string | null }) {
  if (!source) return <span className={styles.mutedText}>—</span>;
  return <span>{SOURCE_LABEL[source] ?? source}</span>;
}

function SceneList({ numbers }: { numbers: number[] }) {
  if (numbers.length === 0) return <span className={styles.mutedText}>—</span>;
  if (numbers.length <= 5) return <span>{numbers.join(", ")}</span>;
  const shown = numbers.slice(0, 5);
  const rest = numbers.length - 5;
  return (
    <span title={numbers.join(", ")}>
      {shown.join(", ")} <span className={styles.mutedText}>+{rest}</span>
    </span>
  );
}
