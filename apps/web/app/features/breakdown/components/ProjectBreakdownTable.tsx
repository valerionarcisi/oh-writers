import { useMemo, useState, type MouseEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { DataTable, Tag, ContextMenu, type Column } from "@oh-writers/ui";
import { CATEGORY_META } from "@oh-writers/domain";
import {
  projectBreakdownOptions,
  useArchiveBreakdownElement,
  useUpdateBreakdownElement,
} from "../hooks/useBreakdown";
import type { ProjectBreakdownRow } from "../server/breakdown.server";
import styles from "./ProjectBreakdownTable.module.css";

interface Props {
  projectId: string;
  versionId: string;
  canEdit: boolean;
}

interface TableRow {
  id: string;
  name: string;
  category: string;
  totalQuantity: number;
  scenes: string;
  hasStale: boolean;
  _raw: ProjectBreakdownRow;
}

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
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    row: TableRow;
  } | null>(null);

  const tableData: TableRow[] = useMemo(
    () =>
      rows.map((r) => ({
        id: r.element.id,
        name: r.element.name,
        category: CATEGORY_META[r.element.category].labelIt,
        totalQuantity: r.totalQuantity,
        scenes: r.scenesPresent
          .map((s) => s.sceneNumber)
          .sort((a, b) => a - b)
          .join(", "),
        hasStale: r.hasStale,
        _raw: r,
      })),
    [rows],
  );

  const onRowContextMenu = (e: MouseEvent<HTMLTableSectionElement>) => {
    if (!canEdit) return;
    const target = (e.target as HTMLElement).closest("tr");
    if (!target) return;
    const id = target.getAttribute("data-row-id");
    if (!id) return;
    const row = tableData.find((r) => r.id === id);
    if (!row) return;
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, row });
  };

  const columns: Column<TableRow>[] = [
    {
      key: "name",
      header: "Nome",
      sortable: true,
      render: (row) => {
        const meta = CATEGORY_META[row._raw.element.category];
        return (
          <span className={row.hasStale ? styles.staleCell : ""}>
            <Tag
              colorToken={meta.colorToken}
              icon={meta.icon}
              name={row.name}
            />
          </span>
        );
      },
    },
    { key: "category", header: "Categoria", sortable: true },
    { key: "totalQuantity", header: "Quantità", sortable: true },
    { key: "scenes", header: "Scene" },
  ];

  if (isLoading) return <p className={styles.status}>Caricamento…</p>;

  return (
    <div onContextMenu={onRowContextMenu}>
      <DataTable
        data={tableData}
        columns={columns}
        rowKey={(r) => r.id}
        emptyMessage="Nessun elemento nel breakdown del progetto."
        data-testid="project-breakdown-table"
      />
      {menu && (
        <ContextMenu
          open
          anchor={{ x: menu.x, y: menu.y }}
          items={[
            {
              label: "Rinomina",
              onClick: () => {
                const next = window.prompt("Nuovo nome", menu.row.name);
                if (next && next.trim().length > 0 && next !== menu.row.name) {
                  update.mutate({
                    elementId: menu.row.id,
                    patch: { name: next.trim() },
                  });
                }
              },
            },
            {
              label: "Archivia",
              onClick: () => {
                if (!window.confirm("Archiviare questo elemento?")) return;
                archive.mutate({ elementId: menu.row.id });
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
