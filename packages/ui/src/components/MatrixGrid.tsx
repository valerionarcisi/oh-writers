import { type ReactNode, type CSSProperties } from "react";
import styles from "./MatrixGrid.module.css";

export interface MatrixColumn {
  id: string;
  label: string;
  sublabel?: string;
}

export type MatrixRow =
  | { type: "group"; id: string; label: string }
  | { type: "element"; id: string; label: string };

export interface MatrixGridProps {
  rows: MatrixRow[];
  columns: MatrixColumn[];
  renderCell: (rowId: string, colId: string) => ReactNode;
  heatmap?: boolean;
  getHeatValue?: (rowId: string, colId: string) => number;
  firstColumnWidth?: number;
  columnWidth?: number;
  rowHeight?: number;
  compact?: boolean;
  "data-testid"?: string;
}

export function MatrixGrid({
  rows,
  columns,
  renderCell,
  heatmap,
  getHeatValue,
  firstColumnWidth = 180,
  columnWidth = 72,
  rowHeight = 36,
  compact = false,
  "data-testid": testId,
}: MatrixGridProps) {
  return (
    <div
      className={styles.wrapper}
      data-compact={compact ? "true" : undefined}
      data-testid={testId}
    >
      <table className={styles.table}>
        <thead>
          <tr>
            <th
              className={styles.cornerCell}
              style={{ minWidth: firstColumnWidth, width: firstColumnWidth }}
            />
            {columns.map((col) => (
              <th
                key={col.id}
                className={styles.colHeader}
                style={{ minWidth: columnWidth, width: columnWidth }}
                title={col.label}
              >
                <span className={styles.colHeaderLabel}>{col.label}</span>
                {col.sublabel && (
                  <span className={styles.colHeaderSublabel}>
                    {col.sublabel}
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            if (row.type === "group") {
              return (
                <tr key={row.id} className={styles.groupRow}>
                  <td colSpan={columns.length + 1} className={styles.groupCell}>
                    {row.label}
                  </td>
                </tr>
              );
            }

            return (
              <tr
                key={row.id}
                className={styles.elementRow}
                style={{ height: rowHeight }}
              >
                <td
                  className={styles.rowHeader}
                  style={{
                    minWidth: firstColumnWidth,
                    width: firstColumnWidth,
                  }}
                  title={row.label}
                >
                  <span className={styles.rowHeaderLabel}>{row.label}</span>
                </td>
                {columns.map((col) => {
                  const heat =
                    heatmap && getHeatValue
                      ? getHeatValue(row.id, col.id)
                      : null;
                  const cellStyle: CSSProperties =
                    heat != null && heat > 0
                      ? ({ "--heat": heat } as CSSProperties)
                      : {};
                  return (
                    <td
                      key={col.id}
                      className={styles.cell}
                      style={cellStyle}
                      data-heat={heat != null && heat > 0 ? "true" : undefined}
                    >
                      {renderCell(row.id, col.id)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
