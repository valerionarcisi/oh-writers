import { useState, useEffect, useRef } from "react";
import {
  useQuery,
  useMutation,
  useQueryClient,
  queryOptions,
} from "@tanstack/react-query";
import { unwrapResult } from "@oh-writers/utils";
import { useTranslation } from "~/features/i18n";
import {
  getBudgetCaps,
  setBudgetCap,
  removeBudgetCap,
  type BudgetCapDto,
} from "../server/budget-caps.server";
import styles from "./BudgetCapBar.module.css";

const capsQueryOptions = (projectId: string) =>
  queryOptions({
    queryKey: ["budget-caps", projectId],
    queryFn: () => getBudgetCaps({ data: { projectId } }).then(unwrapResult),
  });

const formatCents = (cents: number): string =>
  new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(cents / 100);

interface BudgetCapBarProps {
  readonly projectId: string;
  readonly currentSpendEuros: number;
}

export function BudgetCapBar({
  projectId,
  currentSpendEuros,
}: BudgetCapBarProps) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: caps } = useQuery(capsQueryOptions(projectId));
  const globalCap = (caps ?? []).find((c: BudgetCapDto) => c.topSheet === null);

  const setCapMutation = useMutation({
    mutationFn: (amountCents: number) =>
      setBudgetCap({
        data: {
          projectId,
          scope: { kind: "global" },
          amountCents,
        },
      }).then(unwrapResult),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["budget-caps", projectId] });
    },
  });

  const removeCapMutation = useMutation({
    mutationFn: () =>
      removeBudgetCap({
        data: { projectId, scope: { kind: "global" } },
      }).then(unwrapResult),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["budget-caps", projectId] });
    },
  });

  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  const startEditing = () => {
    setDraft(globalCap ? String(Math.round(globalCap.amountCents / 100)) : "");
    setIsEditing(true);
  };

  const commit = () => {
    const value = parseFloat(draft);
    setIsEditing(false);
    if (!Number.isFinite(value) || value < 0) return;
    if (value === 0 && globalCap) {
      removeCapMutation.mutate();
      return;
    }
    setCapMutation.mutate(Math.round(value * 100));
  };

  const currentCents = Math.round(currentSpendEuros * 100);
  const capCents = globalCap?.amountCents ?? null;
  const percent =
    capCents !== null && capCents > 0
      ? Math.min((currentCents / capCents) * 100, 110)
      : 0;
  const isOver = capCents !== null && currentCents > capCents;
  const residualCents = capCents !== null ? capCents - currentCents : null;

  return (
    <div
      className={styles.bar}
      data-testid="budget-cap-bar"
      data-has-cap={globalCap !== undefined ? "true" : "false"}
    >
      <span className={styles.label}>{t("budget.cap.label")}</span>

      {isEditing ? (
        <input
          ref={inputRef}
          className={styles.input}
          type="number"
          min={0}
          step={100}
          inputMode="numeric"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setIsEditing(false);
          }}
          placeholder="50000"
          aria-label={t("budget.cap.inputAriaLabel")}
          data-testid="budget-cap-input"
        />
      ) : (
        <button
          type="button"
          className={styles.editButton}
          onClick={startEditing}
          data-testid="budget-cap-edit"
        >
          <span className={styles.capValue}>
            {capCents !== null ? (
              formatCents(capCents)
            ) : (
              <span className={styles.placeholder}>
                {t("budget.cap.placeholder")}
              </span>
            )}
          </span>
          <span aria-hidden="true"> ✎</span>
        </button>
      )}

      {capCents !== null && (
        <>
          <div
            className={styles.progress}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={capCents}
            aria-valuenow={currentCents}
            aria-label={t("budget.cap.progressAriaLabel")}
          >
            <div
              className={`${styles.progressFill} ${
                isOver ? styles.progressFillOver : ""
              }`}
              style={{ width: `${Math.min(percent, 100)}%` }}
            />
          </div>
          <span className={styles.meta}>
            {formatCents(currentCents)} ·{" "}
            <span className={isOver ? styles.overspend : ""}>
              {isOver
                ? t("budget.cap.over").replace(
                    "{amount}",
                    formatCents(Math.abs(residualCents ?? 0)),
                  )
                : t("budget.cap.remaining").replace(
                    "{amount}",
                    formatCents(residualCents ?? 0),
                  )}
            </span>
          </span>
        </>
      )}
    </div>
  );
}
