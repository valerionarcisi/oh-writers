import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { unwrapResult } from "@oh-writers/utils";
import type { BudgetLine } from "@oh-writers/domain";
import { updateBudgetLine } from "~/features/budget/server/budget.server";
import styles from "./CategoryLineWidget.module.css";

const fmt = (n: number) =>
  n.toLocaleString("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  });

const lineEffective = (l: BudgetLine): number =>
  l.actual ?? (l.rate ?? 0) * (l.quantity ?? 1);

interface CategoryLineWidgetProps {
  icon: string;
  title: string;
  line: BudgetLine | null;
  elementCount: number;
  projectId: string;
}

export function CategoryLineWidget({
  icon,
  title,
  line,
  elementCount,
  projectId,
}: CategoryLineWidgetProps) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingField, setEditingField] = useState<"rate" | "actual" | null>(
    null,
  );
  const [draft, setDraft] = useState("");

  const patchMutation = useMutation({
    mutationFn: (vars: {
      lineId: string;
      patch: { actual?: number | null; rate?: number | null };
    }) => updateBudgetLine({ data: vars }).then(unwrapResult),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["budget", projectId] });
      setEditingField(null);
    },
  });

  const total = line ? lineEffective(line) : 0;

  const commitField = (field: "rate" | "actual") => {
    if (!line) return;
    const n = parseFloat(draft);
    if (!isNaN(n) && n >= 0) {
      patchMutation.mutate({ lineId: line.id, patch: { [field]: n } });
    } else {
      setEditingField(null);
    }
  };

  return (
    <div className={styles.widget}>
      <div className={styles.header} onClick={() => setOpen((p) => !p)}>
        <div className={styles.headerLeft}>
          <span className={styles.icon}>{icon}</span>
          <span className={styles.title}>{title}</span>
          {elementCount > 0 && (
            <span className={styles.badge}>{elementCount} elementi</span>
          )}
        </div>
        <div className={styles.headerRight}>
          <span className={styles.total}>{fmt(total)}</span>
          <span className={`${styles.arrow} ${open ? styles.open : ""}`}>
            ▾
          </span>
        </div>
      </div>

      {open && (
        <div className={styles.body}>
          {!line ? (
            <p className={styles.aiHint}>
              Genera il budget per popolare questa sezione.
            </p>
          ) : (
            <div className={styles.row}>
              <span className={styles.rowLabel}>
                {elementCount} {elementCount === 1 ? "elemento" : "elementi"}{" "}
                dal breakdown
              </span>
              <div className={styles.fieldGroup}>
                <span>Tariffa</span>
                {editingField === "rate" ? (
                  <input
                    className={styles.cellInput}
                    type="number"
                    min="0"
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => commitField("rate")}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitField("rate");
                      if (e.key === "Escape") setEditingField(null);
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className={styles.cellBtn}
                    onClick={() => {
                      setDraft(String(line.rate ?? ""));
                      setEditingField("rate");
                    }}
                  >
                    {line.rate !== null ? fmt(line.rate) : "—"}
                  </button>
                )}
              </div>
              <div className={styles.fieldGroup}>
                <span>Effettivo</span>
                {editingField === "actual" ? (
                  <input
                    className={styles.cellInput}
                    type="number"
                    min="0"
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => commitField("actual")}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitField("actual");
                      if (e.key === "Escape") setEditingField(null);
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className={styles.cellBtn}
                    onClick={() => {
                      setDraft(String(line.actual ?? ""));
                      setEditingField("actual");
                    }}
                  >
                    {line.actual !== null ? fmt(line.actual) : "—"}
                  </button>
                )}
              </div>
              <span className={styles.rowTotal}>{fmt(total)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
