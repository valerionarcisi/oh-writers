import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Rows3 } from "lucide-react";
import { MatrixGrid, type MatrixRow, type MatrixColumn } from "@oh-writers/ui";
import { BREAKDOWN_CATEGORIES, CATEGORY_META } from "@oh-writers/domain";
import {
  projectBreakdownOptions,
  useAddBreakdownOccurrence,
  useRemoveBreakdownOccurrence,
} from "../hooks/useBreakdown";
import type {
  BreakdownSceneSummary,
  ProjectBreakdownRow,
} from "../server/breakdown.server";
import styles from "./BreakdownMatrix.module.css";

interface Props {
  projectId: string;
  versionId: string;
  scenes: BreakdownSceneSummary[];
  canEdit: boolean;
}

// ─── Cell display ─────────────────────────────────────────────────────────────

function CellContent({ qty }: { qty: number | null }) {
  if (!qty) return <span className={styles.cellEmpty}>·</span>;
  if (qty === 1) return <span className={styles.cellPresent}>✓</span>;
  return <span className={styles.cellQty}>{qty}</span>;
}

// ─── Cell popover for editing ─────────────────────────────────────────────────

interface CellPopoverProps {
  elementId: string;
  sceneId: string;
  versionId: string;
  projectId: string;
  occurrenceId: string | null;
  currentQty: number | null;
  onClose: () => void;
}

