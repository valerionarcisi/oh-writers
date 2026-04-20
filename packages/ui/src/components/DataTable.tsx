import { useMemo, useState, type ReactNode } from "react";
import styles from "./DataTable.module.css";

export interface Column<T> {
  key: keyof T;
  header: string;
  sortable?: boolean;
  render?: (row: T) => ReactNode;
  width?: string;
}

export interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  emptyMessage?: ReactNode;
  className?: string;
  "data-testid"?: string;
}

type SortState<T> = { key: keyof T; dir: "asc" | "desc" } | null;

export function DataTable<T>({
  data,
  columns,
  rowKey,
  onRowClick,
  emptyMessage,
  className,
  ...rest
}: DataTableProps<T>) {
  const [sort, setSort] = useState<SortState<T>>(null);

  const sorted = useMemo(() => {
    if (!sort) return data;
    const arr = [...data];
    arr.sort((a, b) => {
      const av = a[sort.key];
      const bv = b[sort.key];
      if (av === bv) return 0;
      const cmp =
        (av as unknown as number | string) > (bv as unknown as number | string)
          ? 1
          : -1;
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [data, sort]);

  const onHeaderClick = (col: Column<T>) => {
    if (!col.sortable) return;
    setSort((prev) =>
      prev?.key === col.key
        ? { key: col.key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key: col.key, dir: "asc" },
    );
  };

  const tableClasses = [styles.table, className ?? ""]
    .filter(Boolean)
    .join(" ");

  return (
    <table className={tableClasses} data-testid={rest["data-testid"]}>
      <thead>
        <tr>
          {columns.map((c) => {
            const ariaSort: "ascending" | "descending" | "none" =
              sort?.key === c.key
                ? sort.dir === "asc"
                  ? "ascending"
                  : "descending"
                : "none";
            return (
              <th
                key={String(c.key)}
                style={c.width ? { inlineSize: c.width } : undefined}
                onClick={() => onHeaderClick(c)}
                className={c.sortable ? styles.sortable : undefined}
                aria-sort={c.sortable ? ariaSort : undefined}
                scope="col"
              >
                {c.header}
                {sort?.key === c.key && (
                  <span aria-hidden> {sort.dir === "asc" ? "▲" : "▼"}</span>
                )}
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {sorted.length === 0 && emptyMessage ? (
          <tr>
            <td className={styles.empty} colSpan={columns.length}>
              {emptyMessage}
            </td>
          </tr>
        ) : (
          sorted.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={onRowClick ? styles.clickable : undefined}
            >
              {columns.map((c) => (
                <td key={String(c.key)}>
                  {c.render ? c.render(row) : String(row[c.key] ?? "")}
                </td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
