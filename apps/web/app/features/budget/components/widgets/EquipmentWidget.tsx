import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { BudgetLine } from "~/features/budget/server/budget.server";
import { updateBudgetLine } from "~/features/budget/server/budget.server";
import { unwrapResult } from "@oh-writers/utils";
import { BudgetGauge } from "./BudgetGauge";
import styles from "./EquipmentWidget.module.css";

interface EquipmentWidgetProps {
  lines: BudgetLine[];
  grandTotal: number;
  projectId: string;
}

function EditableCell({
  value,
  onCommit,
}: {
  value: number | null;
  onCommit: (v: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value ?? ""));

  const commit = () => {
    setEditing(false);
    const n = parseFloat(draft);
    if (!isNaN(n) && n >= 0) onCommit(n);
  };

  if (editing) {
    return (
      <input
        className={styles.cellInput}
        type="number"
        value={draft}
        autoFocus
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(false);
        }}
      />
    );
  }

  return (
    <button
      type="button"
      className={styles.cellButton}
      onClick={() => {
        setDraft(String(value ?? ""));
        setEditing(true);
      }}
    >
      {value !== null ? value.toLocaleString("it-IT") : "—"}
    </button>
  );
}

import { useState } from "react";

const fmt = (n: number) =>
  n.toLocaleString("it-IT", { style: "currency", currency: "EUR" });

const lineTotal = (l: BudgetLine) =>
  l.actual ?? (l.rate ?? 0) * (l.quantity ?? 1);

export function EquipmentWidget({
  lines,
  grandTotal,
  projectId,
}: EquipmentWidgetProps) {
  const qc = useQueryClient();

  const widgetTotal = lines.reduce((sum, l) => sum + lineTotal(l), 0);

  const patchMutation = useMutation({
    mutationFn: (vars: {
      lineId: string;
      patch: {
        actual?: number | null;
        rate?: number | null;
        quantity?: number | null;
      };
    }) => updateBudgetLine({ data: vars }).then(unwrapResult),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["budget", projectId] }),
  });

  if (lines.length === 0) {
    return (
      <div className={styles.widget}>
        <div className={styles.header}>
          <h3 className={styles.title}>Attrezzatura & Location</h3>
        </div>
        <p className={styles.empty}>
          Genera il budget per popolare le voci attrezzatura.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.widget}>
      <div className={styles.header}>
        <BudgetGauge
          value={widgetTotal}
          max={grandTotal}
          color="var(--color-equipment, #f59e0b)"
          label={fmt(widgetTotal)}
        />
        <h3 className={styles.title}>Attrezzatura & Location</h3>
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr className={styles.thead}>
              <th className={styles.th}>Voce</th>
              <th className={`${styles.th} ${styles.numTh}`}>Qtà</th>
              <th className={`${styles.th} ${styles.numTh}`}>Tariffa</th>
              <th className={`${styles.th} ${styles.numTh}`}>Effettivo</th>
              <th className={`${styles.th} ${styles.numTh}`}>Totale</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id} className={styles.row}>
                <td className={`${styles.cell} ${styles.nameCell}`}>
                  {line.name}
                </td>
                <td className={styles.cell}>
                  <EditableCell
                    value={line.quantity}
                    onCommit={(v) =>
                      patchMutation.mutate({
                        lineId: line.id,
                        patch: { quantity: v },
                      })
                    }
                  />
                </td>
                <td className={styles.cell}>
                  <EditableCell
                    value={line.rate}
                    onCommit={(v) =>
                      patchMutation.mutate({
                        lineId: line.id,
                        patch: { rate: v },
                      })
                    }
                  />
                </td>
                <td className={styles.cell}>
                  <EditableCell
                    value={line.actual}
                    onCommit={(v) =>
                      patchMutation.mutate({
                        lineId: line.id,
                        patch: { actual: v },
                      })
                    }
                  />
                </td>
                <td className={`${styles.cell} ${styles.totalCell}`}>
                  {fmt(lineTotal(line))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
