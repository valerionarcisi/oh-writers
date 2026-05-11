import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { BudgetLine } from "~/features/budget/server/budget.server";
import { updateBudgetLine } from "~/features/budget/server/budget.server";
import { unwrapResult } from "@oh-writers/utils";
import styles from "./MiscWidget.module.css";

interface MiscWidgetProps {
  lines: BudgetLine[];
  total: number;
  projectId: string;
}

const fmt = (n: number) =>
  n.toLocaleString("it-IT", { style: "currency", currency: "EUR" });

const lineTotal = (l: BudgetLine) =>
  l.actual ?? (l.rate ?? 0) * (l.quantity ?? 1);

export function MiscWidget({ lines, total, projectId }: MiscWidgetProps) {
  const qc = useQueryClient();

  const patchMutation = useMutation({
    mutationFn: (vars: { lineId: string; patch: { actual?: number | null } }) =>
      updateBudgetLine({ data: vars }).then(unwrapResult),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["budget", projectId] }),
  });

  if (lines.length === 0) return null;

  return (
    <div className={styles.widget}>
      <div className={styles.header}>
        <h3 className={styles.title}>Varie ed eventuali</h3>
        <span className={styles.total}>{fmt(total)}</span>
      </div>
      <div className={styles.chips}>
        {lines.map((line) => (
          <ChipLine
            key={line.id}
            line={line}
            onPatch={(actual) =>
              patchMutation.mutate({ lineId: line.id, patch: { actual } })
            }
          />
        ))}
      </div>
    </div>
  );
}

function ChipLine({
  line,
  onPatch,
}: {
  line: BudgetLine;
  onPatch: (actual: number | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(line.actual ?? lineTotal(line)));
  const value = lineTotal(line);

  const commit = () => {
    setEditing(false);
    const n = parseFloat(draft);
    if (!isNaN(n) && n >= 0) onPatch(n);
  };

  return (
    <div className={styles.chip}>
      <span className={styles.chipName}>{line.name}</span>
      {editing ? (
        <input
          className={styles.chipInput}
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
      ) : (
        <button
          type="button"
          className={styles.chipValue}
          onClick={() => {
            setDraft(String(value));
            setEditing(true);
          }}
        >
          {fmt(value)}
        </button>
      )}
    </div>
  );
}
