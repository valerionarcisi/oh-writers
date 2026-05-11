import { useMutation, useQueryClient } from "@tanstack/react-query";
import { resourceTotal } from "@oh-writers/domain";
import type { FiscalRegime } from "@oh-writers/domain";
import type { BudgetCast } from "~/features/budget/server/budget.server";
import { updateBudgetCastRow } from "~/features/budget/server/budget.server";
import { unwrapResult } from "@oh-writers/utils";
import { BudgetGauge } from "./BudgetGauge";
import { BudgetResourceRow } from "../BudgetResourceRow";
import styles from "./CastWidget.module.css";

interface CastWidgetProps {
  cast: BudgetCast[];
  grandTotal: number;
  projectId: string;
}

const parseNum = (v: string) => Number(v);

export function CastWidget({ cast, grandTotal, projectId }: CastWidgetProps) {
  const qc = useQueryClient();

  const castTotal = cast.reduce(
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

  const patchMutation = useMutation({
    mutationFn: (vars: {
      rowId: string;
      patch: Parameters<typeof updateBudgetCastRow>[0]["data"]["patch"];
    }) => updateBudgetCastRow({ data: vars }).then(unwrapResult),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["budget-cast-crew", projectId] }),
  });

  if (cast.length === 0) {
    return (
      <div className={styles.widget}>
        <div className={styles.header}>
          <h3 className={styles.title}>Cast</h3>
        </div>
        <p className={styles.empty}>
          Genera il budget per popolare il cast dal breakdown.
        </p>
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
        <h3 className={styles.title}>Cast</h3>
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr className={styles.thead}>
              <th className={styles.th}>Attore</th>
              <th className={`${styles.th} ${styles.numTh}`}>Gg</th>
              <th className={`${styles.th} ${styles.numTh}`}>€/g</th>
              <th className={styles.th}>Regime</th>
              <th className={`${styles.th} ${styles.numTh}`}>Vitto</th>
              <th className={`${styles.th} ${styles.numTh}`}>Pernotto</th>
              <th className={`${styles.th} ${styles.numTh}`}>Totale</th>
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
                onPatch={(patch) =>
                  patchMutation.mutate({ rowId: row.id, patch })
                }
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
