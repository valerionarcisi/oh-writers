import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { resourceTotal, CREW_DEPARTMENTS } from "@oh-writers/domain";
import type { FiscalRegime } from "@oh-writers/domain";
import type { BudgetCrew } from "~/features/budget/server/budget.server";
import {
  updateBudgetCrewRow,
  addBudgetCrewRow,
  removeBudgetCrewRow,
} from "~/features/budget/server/budget.server";
import { unwrapResult } from "@oh-writers/utils";
import { BudgetGauge } from "./BudgetGauge";
import { BudgetResourceRow } from "../BudgetResourceRow";
import styles from "./CrewWidget.module.css";

interface CrewWidgetProps {
  crew: BudgetCrew[];
  budgetId: string;
  grandTotal: number;
  projectId: string;
}

const parseNum = (v: string) => Number(v);

const DEPT_LABELS: Record<string, string> = {
  regia: "Regia",
  fotografia: "Fotografia",
  suono: "Suono",
  arte: "Arte",
  costumi: "Costumi",
  trucco: "Trucco",
  produzione: "Produzione",
};

export function CrewWidget({
  crew,
  budgetId,
  grandTotal,
  projectId,
}: CrewWidgetProps) {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDept, setNewDept] = useState<string>(CREW_DEPARTMENTS[0]);

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["budget-cast-crew", projectId] });

  const patchMutation = useMutation({
    mutationFn: (vars: {
      rowId: string;
      patch: Parameters<typeof updateBudgetCrewRow>[0]["data"]["patch"];
    }) => updateBudgetCrewRow({ data: vars }).then(unwrapResult),
    onSuccess: invalidate,
  });

  const addMutation = useMutation({
    mutationFn: (vars: { name: string; department: string }) =>
      addBudgetCrewRow({
        data: { budgetId, name: vars.name, department: vars.department },
      }).then(unwrapResult),
    onSuccess: () => {
      invalidate();
      setAddOpen(false);
      setNewName("");
    },
  });

  const removeMutation = useMutation({
    mutationFn: (rowId: string) =>
      removeBudgetCrewRow({ data: { rowId } }).then(unwrapResult),
    onSuccess: invalidate,
  });

  const enabledCrew = crew.filter((r) => r.enabled);
  const crewTotal = enabledCrew.reduce(
    (sum, r) =>
      sum +
      resourceTotal({
        days: parseNum(r.days),
        dayRate: parseNum(r.dayRate),
        fiscalRegime: r.fiscalRegime as FiscalRegime,
        mealAllowance: parseNum(r.mealAllowance),
        accommodation: parseNum(r.accommodation),
      }),
    0,
  );

  const fmt = (n: number) =>
    n.toLocaleString("it-IT", { style: "currency", currency: "EUR" });

  const departments = CREW_DEPARTMENTS.filter((dept) =>
    crew.some((r) => r.department === dept),
  );
  const customRows = crew.filter(
    (r) =>
      !CREW_DEPARTMENTS.includes(
        r.department as (typeof CREW_DEPARTMENTS)[number],
      ),
  );

  return (
    <div className={styles.widget}>
      <div className={styles.header}>
        <BudgetGauge
          value={crewTotal}
          max={grandTotal}
          color="var(--color-crew, #10b981)"
          label={fmt(crewTotal)}
        />
        <h3 className={styles.title}>Troupe</h3>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr className={styles.thead}>
              <th className={styles.th} aria-label="Attivo" />
              <th className={styles.th}>Ruolo</th>
              <th className={`${styles.th} ${styles.numTh}`}>Gg</th>
              <th className={`${styles.th} ${styles.numTh}`}>€/g</th>
              <th className={styles.th}>Regime</th>
              <th className={`${styles.th} ${styles.numTh}`}>Vitto</th>
              <th className={`${styles.th} ${styles.numTh}`}>Pernotto</th>
              <th className={`${styles.th} ${styles.numTh}`}>Totale</th>
              <th className={styles.th} />
            </tr>
          </thead>
          <tbody>
            {departments.map((dept) => {
              const deptRows = crew.filter((r) => r.department === dept);
              return (
                <>
                  <tr key={`dept-${dept}`} className={styles.deptRow}>
                    <td colSpan={9} className={styles.deptCell}>
                      {DEPT_LABELS[dept] ?? dept}
                    </td>
                  </tr>
                  {deptRows.map((row) => (
                    <BudgetResourceRow
                      key={row.id}
                      id={row.id}
                      name={row.name}
                      days={parseNum(row.days)}
                      dayRate={parseNum(row.dayRate)}
                      fiscalRegime={row.fiscalRegime as FiscalRegime}
                      mealAllowance={parseNum(row.mealAllowance)}
                      accommodation={parseNum(row.accommodation)}
                      enabled={row.enabled}
                      showEnabled
                      onPatch={(patch) =>
                        patchMutation.mutate({ rowId: row.id, patch })
                      }
                    />
                  ))}
                </>
              );
            })}
            {customRows.length > 0 && (
              <>
                <tr className={styles.deptRow}>
                  <td colSpan={9} className={styles.deptCell}>
                    Ruoli custom
                  </td>
                </tr>
                {customRows.map((row) => (
                  <BudgetResourceRow
                    key={row.id}
                    id={row.id}
                    name={row.name}
                    days={parseNum(row.days)}
                    dayRate={parseNum(row.dayRate)}
                    fiscalRegime={row.fiscalRegime as FiscalRegime}
                    mealAllowance={parseNum(row.mealAllowance)}
                    accommodation={parseNum(row.accommodation)}
                    enabled={row.enabled}
                    showEnabled
                    onPatch={(patch) =>
                      patchMutation.mutate({ rowId: row.id, patch })
                    }
                    onRemove={() => removeMutation.mutate(row.id)}
                  />
                ))}
              </>
            )}
          </tbody>
        </table>
      </div>

      <div className={styles.footer}>
        {addOpen ? (
          <form
            className={styles.addForm}
            onSubmit={(e) => {
              e.preventDefault();
              if (newName.trim())
                addMutation.mutate({
                  name: newName.trim(),
                  department: newDept,
                });
            }}
          >
            <input
              className={styles.addInput}
              placeholder="Nome ruolo"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              autoFocus
            />
            <select
              className={styles.addSelect}
              value={newDept}
              onChange={(e) => setNewDept(e.target.value)}
            >
              {CREW_DEPARTMENTS.map((d) => (
                <option key={d} value={d}>
                  {DEPT_LABELS[d] ?? d}
                </option>
              ))}
              <option value="custom">Custom</option>
            </select>
            <button type="submit" className={styles.addConfirm}>
              Aggiungi
            </button>
            <button
              type="button"
              className={styles.addCancel}
              onClick={() => setAddOpen(false)}
            >
              Annulla
            </button>
          </form>
        ) : (
          <button
            type="button"
            className={styles.addTrigger}
            onClick={() => setAddOpen(true)}
          >
            + Aggiungi ruolo
          </button>
        )}
      </div>
    </div>
  );
}