function CellPopover({
  elementId,
  sceneId,
  versionId,
  projectId,
  occurrenceId,
  currentQty,
  onClose,
}: CellPopoverProps) {
  const [qty, setQty] = useState(currentQty ?? 1);
  const addOcc = useAddBreakdownOccurrence();
  const removeOcc = useRemoveBreakdownOccurrence();

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (qty < 1) return;
    addOcc.mutate(
      {
        projectId,
        elementId,
        sceneId,
        screenplayVersionId: versionId,
        quantity: qty,
      },
      { onSuccess: onClose },
    );
  };

  const onRemove = () => {
    if (!occurrenceId) return;
    removeOcc.mutate({ projectId, occurrenceId }, { onSuccess: onClose });
  };

  return (
    <div
      className={styles.popover}
      role="dialog"
      aria-label="Modifica presenza"
    >
      <form onSubmit={onSubmit} className={styles.popoverForm}>
        <label className={styles.popoverLabel}>
          Quantità
          <input
            type="number"
            min={1}
            value={qty}
            onChange={(e) => setQty(parseInt(e.target.value, 10) || 1)}
            className={styles.popoverInput}
            autoFocus
            data-testid="matrix-cell-qty-input"
          />
        </label>
        <div className={styles.popoverActions}>
          {occurrenceId && (
            <button
              type="button"
              className={styles.removeBtn}
              onClick={onRemove}
              disabled={removeOcc.isPending}
              data-testid="matrix-cell-remove"
            >
              Rimuovi
            </button>
          )}
          <button type="button" className={styles.cancelBtn} onClick={onClose}>
            Annulla
          </button>
          <button
            type="submit"
            className={styles.submitBtn}
            disabled={addOcc.isPending}
            data-testid="matrix-cell-submit"
          >
            {currentQty ? "Aggiorna" : "Aggiungi"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function BreakdownMatrix({
  projectId,
  versionId,
  scenes,
  canEdit,
}: Props) {
  const { data: rows = [], isLoading } = useQuery(
    projectBreakdownOptions(projectId, versionId),
  );

  const [heatmap, setHeatmap] = useState(false);
  const [compact, setCompact] = useState(false);
  const [activeCell, setActiveCell] = useState<{
    elementId: string;
    sceneId: string;
  } | null>(null);

  // ─── Build lookup: elementId → sceneId → { qty, occurrenceId } ──────────
  const cellMap = useMemo(() => {
    const map = new Map<
      string,
      Map<string, { qty: number; occurrenceId: string }>
    >();
    for (const row of rows) {
      const byScene = new Map<string, { qty: number; occurrenceId: string }>();
      for (const sp of row.scenesPresent) {
        byScene.set(sp.sceneId, {
          qty: sp.quantity,
          occurrenceId: sp.occurrenceId,
        });
      }
      map.set(row.element.id, byScene);
    }
    return map;
  }, [rows]);

  // ─── Max qty for heatmap normalization ───────────────────────────────────
  const maxQty = useMemo(() => {
    let max = 1;
    for (const byScene of cellMap.values()) {
      for (const { qty } of byScene.values()) {
        if (qty > max) max = qty;
      }
    }
    return max;
  }, [cellMap]);

  // ─── Matrix columns = scenes ─────────────────────────────────────────────
  const columns: MatrixColumn[] = useMemo(
    () =>
      scenes.map((s) => ({
        id: s.id,
        label: s.fountainNumber,
        sublabel:
          s.location.length > 8 ? `${s.location.slice(0, 8)}…` : s.location,
      })),
    [scenes],
  );

  // ─── Matrix rows = group headers + elements ──────────────────────────────
  const matrixRows: MatrixRow[] = useMemo(() => {
    const result: MatrixRow[] = [];
    for (const cat of BREAKDOWN_CATEGORIES) {
      const catRows = rows.filter((r) => r.element.category === cat);
      if (catRows.length === 0) continue;
      result.push({
        type: "group",
        id: `group-${cat}`,
        label: CATEGORY_META[cat].labelIt,
      });
      for (const row of catRows) {
        result.push({
          type: "element",
          id: row.element.id,
          label: row.element.name,
        });
      }
    }
    return result;
  }, [rows]);

  // ─── Resolve active cell data for popover ────────────────────────────────
  const activeCellRow = activeCell
    ? (rows.find((r) => r.element.id === activeCell.elementId) ?? null)
    : null;
  const activeCellEntry =
    activeCell && activeCellRow
      ? (cellMap.get(activeCell.elementId)?.get(activeCell.sceneId) ?? null)
      : null;

  if (isLoading) return <p className={styles.status}>Caricamento…</p>;
  if (rows.length === 0)
    return (
      <p className={styles.status}>
        Nessun elemento nel breakdown. Avvia lo spoglio per popolare la matrice.
      </p>
    );

  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <button
          type="button"
          className={[styles.heatmapBtn, heatmap ? styles.heatmapBtnActive : ""]
            .filter(Boolean)
            .join(" ")}
          onClick={() => setHeatmap((h) => !h)}
          data-testid="matrix-heatmap-toggle"
        >
          Heatmap
        </button>
        <button
          type="button"
          className={[
            styles.compactBtn,
            compact ? styles.compactBtnActive : "",
          ]
            .filter(Boolean)
            .join(" ")}
          onClick={() => setCompact((c) => !c)}
          title="Vista compatta"
          aria-pressed={compact}
          data-testid="matrix-compact-toggle"
        >
          <Rows3 size={16} aria-hidden />
        </button>
      </div>

      <div className={styles.gridWrap}>
        <MatrixGrid
          rows={matrixRows}
          columns={columns}
          heatmap={heatmap}
          compact={compact}
          getHeatValue={(rowId, colId) => {
            const entry = cellMap.get(rowId)?.get(colId);
            return entry ? entry.qty / maxQty : 0;
          }}
          renderCell={(rowId, colId) => {
            const entry = cellMap.get(rowId)?.get(colId);
            const isActive =
              activeCell?.elementId === rowId && activeCell?.sceneId === colId;
            return (
              <button
                type="button"
                className={[
                  styles.cellBtn,
                  isActive ? styles.cellBtnActive : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => {
                  if (!canEdit) return;
                  setActiveCell(
                    isActive ? null : { elementId: rowId, sceneId: colId },
                  );
                }}
                data-testid={`matrix-cell-${rowId}-${colId}`}
              >
                <CellContent qty={entry?.qty ?? null} />
              </button>
            );
          }}
          data-testid="breakdown-matrix-grid"
        />
      </div>

      {activeCell && canEdit && (
        <div
          className={styles.popoverOverlay}
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) setActiveCell(null);
          }}
        >
          <CellPopover
            elementId={activeCell.elementId}
            sceneId={activeCell.sceneId}
            versionId={versionId}
            projectId={projectId}
            occurrenceId={activeCellEntry?.occurrenceId ?? null}
            currentQty={activeCellEntry?.qty ?? null}
            onClose={() => setActiveCell(null)}
          />
        </div>
      )}
    </div>
  );
}
