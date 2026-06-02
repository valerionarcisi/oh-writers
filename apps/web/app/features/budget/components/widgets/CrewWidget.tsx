import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { resourceTotal, CREW_DEPARTMENTS } from "@oh-writers/domain";
import type { FiscalRegime, TranslationKey } from "@oh-writers/domain";
import type { BudgetCrew } from "~/features/budget/server/budget.server";
import {
  updateBudgetCrewRow,
  addBudgetCrewRow,
  removeBudgetCrewRow,
} from "~/features/budget/server/budget.server";
import { unwrapResult } from "@oh-writers/utils";
import { useTranslation } from "~/features/i18n";
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

const DEPT_LABEL_KEYS: Record<string, TranslationKey> = {
  regia: "budget.dept.regia",
  fotografia: "budget.dept.fotografia",
  suono: "budget.dept.suono",
  arte: "budget.dept.arte",
  costumi: "budget.dept.costumi",
  trucco: "budget.dept.trucco",
  produzione: "budget.dept.produzione",
};

export function CrewWidget({
  crew,
  budgetId,
  grandTotal,
  projectId,
}: CrewWidgetProps) {
  const { t } = useTranslation();
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
        <h3 className={styles.title}>{t("budget.crew.title")}</h3>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr className={styles.thead}>
              <th
                className={styles.th}
                aria-label={t("budget.crew.colActive")}
              />
              <th className={styles.th}>{t("budget.crew.colRole")}</th>
              <th className={`${styles.th} ${styles.numTh}`}>
                {t("budget.crew.colDays")}
              </th>
              <th className={`${styles.th} ${styles.numTh}`}>
                {t("budget.crew.colDayRate")}
              </th>
              <th className={styles.th}>{t("budget.crew.colRegime")}</th>
              <th className={`${styles.th} ${styles.numTh}`}>
                {t("budget.crew.colMeal")}
              </th>
              <th className={`${styles.th} ${styles.numTh}`}>
                {t("budget.crew.colAccommodation")}
              </th>
              <th className={`${styles.th} ${styles.numTh}`}>
                {t("budget.crew.colTotal")}
              </th>
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
                      {DEPT_LABEL_KEYS[dept] ? t(DEPT_LABEL_KEYS[dept]!) : dept}
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
                    {t("budget.crew.customRoles")}
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
              placeholder={t("budget.crew.roleNamePlaceholder")}
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
                  {DEPT_LABEL_KEYS[d] ? t(DEPT_LABEL_KEYS[d]!) : d}
                </option>
              ))}
              <option value="custom">{t("budget.crew.customOption")}</option>
            </select>
            <button type="submit" className={styles.addConfirm}>
              {t("budget.form.add")}
            </button>
            <button
              type="button"
              className={styles.addCancel}
              onClick={() => setAddOpen(false)}
            >
              {t("budget.form.cancel")}
            </button>
          </form>
        ) : (
          <button
            type="button"
            className={styles.addTrigger}
            onClick={() => setAddOpen(true)}
          >
            {t("budget.crew.addRole")}
          </button>
        )}
      </div>
    </div>
  );
}
