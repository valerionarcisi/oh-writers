import { useEffect, useMemo, useState } from "react";
import { buildSideBySideDiff } from "@oh-writers/utils";
import type { DiffRow, DiffSegment } from "@oh-writers/utils";
import styles from "./VersionCompareModal.module.css";

export interface VersionCompareItem {
  id: string;
  number: number;
  label: string | null;
  content: string;
}

interface VersionCompareModalProps {
  versions: readonly VersionCompareItem[];
  initialLeftId?: string | null;
  initialRightId?: string | null;
  onClose: () => void;
}

const displayLabel = (v: VersionCompareItem) =>
  v.label && v.label.length > 0
    ? `${v.label} (v${v.number})`
    : `VERSION-${v.number}`;

export function VersionCompareModal({
  versions,
  initialLeftId,
  initialRightId,
  onClose,
}: VersionCompareModalProps) {
  const sorted = useMemo(
    () => [...versions].sort((a, b) => b.number - a.number),
    [versions],
  );
  const fallbackLeft = sorted[1]?.id ?? sorted[0]?.id ?? null;
  const fallbackRight = sorted[0]?.id ?? null;
  const [leftId, setLeftId] = useState<string | null>(
    initialLeftId ?? fallbackLeft,
  );
  const [rightId, setRightId] = useState<string | null>(
    initialRightId ?? fallbackRight,
  );

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const left = sorted.find((v) => v.id === leftId) ?? null;
  const right = sorted.find((v) => v.id === rightId) ?? null;

  const rows: DiffRow[] = useMemo(
    () =>
      left && right ? buildSideBySideDiff(left.content, right.content) : [],
    [left, right],
  );

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label="Compare versions"
      data-testid="version-compare-modal"
      onClick={onClose}
    >
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <header className={styles.header}>
          <h2 className={styles.title}>Compare versions</h2>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close"
            data-testid="version-compare-close"
          >
            ✕
          </button>
        </header>
        <div className={styles.selectors}>
          <label className={styles.selectorGroup}>
            <span className={styles.selectorLabel}>Left</span>
            <select
              className={styles.select}
              value={leftId ?? ""}
              onChange={(e) => setLeftId(e.target.value)}
              data-testid="version-compare-left"
            >
              {sorted.map((v) => (
                <option key={v.id} value={v.id}>
                  {displayLabel(v)}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.selectorGroup}>
            <span className={styles.selectorLabel}>Right</span>
            <select
              className={styles.select}
              value={rightId ?? ""}
              onChange={(e) => setRightId(e.target.value)}
              data-testid="version-compare-right"
            >
              {sorted.map((v) => (
                <option key={v.id} value={v.id}>
                  {displayLabel(v)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className={styles.diff} data-testid="version-compare-diff">
          {!left || !right ? (
            <p className={styles.empty}>Select two versions to compare.</p>
          ) : rows.length === 0 ? (
            <p className={styles.empty}>No differences.</p>
          ) : (
            <table className={styles.table}>
              <tbody>
                {rows.map((row, i) => (
                  <DiffRowView key={i} row={row} />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function DiffRowView({ row }: { row: DiffRow }) {
  const leftClass = `${styles.cell} ${styles[`cell-${row.kind}`] ?? ""}`;
  const rightClass = leftClass;
  return (
    <tr>
      <td className={leftClass}>{renderSegments(row.left)}</td>
      <td className={rightClass}>{renderSegments(row.right)}</td>
    </tr>
  );
}

function renderSegments(segments: readonly DiffSegment[] | null) {
  if (!segments) return <span className={styles.empty}>&nbsp;</span>;
  if (segments.length === 0) return <span>&nbsp;</span>;
  return segments.map((seg, i) => (
    <span
      key={i}
      className={seg.changed ? styles.intra : undefined}
      data-diff-changed={seg.changed || undefined}
    >
      {seg.text || "\u00a0"}
    </span>
  ));
}
