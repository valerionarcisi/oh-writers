import { Suspense } from "react";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { unwrapResult } from "@oh-writers/utils";
import { sceneCostEstimateOptions } from "../hooks/useBreakdown";
import { getBudget, addBudgetLine } from "~/features/budget/server/budget.server";
import { useCesareOpen } from "~/features/app-shell";
import styles from "./SceneCostPanel.module.css";

interface Props {
  projectId: string;
  sceneNumber: number;
  sceneLabel: string;
}

const formatEur = (n: number): string =>
  `€ ${Math.round(n).toLocaleString("it-IT")}`;

const difficultyLabel = (d: number): string => {
  if (d <= 1) return "molto bassa";
  if (d === 2) return "bassa";
  if (d === 3) return "media";
  if (d === 4) return "alta";
  return "molto alta";
};

export function SceneCostPanel(props: Props) {
  return (
    <Suspense
      fallback={
        <div className={styles.card} data-testid="scene-cost-loading">
          <p className={styles.empty}>Calcolo costo scena…</p>
        </div>
      }
    >
      <SceneCostPanelContent {...props} />
    </Suspense>
  );
}

function SceneCostPanelContent({ projectId, sceneNumber, sceneLabel }: Props) {
  const { data: estimate } = useSuspenseQuery(
    sceneCostEstimateOptions(projectId, sceneNumber),
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
        <span className={styles.eyebrow}>Costo stimato</span>
        <span className={styles.sceneLabel}>
          Sc. {sceneNumber} {sceneLabel}
        </span>
      </header>

      <div className={styles.total}>
        <span className={styles.totalAmount}>{formatEur(estimate.total)}</span>
        <span className={styles.totalUnit}>/ giornata</span>
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
        <span className={styles.difficultyLabel}>Difficoltà</span>
        <span
          className={styles.difficultyDots}
          aria-label={`Difficoltà ${difficultyLabel(estimate.difficulty)}`}
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
          {difficultyLabel(estimate.difficulty)}
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
          <span aria-hidden="true">✦</span> Chiedi a Cesare
        </button>
        <button
          type="button"
          className={styles.addBtn}
          onClick={() => addToBudget.mutate()}
          disabled={addToBudget.isPending}
          data-testid="scene-cost-add-to-budget"
        >
          {addToBudget.isPending ? "Aggiungo…" : "Aggiungi al budget"}
        </button>
      </div>

      {addToBudget.isError && (
        <p className={styles.error} role="status">
          {addToBudget.error instanceof Error
            ? addToBudget.error.message
            : "Errore durante l'aggiunta al budget"}
        </p>
      )}
      {addToBudget.isSuccess && (
        <p className={styles.success} role="status">
          Righe aggiunte al budget.
        </p>
      )}
    </div>
  );
}
