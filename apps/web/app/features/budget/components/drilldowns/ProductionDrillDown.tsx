import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { SegmentedControl } from "@oh-writers/ui";
import { unwrapResult } from "@oh-writers/utils";
import type { Budget, BudgetLine, TranslationKey } from "@oh-writers/domain";
import { useTranslation } from "~/features/i18n";
import {
  updateBudgetLine,
  addBudgetLine,
  removeBudgetLine,
} from "../../server/budget.server";
import styles from "./ProductionDrillDown.module.css";

const eur = new Intl.NumberFormat("it-IT", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});
const eurAmount = (n: number) => eur.format(Math.round(n));

const PRODUCTION_TABS = [
  {
    id: "locations",
    labelKey: "budget.production.tab.locations",
    categories: ["locations"],
    colorVar: "--ds-cat-locations",
  },
  {
    id: "fotografia",
    labelKey: "budget.production.tab.fotografia",
    categories: ["equipment"],
    colorVar: "--ds-cat-fotografia",
  },
  {
    id: "suono",
    labelKey: "budget.production.tab.suono",
    categories: ["sound"],
    colorVar: "--ds-cat-suono",
  },
  {
    id: "scenografia",
    labelKey: "budget.production.tab.scenografia",
    categories: ["props", "set_dress"],
    colorVar: "--ds-cat-scenografia",
  },
  {
    id: "costumi",
    labelKey: "budget.production.tab.costumi",
    categories: ["wardrobe", "makeup"],
    colorVar: "--ds-cat-costumi",
  },
  {
    id: "vehicles",
    labelKey: "budget.production.tab.vehicles",
    categories: ["vehicles"],
    colorVar: "--ds-cat-vehicles",
  },
  {
    id: "comparse",
    labelKey: "budget.production.tab.comparse",
    categories: ["extras", "atmosphere"],
    colorVar: "--ds-cat-comparse",
  },
  {
    id: "vfx",
    labelKey: "budget.production.tab.vfx",
    categories: ["vfx", "sfx"],
    colorVar: "--ds-cat-vfx",
  },
  {
    id: "stunts",
    labelKey: "budget.production.tab.stunts",
    categories: ["stunts"],
    colorVar: "--ds-cat-vfx",
  },
] as const satisfies ReadonlyArray<{
  id: string;
  labelKey: TranslationKey;
  categories: readonly string[];
  colorVar: string;
}>;

type ProductionTabId = (typeof PRODUCTION_TABS)[number]["id"];

const lineEffective = (l: BudgetLine): number =>
  l.actual ?? (l.rate ?? 0) * (l.quantity ?? 1);

const lineStatus = (l: BudgetLine): "ok" | "warn" | "missing" => {
  if ((l.rate ?? 0) <= 0) return "missing";
  if (l.actual !== null && l.actual !== (l.rate ?? 0) * (l.quantity ?? 1))
    return "warn";
  return "ok";
};

const statusLabelKey = (s: "ok" | "warn" | "missing"): TranslationKey =>
  s === "ok"
    ? "budget.production.statusOk"
    : s === "warn"
      ? "budget.production.statusWarn"
      : "budget.production.statusMissing";

interface ProductionDrillDownProps {
  readonly budget: Budget;
  readonly budgetId: string;
  readonly initialTab?: ProductionTabId;
  readonly projectId: string;
}

