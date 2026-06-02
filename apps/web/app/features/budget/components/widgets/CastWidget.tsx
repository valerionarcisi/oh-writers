import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { resourceTotal } from "@oh-writers/domain";
import type { FiscalRegime } from "@oh-writers/domain";
import type {
  BudgetCast,
  CastSceneMap,
} from "~/features/budget/server/budget.server";
import {
  updateBudgetCastRow,
  addBudgetCastRow,
  removeBudgetCastRow,
} from "~/features/budget/server/budget.server";
import { unwrapResult } from "@oh-writers/utils";
import { useTranslation } from "~/features/i18n";
import { BudgetGauge } from "./BudgetGauge";
import { BudgetResourceRow } from "../BudgetResourceRow";
import styles from "./CastWidget.module.css";

interface CastWidgetProps {
  cast: BudgetCast[];
  castSceneMap: CastSceneMap;
  selectedScene: number | null;
  grandTotal: number;
  projectId: string;
  budgetId: string;
}

const parseNum = (v: string) => Number(v);

const sceneRatio = (
  rowId: string,
  castSceneMap: CastSceneMap,
  selectedScene: number | null,
): number => {
  if (selectedScene === null) return 1;
  const rowScenes = castSceneMap[rowId] ?? [];
  return rowScenes.length > 0 ? 1 / rowScenes.length : 0;
};

export function CastWidget({
  cast,
  castSceneMap,
  selectedScene,
  grandTotal,
  projectId,
  budgetId,
}: CastWidgetProps) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["budget-cast-crew", projectId] });

  const castTotal = cast.reduce((sum, r) => {
    const full = resourceTotal({
      days: parseNum(r.days),
      dayRate: parseNum(r.dayRate),
      fiscalRegime: r.fiscalRegime as FiscalRegime,
      mealAllowance: parseNum(r.mealAllowance),
      accommodation: parseNum(r.accommodation),
    });
    return sum + full * sceneRatio(r.id, castSceneMap, selectedScene);
  }, 0);

  const fmt = (n: number) =>
    n.toLocaleString("it-IT", { style: "currency", currency: "EUR" });

  const patchMutation = useMutation({
    mutationFn: (vars: {
      rowId: string;
      patch: Parameters<typeof updateBudgetCastRow>[0]["data"]["patch"];
    }) => updateBudgetCastRow({ data: vars }).then(unwrapResult),
    onSuccess: invalidate,
  });

  const addMutation = useMutation({
    mutationFn: (vars: { name: string }) =>
      addBudgetCastRow({
        data: { budgetId, name: vars.name },
      }).then(unwrapResult),
    onSuccess: () => {
      invalidate();
      setAddOpen(false);
      setNewName("");
    },
  });

  const removeMutation = useMutation({
    mutationFn: (rowId: string) =>
      removeBudgetCastRow({ data: { rowId } }).then(unwrapResult),
    onSuccess: invalidate,
  });

  if (cast.length === 0) {
    return (
      <div className={styles.widget}>
        <div className={styles.header}>
          <h3 className={styles.title}>{t("budget.cast.title")}</h3>
        </div>
        <p className={styles.empty}>{t("budget.cast.empty")}</p>
        <div className={styles.footer}>
          {addOpen ? (
            <form
              className={styles.addForm}
              onSubmit={(e) => {
                e.preventDefault();
                if (newName.trim()) addMutation.mutate({ name: newName.trim() });
              }}
            >
              <input
                className={styles.addInput}
                placeholder={t("budget.cast.actorNamePlaceholder")}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                autoFocus
              />
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
              {t("budget.cast.addActor")}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.widget}>
      <div className={styles.header}>
        <BudgetGauge
          value={castTotal}
          max={grandTotal}
          color="var(--color-cast, #6366f1)"
          label={fmt(castTotal)}
        />
        <div>
          <h3 className={styles.title}>{t("budget.cast.title")}</h3>
          {selectedScene !== null && (
            <p className={styles.sceneNote}>
              {t("budget.cast.sceneNote").replace(
                "{scene}",
                String(selectedScene),
              )}
            </p>
          )}
        </div>
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr className={styles.thead}>
              <th className={styles.th}>{t("budget.cast.colActor")}</th>
              <th className={`${styles.th} ${styles.numTh}`}>
                {t("budget.cast.colDays")}
              </th>
              <th className={`${styles.th} ${styles.numTh}`}>
                {t("budget.cast.colDayRate")}
              </th>
              <th className={styles.th}>{t("budget.cast.colRegime")}</th>
              <th className={`${styles.th} ${styles.numTh}`}>
                {t("budget.cast.colMeal")}
              </th>
              <th className={`${styles.th} ${styles.numTh}`}>
                {t("budget.cast.colAccommodation")}
              </th>
              <th className={`${styles.th} ${styles.numTh}`}>
                {t("budget.cast.colTotal")}
              </th>
              <th className={styles.th} />
            </tr>
          </thead>
          <tbody>
            {cast.map((row) => (
              <BudgetResourceRow
                key={row.id}
                id={row.id}
                name={row.name}
                days={parseNum(row.days)}
                dayRate={parseNum(row.dayRate)}
                fiscalRegime={row.fiscalRegime as FiscalRegime}
                mealAllowance={parseNum(row.mealAllowance)}
                accommodation={parseNum(row.accommodation)}
                sceneRatio={sceneRatio(row.id, castSceneMap, selectedScene)}
                onPatch={(patch) =>
                  patchMutation.mutate({ rowId: row.id, patch })
                }
                onRemove={() => removeMutation.mutate(row.id)}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className={styles.footer}>
        {addOpen ? (
          <form
            className={styles.addForm}
            onSubmit={(e) => {
              e.preventDefault();
              if (newName.trim()) addMutation.mutate({ name: newName.trim() });
            }}
          >
            <input
              className={styles.addInput}
              placeholder={t("budget.cast.actorNamePlaceholder")}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              autoFocus
            />
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
            + Aggiungi attore
          </button>
        )}
      </div>
    </div>
  );
}
