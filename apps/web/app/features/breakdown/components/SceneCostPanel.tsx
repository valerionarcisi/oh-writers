import { Suspense } from "react";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { unwrapResult } from "@oh-writers/utils";
import { sceneCostEstimateOptions } from "../hooks/useBreakdown";
import {
  getBudget,
  addBudgetLine,
} from "~/features/budget/server/budget.server";
import { useCesareOpen } from "~/features/app-shell";
import { useTranslation } from "~/features/i18n";
import styles from "./SceneCostPanel.module.css";

type TranslateFn = ReturnType<typeof useTranslation>["t"];

interface Props {
  projectId: string;
  sceneNumber: number;
  sceneLabel: string;
  versionId: string;
}

const formatEur = (n: number): string =>
  `€ ${Math.round(n).toLocaleString("it-IT")}`;

const difficultyLabel = (d: number, t: TranslateFn): string => {
  if (d <= 1) return t("breakdown.cost.difficulty.veryLow");
  if (d === 2) return t("breakdown.cost.difficulty.low");
  if (d === 3) return t("breakdown.cost.difficulty.medium");
  if (d === 4) return t("breakdown.cost.difficulty.high");
  return t("breakdown.cost.difficulty.veryHigh");
};

export function SceneCostPanel(props: Props) {
  const { t } = useTranslation();
  return (
    <Suspense
      fallback={
        <div className={styles.card} data-testid="scene-cost-loading">
          <p className={styles.empty}>{t("breakdown.cost.calculating")}</p>
        </div>
      }
    >
      <SceneCostPanelContent {...props} />
    </Suspense>
  );
}

function SceneCostPanelContent({
  projectId,
  sceneNumber,
  sceneLabel,
  versionId,
}: Props) {
  const { t } = useTranslation();
  const { data: estimate } = useSuspenseQuery(
    sceneCostEstimateOptions(projectId, sceneNumber, versionId),
  );
  const openCesare = useCesareOpen();

  const addToBudget = useMutation({
    mutationFn: async () => {
      const budget = unwrapResult(await getBudget({ data: { projectId } }));
      if (!budget) throw new Error("Budget non ancora generato");
      const linkedCategoryByCategory: Record<string, string | null> = {
        cast: "cast",
        crew: "crew",
        locations: "locations",
        equipment: "equipment",
        sfx: "sfx",
        vfx: "vfx",
        catering: null,
      };
      for (const line of estimate.lines) {
        if (line.amount <= 0) continue;
        unwrapResult(
          await addBudgetLine({
            data: {
              budgetId: budget.id,
              topSheet:
                line.category === "cast"
                  ? "above_the_line"
                  : line.category === "crew"
                    ? "crew"
                    : "production",
              name: `Sc.${sceneNumber} — ${line.description}`,
              costType: "flat",
              quantity: 1,
              rate: line.amount,
              linkedCategory: linkedCategoryByCategory[line.category] ?? null,
            },
          }),
        );
      }
    },
  });

  const dots = Array.from({ length: 5 }, (_, i) => i < estimate.difficulty);

  return (
    <div className={styles.card} data-testid="scene-cost-panel">
      <header className={styles.header}>
        <span className={styles.eyebrow}>{t("breakdown.cost.estimated")}</span>
        <span className={styles.sceneLabel}>
          {t("breakdown.cost.scenePrefix")}
          {sceneNumber} {sceneLabel}
        </span>
      </header>

      <div className={styles.total}>
        <span className={styles.totalAmount}>{formatEur(estimate.total)}</span>
        <span className={styles.totalUnit}>{t("breakdown.cost.perDay")}</span>
      </div>

      <ul className={styles.lines}>
        {estimate.lines.map((line, idx) => (
          <li className={styles.line} key={`${line.category}-${idx}`}>
            <span className={styles.lineDescription}>{line.description}</span>
            <span className={styles.lineAmount} data-num>
              {formatEur(line.amount)}
            </span>
          </li>
        ))}
      </ul>

      <div className={styles.difficulty}>
        <span className={styles.difficultyLabel}>
          {t("breakdown.cost.difficulty")}
        </span>
        <span
          className={styles.difficultyDots}
          aria-label={`${t("breakdown.cost.difficultyAriaPrefix")}${difficultyLabel(
            estimate.difficulty,
            t,
          )}`}
        >
          {dots.map((on, i) => (
            <span
              key={i}
              className={styles.difficultyDot}
              data-on={on || undefined}
              aria-hidden="true"
            />
          ))}
        </span>
        <span className={styles.difficultyText}>
          {difficultyLabel(estimate.difficulty, t)}
        </span>
      </div>

      {estimate.notes.length > 0 && (
        <ul className={styles.notes}>
          {estimate.notes.map((note, i) => (
            <li key={i} className={styles.note}>
              {note}
            </li>
          ))}
        </ul>
      )}

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.askBtn}
          onClick={() => openCesare()}
          data-testid="scene-cost-ask-cesare"
        >
          <span aria-hidden="true">✦</span> {t("breakdown.cost.askCesare")}
        </button>
        <button
          type="button"
          className={styles.addBtn}
          onClick={() => addToBudget.mutate()}
          disabled={addToBudget.isPending}
          data-testid="scene-cost-add-to-budget"
        >
          {addToBudget.isPending
            ? t("breakdown.cost.adding")
            : t("breakdown.cost.addToBudget")}
        </button>
      </div>

      {addToBudget.isError && (
        <p className={styles.error} role="status">
          {addToBudget.error instanceof Error
            ? addToBudget.error.message
            : t("breakdown.cost.addError")}
        </p>
      )}
      {addToBudget.isSuccess && (
        <p className={styles.success} role="status">
          {t("breakdown.cost.added")}
        </p>
      )}
    </div>
  );
}
