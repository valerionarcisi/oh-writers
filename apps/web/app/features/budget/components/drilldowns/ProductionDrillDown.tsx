import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { SegmentedControl } from "@oh-writers/ui";
import { unwrapResult } from "@oh-writers/utils";
import type { Budget, BudgetLine } from "@oh-writers/domain";
import { updateBudgetLine } from "../../server/budget.server";
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
    label: "Locations",
    categories: ["locations"],
    colorVar: "--ds-cat-locations",
  },
  {
    id: "fotografia",
    label: "Fotografia",
    categories: ["equipment"],
    colorVar: "--ds-cat-fotografia",
  },
  {
    id: "suono",
    label: "Suono",
    categories: ["sound"],
    colorVar: "--ds-cat-suono",
  },
  {
    id: "scenografia",
    label: "Scenografia",
    categories: ["props", "set_dress"],
    colorVar: "--ds-cat-scenografia",
  },
  {
    id: "costumi",
    label: "Costumi & Trucco",
    categories: ["wardrobe", "makeup"],
    colorVar: "--ds-cat-costumi",
  },
  {
    id: "vehicles",
    label: "Veicoli",
    categories: ["vehicles"],
    colorVar: "--ds-cat-vehicles",
  },
  {
    id: "comparse",
    label: "Comparse",
    categories: ["extras", "atmosphere"],
    colorVar: "--ds-cat-comparse",
  },
  {
    id: "vfx",
    label: "VFX / SFX",
    categories: ["vfx", "sfx"],
    colorVar: "--ds-cat-vfx",
  },
  {
    id: "stunts",
    label: "Stunt",
    categories: ["stunts"],
    colorVar: "--ds-cat-vfx",
  },
] as const;

type ProductionTabId = (typeof PRODUCTION_TABS)[number]["id"];

const lineEffective = (l: BudgetLine): number =>
  l.actual ?? (l.rate ?? 0) * (l.quantity ?? 1);

const lineStatus = (l: BudgetLine): "ok" | "warn" | "missing" => {
  if ((l.rate ?? 0) <= 0) return "missing";
  if (l.actual !== null && l.actual !== (l.rate ?? 0) * (l.quantity ?? 1))
    return "warn";
  return "ok";
};

const statusLabel = (s: "ok" | "warn" | "missing"): string =>
  s === "ok" ? "Confermata" : s === "warn" ? "Modificata" : "Senza tariffa";

interface ProductionDrillDownProps {
  readonly budget: Budget;
  readonly initialTab?: ProductionTabId;
  readonly projectId: string;
}

export function ProductionDrillDown({
  budget,
  initialTab,
  projectId,
}: ProductionDrillDownProps) {
  const [tab, setTab] = useState<ProductionTabId>(initialTab ?? "locations");
  const qc = useQueryClient();

  const updateLineMutation = useMutation({
    mutationFn: (vars: {
      lineId: string;
      patch: { actual?: number | null; rate?: number | null };
    }) => updateBudgetLine({ data: vars }).then(unwrapResult),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["budget", projectId] });
      qc.invalidateQueries({ queryKey: ["budget-overview", projectId] });
    },
  });

  const activeTab = PRODUCTION_TABS.find((t) => t.id === tab) ?? PRODUCTION_TABS[0]!;

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
        aria-label="Sotto-categorie produzione"
      >
        <SegmentedControl
          options={PRODUCTION_TABS.map((t) => ({
            id: t.id,
            label: t.label,
          }))}
          activeId={tab}
          onSelect={(id) => setTab(id as ProductionTabId)}
          ariaLabel="Sotto-categoria produzione"
        />
      </nav>

      <header
        className={styles.head}
        style={{
          ["--cat-color" as string]: `var(${activeTab.colorVar})`,
        }}
      >
        <div>
          <div className={styles.eyebrow}>Categoria produzione</div>
          <h2 className={styles.title}>{activeTab.label}</h2>
          <div className={styles.meta}>
            {tabLines.length} voci · totale {eurAmount(tabTotal)}
            {missing > 0 && ` · ${missing} senza tariffa`}
          </div>
        </div>
      </header>

      {tabLines.length === 0 ? (
        <div className={styles.empty}>
          Nessuna voce per {activeTab.label.toLowerCase()}. Genera il budget per
          popolarla dal breakdown.
        </div>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Voce</th>
              <th className={styles.colNum}>Q.tà</th>
              <th className={styles.colNum}>€/u</th>
              <th className={styles.colNum}>Totale</th>
              <th>Stato</th>
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
                    <span
                      className={styles.statusPill}
                      data-status={status}
                    >
                      {statusLabel(status)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td>Totale</td>
              <td />
              <td />
              <td className={styles.colNum}>{eurAmount(tabTotal)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      )}
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