export function ProductionDrillDown({
  budget,
  budgetId,
  initialTab,
  projectId,
}: ProductionDrillDownProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<ProductionTabId>(initialTab ?? "locations");
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newQty, setNewQty] = useState("1");
  const [newRate, setNewRate] = useState("0");
  const qc = useQueryClient();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["budget", projectId] });
    qc.invalidateQueries({ queryKey: ["budget-overview", projectId] });
  };

  const updateLineMutation = useMutation({
    mutationFn: (vars: {
      lineId: string;
      patch: { actual?: number | null; rate?: number | null };
    }) => updateBudgetLine({ data: vars }).then(unwrapResult),
    onSuccess: invalidate,
  });

  const addLineMutation = useMutation({
    mutationFn: (vars: {
      name: string;
      quantity: number;
      rate: number;
      linkedCategory: string;
    }) =>
      addBudgetLine({
        data: {
          budgetId,
          topSheet: "production",
          name: vars.name,
          costType: "flat",
          quantity: vars.quantity,
          rate: vars.rate,
          linkedCategory: vars.linkedCategory,
        },
      }).then(unwrapResult),
    onSuccess: () => {
      invalidate();
      setAddOpen(false);
      setNewName("");
      setNewQty("1");
      setNewRate("0");
    },
  });

  const removeLineMutation = useMutation({
    mutationFn: (lineId: string) =>
      removeBudgetLine({ data: { lineId } }).then(unwrapResult),
    onSuccess: invalidate,
  });

  const activeTab =
    PRODUCTION_TABS.find((t) => t.id === tab) ?? PRODUCTION_TABS[0]!;

  const tabLines = useMemo(() => {
    return budget.lines.filter(
      (l) =>
        l.topSheet === "production" &&
        l.linkedCategory !== null &&
        (activeTab.categories as readonly string[]).includes(l.linkedCategory),
    );
  }, [budget.lines, activeTab]);

  const tabTotal = tabLines.reduce((s, l) => s + lineEffective(l), 0);
  const missing = tabLines.filter((l) => (l.rate ?? 0) <= 0).length;

  return (
    <div className={styles.root}>
      <nav
        className={styles.subnav}
        role="tablist"
        aria-label={t("budget.production.subnavAriaLabel")}
      >
        <SegmentedControl
          options={PRODUCTION_TABS.map((tab) => ({
            id: tab.id,
            label: t(tab.labelKey),
          }))}
          activeId={tab}
          onSelect={(id) => setTab(id as ProductionTabId)}
          ariaLabel={t("budget.production.subnavOptionAriaLabel")}
        />
      </nav>

      <header
        className={styles.head}
        style={{
          ["--cat-color" as string]: `var(${activeTab.colorVar})`,
        }}
      >
        <div>
          <div className={styles.eyebrow}>
            {t("budget.production.eyebrow")}
          </div>
          <h2 className={styles.title}>{t(activeTab.labelKey)}</h2>
          <div className={styles.meta}>
            {t("budget.production.linesTotal")
              .replace("{count}", String(tabLines.length))
              .replace("{total}", eurAmount(tabTotal))}
            {missing > 0 &&
              t("budget.production.missingRates").replace(
                "{count}",
                String(missing),
              )}
          </div>
        </div>
      </header>

      {tabLines.length === 0 ? (
        <div className={styles.empty}>
          {t("budget.production.empty").replace(
            "{category}",
            t(activeTab.labelKey).toLowerCase(),
          )}
        </div>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>{t("budget.production.colLine")}</th>
              <th className={styles.colNum}>{t("budget.production.colQty")}</th>
              <th className={styles.colNum}>
                {t("budget.production.colUnitRate")}
              </th>
              <th className={styles.colNum}>
                {t("budget.production.colTotal")}
              </th>
              <th>{t("budget.production.colStatus")}</th>
              <th
                className={styles.colAction}
                aria-label={t("budget.production.colActions")}
              />
            </tr>
          </thead>
          <tbody>
            {tabLines.map((line) => {
              const status = lineStatus(line);
              return (
                <tr key={line.id}>
                  <td>{line.name}</td>
                  <td className={styles.colNum}>
                    {(line.quantity ?? 1).toLocaleString("it-IT", {
                      maximumFractionDigits: 2,
                    })}
                  </td>
                  <td className={styles.colNum}>
                    <EditableRate
                      value={line.rate ?? 0}
                      onCommit={(v) =>
                        updateLineMutation.mutate({
                          lineId: line.id,
                          patch: { rate: v },
                        })
                      }
                      disabled={updateLineMutation.isPending}
                    />
                  </td>
                  <td className={styles.colNum}>
                    {eurAmount(lineEffective(line))}
                  </td>
                  <td>
                    <span className={styles.statusPill} data-status={status}>
                      {t(statusLabelKey(status))}
                    </span>
                  </td>
                  <td className={styles.colAction}>
                    <button
                      type="button"
                      className={styles.removeBtn}
                      aria-label={t("budget.production.removeLine").replace(
                        "{name}",
                        line.name,
                      )}
                      onClick={() => removeLineMutation.mutate(line.id)}
                      disabled={removeLineMutation.isPending}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td>{t("budget.production.total")}</td>
              <td />
              <td />
              <td className={styles.colNum}>{eurAmount(tabTotal)}</td>
              <td />
              <td />
            </tr>
          </tfoot>
        </table>
      )}

      <div className={styles.addRowFooter}>
        {addOpen ? (
          <form
            className={styles.addForm}
            onSubmit={(e) => {
              e.preventDefault();
              const name = newName.trim();
              const qty = parseFloat(newQty);
              const rate = parseFloat(newRate);
              if (!name || isNaN(qty) || isNaN(rate)) return;
              const cat = activeTab.categories[0]!;
              addLineMutation.mutate({
                name,
                quantity: qty,
                rate,
                linkedCategory: cat,
              });
            }}
          >
            <input
              className={styles.addInput}
              placeholder={t("budget.production.linePlaceholder")}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              autoFocus
            />
            <input
              className={styles.addInputSmall}
              type="number"
              min="0"
              step="0.01"
              placeholder={t("budget.production.qtyPlaceholder")}
              value={newQty}
              onChange={(e) => setNewQty(e.target.value)}
            />
            <input
              className={styles.addInputSmall}
              type="number"
              min="0"
              step="0.01"
              placeholder={t("budget.production.unitRatePlaceholder")}
              value={newRate}
              onChange={(e) => setNewRate(e.target.value)}
            />
            <button
              type="submit"
              className={styles.addConfirm}
              disabled={addLineMutation.isPending}
            >
              {t("budget.production.addConfirm")}
            </button>
            <button
              type="button"
              className={styles.addCancel}
              onClick={() => setAddOpen(false)}
            >
              {t("budget.production.addCancel")}
            </button>
          </form>
        ) : (
          <button
            type="button"
            className={styles.addTrigger}
            onClick={() => setAddOpen(true)}
          >
            {t("budget.production.addLineTo").replace(
              "{category}",
              t(activeTab.labelKey),
            )}
          </button>
        )}
      </div>
    </div>
  );
}

interface EditableRateProps {
  readonly value: number;
  readonly onCommit: (v: number) => void;
  readonly disabled?: boolean;
}

function EditableRate({ value, onCommit, disabled }: EditableRateProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  if (editing) {
    return (
      <input
        className={styles.input}
        type="number"
        min="0"
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setEditing(false);
          const n = parseFloat(draft);
          if (!isNaN(n) && n >= 0 && n !== value) onCommit(n);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") setEditing(false);
        }}
      />
    );
  }
  return (
    <button
      type="button"
      className={styles.cellBtn}
      disabled={disabled}
      onClick={() => {
        setDraft(String(value));
        setEditing(true);
      }}
    >
      {eurAmount(value)}
    </button>
  );
}
