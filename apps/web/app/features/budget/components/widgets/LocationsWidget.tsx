import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { unwrapResult } from "@oh-writers/utils";
import type { BudgetLine } from "@oh-writers/domain";
import { updateBudgetLine } from "~/features/budget/server/budget.server";
import { useTranslation } from "~/features/i18n";
import styles from "./LocationsWidget.module.css";

const fmt = (n: number) =>
  n.toLocaleString("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  });

const lineEffective = (l: BudgetLine): number =>
  l.actual ?? (l.rate ?? 0) * (l.quantity ?? 1);

function EditableCell({
  value,
  field,
  lineId,
  projectId,
}: {
  value: number | null;
  field: "rate" | "actual";
  lineId: string;
  projectId: string;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const patchMutation = useMutation({
    mutationFn: (patch: { rate?: number | null; actual?: number | null }) =>
      updateBudgetLine({ data: { lineId, patch } }).then(unwrapResult),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["budget", projectId] });
      setEditing(false);
    },
  });

  const commit = () => {
    const n = parseFloat(draft);
    if (!isNaN(n) && n >= 0) patchMutation.mutate({ [field]: n });
    else setEditing(false);
  };

  if (editing) {
    return (
      <input
        className={styles.cellInput}
        type="number"
        min="0"
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(false);
        }}
      />
    );
  }

  return (
    <button
      type="button"
      className={styles.cellBtn}
      onClick={() => {
        setDraft(String(value ?? ""));
        setEditing(true);
      }}
    >
      {value !== null ? fmt(value) : "—"}
    </button>
  );
}

interface PerElementWidgetProps {
  icon: string;
  title: string;
  lines: BudgetLine[];
  activeElementIds: Set<string>;
  projectId: string;
}

function PerElementWidget({
  icon,
  title,
  lines,
  activeElementIds,
  projectId,
}: PerElementWidgetProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const total = lines.reduce((sum, l) => sum + lineEffective(l), 0);

  return (
    <div className={styles.widget}>
      <div className={styles.header} onClick={() => setOpen((p) => !p)}>
        <div className={styles.headerLeft}>
          <span className={styles.icon}>{icon}</span>
          <span className={styles.title}>{title}</span>
          {lines.length > 0 && (
            <span className={styles.badge}>{lines.length}</span>
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
          {lines.length === 0 ? (
            <p className={styles.empty}>{t("budget.empty.perElement")}</p>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr className={styles.thead}>
                    <th>{t("budget.perElement.colName")}</th>
                    <th className={styles.numTh}>
                      {t("budget.perElement.colDays")}
                    </th>
                    <th className={styles.numTh}>
                      {t("budget.perElement.colDayRate")}
                    </th>
                    <th className={styles.numTh}>
                      {t("budget.perElement.colActual")}
                    </th>
                    <th className={styles.numTh}>
                      {t("budget.perElement.colTotal")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => {
                    const isStale =
                      line.linkedElementId !== null &&
                      !activeElementIds.has(line.linkedElementId);
                    return (
                      <tr key={line.id} className={styles.row}>
                        <td className={styles.nameCell}>
                          {line.name}
                          {isStale && (
                            <span className={styles.stale}>
                              {t("budget.perElement.removedFromBreakdown")}
                            </span>
                          )}
                        </td>
                        <td className={styles.numCell}>
                          {line.quantity ?? "—"}
                        </td>
                        <td className={styles.numCell}>
                          <EditableCell
                            value={line.rate}
                            field="rate"
                            lineId={line.id}
                            projectId={projectId}
                          />
                        </td>
                        <td className={styles.numCell}>
                          <EditableCell
                            value={line.actual}
                            field="actual"
                            lineId={line.id}
                            projectId={projectId}
                          />
                        </td>
                        <td>{fmt(lineEffective(line))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function LocationsWidget(
  props: Omit<PerElementWidgetProps, "icon" | "title">,
) {
  const { t } = useTranslation();
  return (
    <PerElementWidget
      icon="📍"
      title={t("budget.perElement.locationsTitle")}
      {...props}
    />
  );
}

export function VehiclesWidget(
  props: Omit<PerElementWidgetProps, "icon" | "title">,
) {
  const { t } = useTranslation();
  return (
    <PerElementWidget
      icon="🚗"
      title={t("budget.perElement.vehiclesTitle")}
      {...props}
    />
  );
}
