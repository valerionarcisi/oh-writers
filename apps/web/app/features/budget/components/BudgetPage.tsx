import {
  useSuspenseQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";
import { resourceTotal } from "@oh-writers/domain";
import type { FiscalRegime } from "@oh-writers/domain";
import {
  getBudget,
  generateBudget,
  getCastAndCrew,
} from "../server/budget.server";
import { unwrapResult } from "@oh-writers/utils";
import { TotalWidget } from "./widgets/TotalWidget";
import { CastWidget } from "./widgets/CastWidget";
import { CrewWidget } from "./widgets/CrewWidget";
import styles from "./BudgetPage.module.css";

const budgetQueryOptions = (projectId: string) =>
  queryOptions({
    queryKey: ["budget", projectId],
    queryFn: () => getBudget({ data: { projectId } }).then(unwrapResult),
  });

const castCrewQueryOptions = (projectId: string) =>
  queryOptions({
    queryKey: ["budget-cast-crew", projectId],
    queryFn: () => getCastAndCrew({ data: { projectId } }).then(unwrapResult),
  });

const parseNum = (v: string) => Number(v);

interface BudgetPageProps {
  projectId: string;
}

export function BudgetPage({ projectId }: BudgetPageProps) {
  const qc = useQueryClient();
  const { data: budget } = useSuspenseQuery(budgetQueryOptions(projectId));
  const { data: castCrew } = useSuspenseQuery(castCrewQueryOptions(projectId));

  const generateMutation = useMutation({
    mutationFn: () =>
      generateBudget({ data: { projectId } }).then(unwrapResult),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["budget", projectId] });
      qc.invalidateQueries({ queryKey: ["budget-cast-crew", projectId] });
    },
  });

  const cast = castCrew?.cast ?? [];
  const crew = castCrew?.crew ?? [];

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

  const crewTotal = crew
    .filter((r) => r.enabled)
    .reduce(
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

  // equipment + misc totals from budget_lines
  const equipmentTotal =
    budget?.lines
      .filter((l) => l.topSheet === "production")
      .reduce(
        (sum, l) => sum + (l.actual ?? l.rate ?? 0) * (l.quantity ?? 1),
        0,
      ) ?? 0;

  const miscTotal =
    budget?.lines
      .filter((l) => l.topSheet === "contingency")
      .reduce(
        (sum, l) => sum + (l.actual ?? l.rate ?? 0) * (l.quantity ?? 1),
        0,
      ) ?? 0;

  const grandTotal = castTotal + crewTotal + equipmentTotal + miscTotal;
  const contingencyPercent = budget?.contingencyPercent ?? 10;
  const shootingDays = budget?.shootingDays ?? null;

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <span className={styles.toolbarLabel}>Giorni ripresa:</span>
          <span className={styles.toolbarValue}>{shootingDays ?? "—"}</span>
          <span className={styles.toolbarLabel}>Contingenza:</span>
          <span className={styles.toolbarValue}>{contingencyPercent}%</span>
        </div>
        <button
          type="button"
          className={styles.generateBtn}
          onClick={() => generateMutation.mutate()}
          disabled={generateMutation.isPending}
        >
          {budget ? "Rigenera" : "Genera budget"}
        </button>
      </div>

      {generateMutation.isError && (
        <div className={styles.error}>
          Errore nella generazione. Verifica che il breakdown sia stato
          completato.
        </div>
      )}

      <div className={styles.grid}>
        <div className={styles.sideCol}>
          <TotalWidget
            castTotal={castTotal}
            crewTotal={crewTotal}
            equipmentTotal={equipmentTotal}
            miscTotal={miscTotal}
            contingencyPercent={contingencyPercent}
          />
        </div>
        <div className={styles.mainCol}>
          <CastWidget
            cast={cast}
            grandTotal={grandTotal}
            projectId={projectId}
          />
          {(crew.length > 0 || budget) && (
            <CrewWidget
              crew={crew}
              budgetId={budget?.id ?? ""}
              grandTotal={grandTotal}
              projectId={projectId}
            />
          )}
        </div>
      </div>
    </div>
  );
}
